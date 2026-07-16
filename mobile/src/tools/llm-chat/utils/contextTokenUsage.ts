import type { LlmMessageContent } from "@/tools/llm-api/types";
import type {
  ContextRiskLevel,
  ContextTokenUsage,
  TokenCountSource,
} from "../types/message";
import type { TokenCountBatchResult } from "@/utils/tokenCounting";

export interface ContextThresholds {
  warningRatio: number;
  criticalRatio: number;
}

export function contentToTokenText(
  content: string | LlmMessageContent[]
): string {
  if (typeof content === "string") return content;

  return content
    .map((item) => {
      if (item.type === "text") return item.text;
      if (item.type === "tool_result") {
        return contentToTokenText(item.toolResultContent);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function getContextRiskLevel(
  tokenCount: number,
  contextLength: number | undefined,
  thresholds: ContextThresholds
): ContextRiskLevel {
  if (!contextLength || contextLength <= 0) return "normal";
  const ratio = tokenCount / contextLength;
  if (ratio >= thresholds.criticalRatio) return "critical";
  if (ratio >= thresholds.warningRatio) return "warning";
  return "normal";
}

export function createLocalContextUsage(
  result: TokenCountBatchResult,
  contextLength: number | undefined,
  thresholds: ContextThresholds
): ContextTokenUsage {
  const source: TokenCountSource = result.fallback ? "fallback" : "local";
  return {
    tokenCount: result.total,
    localTokenCount: result.total,
    contextLength,
    usageRatio:
      contextLength && contextLength > 0
        ? result.total / contextLength
        : undefined,
    tokenizer: result.tokenizer,
    estimated: true,
    source,
    riskLevel: getContextRiskLevel(result.total, contextLength, thresholds),
    warningRatio: thresholds.warningRatio,
    criticalRatio: thresholds.criticalRatio,
  };
}

export function applyApiPromptUsage(
  current: ContextTokenUsage,
  promptTokens: number
): ContextTokenUsage {
  const thresholds = {
    warningRatio: current.warningRatio,
    criticalRatio: current.criticalRatio,
  };
  return {
    ...current,
    tokenCount: promptTokens,
    usageRatio:
      current.contextLength && current.contextLength > 0
        ? promptTokens / current.contextLength
        : undefined,
    tokenizer: undefined,
    estimated: false,
    source: "api",
    riskLevel: getContextRiskLevel(
      promptTokens,
      current.contextLength,
      thresholds
    ),
  };
}
