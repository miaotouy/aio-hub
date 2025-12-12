import { createModuleLogger } from "@/utils/logger";
import type { LlmMessageContent } from "@/llm-apis/common";

const logger = createModuleLogger("llm-chat/core/context-limiter");

/**
 * 定义 Token 计算器的接口，用于依赖注入
 */
export interface TokenCalculator {
  calculateTokens(content: string, modelId: string): Promise<{ count: number }>;
}

/**
 * 应用上下文 Token 限制，截断会话历史
 */
export const applyContextLimit = async <
  T extends {
    role: "user" | "assistant" | "system";
    content: string | LlmMessageContent[];
  },
>(
  sessionContext: T[],
  presetMessages: Array<{
    role: "user" | "assistant" | "system";
    content: string | LlmMessageContent[];
  }>,
  contextManagement: {
    enabled: boolean;
    maxContextTokens: number;
    retainedCharacters: number;
  },
  modelId: string,
  tokenCalculator: TokenCalculator,
): Promise<T[]> => {
  const { maxContextTokens, retainedCharacters } = contextManagement;

  const presetTokenResults = await Promise.all(
    presetMessages.map(async (msg) => {
      try {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        const result = await tokenCalculator.calculateTokens(content, modelId);
        return result.count;
      } catch (error) {
        logger.warn("计算预设消息 token 失败", {
          error: error instanceof Error ? error.message : String(error),
        });
        return 0;
      }
    }),
  );
  const presetMessagesTokens = presetTokenResults.reduce(
    (sum, count) => sum + count,
    0,
  );

  const availableTokens = maxContextTokens - presetMessagesTokens;

  logger.info(
    "📊 上下文限制检查",
    {
      maxContextTokens,
      presetMessagesTokens,
      availableTokens,
      sessionMessageCount: sessionContext.length,
    },
    true,
  );

  if (availableTokens <= 0) {
    logger.warn("⚠️ 预设消息已超出最大上下文限制，会话历史将被完全截断", {
      presetMessagesTokens,
      maxContextTokens,
    });
    return [];
  }

  const messagesWithTokens = await Promise.all(
    sessionContext.map(async (msg, index) => {
      let tokenCount = 0;
      try {
        let content = "";
        if (typeof msg.content === "string") {
          content = msg.content;
        } else {
          for (const part of msg.content) {
            if (part.type === "text" && part.text) {
              content += part.text;
            }
          }
        }
        const result = await tokenCalculator.calculateTokens(content, modelId);
        tokenCount = result.count;
      } catch (error) {
        logger.warn("计算消息 token 失败", {
          index,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return {
        ...msg,
        tokenCount,
        index,
      };
    }),
  );

  let totalTokens = 0;
  const keptIndices = new Set<number>();
  const truncatedIndices = new Set<number>();

  for (let i = messagesWithTokens.length - 1; i >= 0; i--) {
    const msg = messagesWithTokens[i];
    if (totalTokens + msg.tokenCount <= availableTokens) {
      totalTokens += msg.tokenCount;
      keptIndices.add(i);
    } else {
      truncatedIndices.add(i);
    }
  }

  logger.info(
    "✂️ 上下文截断结果",
    {
      totalMessages: sessionContext.length,
      keptMessages: keptIndices.size,
      truncatedMessages: truncatedIndices.size,
      usedTokens: totalTokens,
      availableTokens,
    },
    true,
  );

  const result = messagesWithTokens.map((msg, index) => {
    if (keptIndices.has(index)) {
      const { tokenCount, index: _, ...rest } = msg;
      return rest as unknown as T;
    } else {
      let truncatedContent: string | LlmMessageContent[];

      if (typeof msg.content === "string") {
        if (retainedCharacters > 0 && msg.content.length > retainedCharacters) {
          truncatedContent =
            msg.content.substring(0, retainedCharacters) + "...[已截断]";
        } else if (retainedCharacters > 0) {
          truncatedContent = msg.content + "[已截断]";
        } else {
          truncatedContent = "[消息已截断]";
        }
      } else {
        truncatedContent = msg.content.map((part) => {
          if (part.type === "text" && part.text) {
            let text = part.text;
            if (retainedCharacters > 0 && text.length > retainedCharacters) {
              text = text.substring(0, retainedCharacters) + "...[已截断]";
            } else if (retainedCharacters > 0) {
              text = text + "[已截断]";
            } else {
              text = "[消息已截断]";
            }
            return { ...part, text };
          }
          return part;
        });
      }

      logger.debug("截断消息", {
        index,
        role: msg.role,
        originalLength:
          typeof msg.content === "string" ? msg.content.length : "multimodal",
        retainedCharacters,
      });

      const { tokenCount, index: _, ...rest } = msg;
      return {
        ...rest,
        content: truncatedContent,
      } as unknown as T;
    }
  });

  return result;
};
