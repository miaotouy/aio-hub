import type { LlmResponseChunk, TokenUsage } from "@aiohub/llm-core";

import {
  parseToolSummaryItems,
  type ToolSummaryItem,
} from "../../../../utils/vcpToolSummary";
import { parseVcpToolMessageDisplay } from "../../../../utils/vcpToolBatchDisplay";

export interface VcpResponseSegment {
  index: number;
  kind: "assistant" | "tool";
  responseId?: string;
  content: string;
  reasoningContent: string;
  contextReplay: { prefix: string; suffix: string };
  finishReason?: string;
  usage?: TokenUsage;
  toolStatus?: "success" | "error";
  toolCalls?: Array<{
    toolName: string;
    status: "success" | "error" | "denied" | "completed";
  }>;
}

export interface VcpSegmentUpdate {
  segment: VcpResponseSegment;
  contentDelta?: string;
  reasoningDelta?: string;
}

/** Splits server-owned VCP chunks while leaving model-authored marker examples intact. */
export class VcpStreamSegmenter {
  readonly segments: VcpResponseSegment[] = [];
  private current?: VcpResponseSegment;
  private lastAssistant?: VcpResponseSegment;
  private nextAssistant = false;
  private toolPhase = false;
  private summaryResponseId?: string;
  private summaryContent = "";
  private pendingPrefix = "";

  private updateToolCalls(
    segment: VcpResponseSegment,
    items: ToolSummaryItem[]
  ) {
    if (!items.length) return;
    segment.toolCalls = items.map((item) => ({
      toolName: item.toolName,
      status:
        item.statusLabel === "拒绝"
          ? "denied"
          : item.status === "info"
            ? "completed"
            : item.status,
    }));
    segment.toolStatus = items.some((item) => item.status === "error")
      ? "error"
      : items.every((item) => item.status === "success")
        ? "success"
        : undefined;
  }

  private appendFraming(content = ""): VcpSegmentUpdate | undefined {
    if (this.pendingPrefix || !this.current) {
      this.pendingPrefix += content;
      return;
    }
    this.current.contextReplay.suffix += content;
    return content ? { segment: this.current } : undefined;
  }

  push(chunk: LlmResponseChunk): VcpSegmentUpdate | undefined {
    const id = chunk.responseId ?? "";
    if (/^chatcmpl-VCP-final-/.test(id)) return;
    if (/^chatcmpl-VCP-separator-/.test(id)) {
      this.nextAssistant = true;
      this.toolPhase = false;
      return this.appendFraming(chunk.content);
    }
    if (/^chatcmpl-vcp-start-/.test(id)) {
      this.toolPhase = true;
      this.pendingPrefix += chunk.content ?? "";
      return;
    }
    if (/^chatcmpl-vcp-end-/.test(id)) {
      this.toolPhase = false;
      this.nextAssistant = true;
      return this.appendFraming(chunk.content);
    }

    const isBatch = /^chatcmpl-vcp-batch-/.test(id);
    const isTool =
      isBatch ||
      /^chatcmpl-vcp-(?:summary-|\d)/.test(id) ||
      (!id && this.toolPhase);
    const reasoningClose = /^chatcmpl-VCP-reasoning-/.test(id);
    const content = chunk.content ?? "";
    const reasoning = chunk.reasoningContent ?? "";

    let segment: VcpResponseSegment | undefined;
    if (content || reasoning) {
      const kind = isTool ? "tool" : "assistant";
      const needsSegment =
        !this.current ||
        this.current.kind !== kind ||
        (kind === "assistant" && this.nextAssistant && !reasoningClose);
      if (needsSegment && !content.trim() && !reasoning.trim() && !isBatch)
        return this.appendFraming(content);
      if (needsSegment) {
        segment = {
          index: this.segments.length,
          kind,
          responseId: kind === "assistant" ? chunk.responseId : undefined,
          content: "",
          reasoningContent: "",
          contextReplay: { prefix: this.pendingPrefix, suffix: "" },
        };
        this.pendingPrefix = "";
        this.segments.push(segment);
        this.current = segment;
        this.summaryResponseId = undefined;
        this.summaryContent = "";
        if (kind === "assistant") {
          this.lastAssistant = segment;
          this.nextAssistant = false;
        }
      } else {
        segment = this.current;
      }
      if (!segment) return;
      segment.content += content;
      segment.reasoningContent += reasoning;
      if (isTool && /^chatcmpl-vcp-summary-/.test(id)) {
        // Legacy summary chunks have their own upstream ID. Accumulate only
        // those chunks so quoted summaries in result values stay literal.
        if (this.summaryResponseId !== id) {
          this.summaryResponseId = id;
          this.summaryContent = "";
        }
        this.summaryContent += content;
        if (
          this.summaryContent
            .slice(-256)
            .trimEnd()
            .endsWith("[本轮工具调用摘要结束]")
        ) {
          const summary =
            /^\s*\[本轮工具调用摘要:\]([\s\S]*?)\[本轮工具调用摘要结束\]\s*$/.exec(
              this.summaryContent
            )?.[1];
          if (summary)
            this.updateToolCalls(segment, parseToolSummaryItems(summary));
        }
      } else if (isTool) {
        // Full result bodies can be large; project only at a possible close,
        // including a terminator split across content deltas.
        const tail = segment.content.slice(-256).trimEnd();
        if (
          (isBatch &&
            /(?:<<<\[VCP_TOOL_BATCH_END:[^\]\r\n]+\]>>>|<<<\[END_ROLE_DIVIDE_USER\]>>>)$/.test(
              tail
            )) ||
          (!isBatch && tail.endsWith("VCP调用结果结束]]"))
        ) {
          const display = parseVcpToolMessageDisplay(segment.content, false);
          if (display.closed) this.updateToolCalls(segment, display.calls);
        }
      }
    }

    // Usage commonly follows the finish chunk, with choices: []. Keep it on
    // the preceding assistant turn even when the next tool region has begun.
    if (chunk.usage && this.lastAssistant) {
      this.lastAssistant.usage = chunk.usage;
      segment ??= this.lastAssistant;
    }
    if (chunk.finishReason && this.lastAssistant && !isTool) {
      this.lastAssistant.finishReason = chunk.finishReason;
      this.nextAssistant = true;
      segment ??= this.lastAssistant;
    }
    return segment
      ? {
          segment,
          contentDelta: content || undefined,
          reasoningDelta: reasoning || undefined,
        }
      : undefined;
  }
}
