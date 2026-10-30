import type { LlmResponseChunk, TokenUsage } from "@aiohub/llm-core";

import { parseToolSummaryItems } from "@/utils/vcpToolSummary";

export interface VcpResponseSegment {
  index: number;
  kind: "assistant" | "tool";
  responseId?: string;
  content: string;
  reasoningContent: string;
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

  push(chunk: LlmResponseChunk): VcpSegmentUpdate | undefined {
    const id = chunk.responseId ?? "";
    if (/^chatcmpl-VCP-final-/.test(id)) return;
    if (/^chatcmpl-VCP-separator-/.test(id)) {
      this.nextAssistant = true;
      this.toolPhase = false;
      return;
    }
    if (/^chatcmpl-vcp-start-/.test(id)) {
      this.toolPhase = true;
      return;
    }
    if (/^chatcmpl-vcp-end-/.test(id)) {
      this.toolPhase = false;
      this.nextAssistant = true;
      return;
    }

    const isBatch = /^chatcmpl-vcp-batch-/.test(id);
    const isTool =
      isBatch ||
      /^chatcmpl-vcp-(?:summary-|\d)/.test(id) ||
      (!id && this.toolPhase);
    const reasoningClose = /^chatcmpl-VCP-reasoning-/.test(id);
    let content = chunk.content ?? "";
    const reasoning = chunk.reasoningContent ?? "";
    // Batch chunks retain their raw framing, including literal role markers in results.
    if (isTool && !isBatch) {
      content = content.replace(/<<<\[(?:END_)?ROLE_DIVIDE_USER\]>>>/g, "");
    }

    let segment: VcpResponseSegment | undefined;
    if (content || reasoning) {
      const kind = isTool ? "tool" : "assistant";
      const needsSegment =
        !this.current ||
        this.current.kind !== kind ||
        (kind === "assistant" && this.nextAssistant && !reasoningClose);
      if (needsSegment && !content.trim() && !reasoning.trim() && !isBatch)
        return;
      if (needsSegment) {
        segment = {
          index: this.segments.length,
          kind,
          responseId: kind === "assistant" ? chunk.responseId : undefined,
          content: "",
          reasoningContent: "",
        };
        this.segments.push(segment);
        this.current = segment;
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
        const summary =
          /\[本轮工具调用摘要:\]([\s\S]*?)\[本轮工具调用摘要结束\]/.exec(
            content
          )?.[1];
        if (summary) {
          segment.toolCalls = parseToolSummaryItems(summary).map((item) => ({
            toolName: item.toolName,
            status:
              item.statusLabel === "拒绝"
                ? "denied"
                : item.status === "info"
                  ? "completed"
                  : item.status,
          }));
          segment.toolStatus = segment.toolCalls.some(
            (call) => call.status === "error" || call.status === "denied"
          )
            ? "error"
            : "success";
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
