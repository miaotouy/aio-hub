import type { ContextProcessor } from "../../../types/pipeline";
import type { ProcessableMessage } from "../../../types/context";
import { countTokensBatch } from "@/utils/tokenCounting";
import { contentToTokenText } from "../../../utils/contextTokenUsage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/token-limiter");
const TRUNCATION_SUFFIX = "\n...(已截断)";

export interface TokenLimiterConfig {
  enabled?: boolean;
  maxContextTokens?: number;
  retainedCharacters?: number;
}

export interface TokenLimiterStats {
  originalHistoryCount: number;
  finalHistoryCount: number;
  truncatedCount: number;
  presetTokens: number;
  historyTokens: number;
  totalTokens: number;
  savedTokens: number;
  savedChars: number;
  originalTotalChars: number;
}

export function limitHistoryByTokens(
  messages: ProcessableMessage[],
  counts: number[],
  maxTokens: number,
  retainedCharacters = 0
): { messages: ProcessableMessage[]; stats: TokenLimiterStats } {
  const counted = messages.map((message, index) => ({
    message,
    tokens: counts[index] ?? 0,
    chars: contentToTokenText(message.content).length,
  }));
  const history = counted.filter(
    (item) => item.message.sourceType === "session_history"
  );
  const fixed = counted.filter(
    (item) => item.message.sourceType !== "session_history"
  );
  const presetTokens = fixed.reduce((total, item) => total + item.tokens, 0);
  const originalHistoryTokens = history.reduce(
    (total, item) => total + item.tokens,
    0
  );
  const originalHistoryChars = history.reduce(
    (total, item) => total + item.chars,
    0
  );
  const available = maxTokens - presetTokens;
  const kept = new Map<ProcessableMessage, ProcessableMessage>();
  let used = 0;
  let finalHistoryChars = 0;
  let truncatedCount = 0;

  if (available > 0) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if (used + item.tokens <= available) {
        kept.set(item.message, item.message);
        used += item.tokens;
        finalHistoryChars += item.chars;
        continue;
      }
      if (retainedCharacters > 0 && typeof item.message.content === "string") {
        const content = item.message.content.slice(0, retainedCharacters) + TRUNCATION_SUFFIX;
        const partialTokens = Math.min(
          item.tokens,
          Math.ceil((content.length / Math.max(item.chars, 1)) * item.tokens)
        );
        if (used + partialTokens <= available) {
          kept.set(item.message, { ...item.message, content });
          used += partialTokens;
          finalHistoryChars += content.length;
          truncatedCount += 1;
        }
      }
      break;
    }
  }

  const finalMessages = messages.flatMap((message) => {
    if (message.sourceType !== "session_history") return [message];
    const retained = kept.get(message);
    return retained ? [retained] : [];
  });
  return {
    messages: finalMessages,
    stats: {
      originalHistoryCount: history.length,
      finalHistoryCount: kept.size,
      truncatedCount,
      presetTokens,
      historyTokens: used,
      totalTokens: presetTokens + used,
      savedTokens: originalHistoryTokens - used,
      savedChars: originalHistoryChars - finalHistoryChars,
      originalTotalChars:
        fixed.reduce((total, item) => total + item.chars, 0) + originalHistoryChars,
    },
  };
}

export const tokenLimiter: ContextProcessor = {
  id: "primary:token-limiter",
  name: "Token 限制器",
  description: "在最终格式化前按文本 Token 预算裁剪较早历史消息。",
  priority: 700,
  isCore: true,
  defaultEnabled: true,
  execute: async (context) => {
    const config = (context.agentConfig?.parameters as
      | { contextManagement?: TokenLimiterConfig }
      | undefined)?.contextManagement;
    if (!config?.enabled || !config.maxContextTokens || context.messages.length === 0) {
      context.logs.push({
        processorId: "primary:token-limiter",
        level: "info",
        message: "上下文 Token 限制未启用或未设置预算，已跳过。",
      });
      return;
    }
    const result = await countTokensBatch(
      context.messages.map((message) => contentToTokenText(message.content))
    );
    const limited = limitHistoryByTokens(
      context.messages,
      result.counts,
      config.maxContextTokens,
      config.retainedCharacters
    );
    context.messages = limited.messages;
    context.sharedData.set("tokenLimiterStats", limited.stats);
    const level = limited.stats.savedTokens > 0 ? "warn" : "info";
    const message = `Token 限制完成：保留 ${limited.stats.finalHistoryCount}/${limited.stats.originalHistoryCount} 条历史消息，节省 ${limited.stats.savedTokens} Token。`;
    context.logs.push({ processorId: "primary:token-limiter", level, message });
    logger.info(message, limited.stats);
  },
};