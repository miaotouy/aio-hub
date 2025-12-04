import { createModuleLogger } from "@/utils/logger";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import type { LlmMessageContent } from "@/llm-apis/common";

const logger = createModuleLogger("llm-chat/context-limiter");

export function useContextLimiter() {
  /**
   * 应用上下文 Token 限制，截断会话历史
   * 注意：system 消息的合并已移至后处理管道，此处不再单独计算
   */
  const applyContextLimit = async <T extends { role: "user" | "assistant"; content: string | LlmMessageContent[] }>(
    sessionContext: T[],
    presetMessages: Array<{ role: "user" | "assistant"; content: string | LlmMessageContent[] }>,
    contextManagement: { enabled: boolean; maxContextTokens: number; retainedCharacters: number },
    modelId: string
  ): Promise<T[]> => {
    const { maxContextTokens, retainedCharacters } = contextManagement;

    // 计算预设消息的 token 数（并行计算）
    const presetTokenResults = await Promise.all(
      presetMessages.map(async (msg) => {
        try {
          const content =
            typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          const result = await tokenCalculatorService.calculateTokens(content, modelId);
          return result.count;
        } catch (error) {
          logger.warn("计算预设消息 token 失败", {
            error: error instanceof Error ? error.message : String(error),
          });
          return 0;
        }
      })
    );
    const presetMessagesTokens = presetTokenResults.reduce((sum, count) => sum + count, 0);

    // 计算可用于会话历史的 token 数量
    const availableTokens = maxContextTokens - presetMessagesTokens;

    logger.info("📊 上下文限制检查", {
      maxContextTokens,
      presetMessagesTokens,
      availableTokens,
      sessionMessageCount: sessionContext.length,
    }, true);

    if (availableTokens <= 0) {
      logger.warn("⚠️ 预设消息已超出最大上下文限制，会话历史将被完全截断", {
        presetMessagesTokens,
        maxContextTokens,
      });
      return [];
    }

    // 计算每条会话消息的 token 数
    const messagesWithTokens = await Promise.all(
      sessionContext.map(async (msg, index) => {
        let tokenCount = 0;
        try {
          let content = "";
          if (typeof msg.content === "string") {
            content = msg.content;
          } else {
            // 对于多模态内容，只计算文本部分的 token
            for (const part of msg.content) {
              if (part.type === "text" && part.text) {
                content += part.text;
              }
            }
          }
          const result = await tokenCalculatorService.calculateTokens(content, modelId);
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
      })
    );

    // 从最新的消息开始保留，直到达到 token 限制
    let totalTokens = 0;
    const keptIndices = new Set<number>();
    const truncatedIndices = new Set<number>();

    // 从后往前（最新到最旧）遍历消息
    for (let i = messagesWithTokens.length - 1; i >= 0; i--) {
      const msg = messagesWithTokens[i];
      if (totalTokens + msg.tokenCount <= availableTokens) {
        totalTokens += msg.tokenCount;
        keptIndices.add(i);
      } else {
        truncatedIndices.add(i);
      }
    }

    logger.info("✂️ 上下文截断结果", {
      totalMessages: sessionContext.length,
      keptMessages: keptIndices.size,
      truncatedMessages: truncatedIndices.size,
      usedTokens: totalTokens,
      availableTokens,
    }, true);

    // 构建结果：对于被截断的消息，保留指定的字符数
    const result = messagesWithTokens.map((msg, index) => {
      if (keptIndices.has(index)) {
        // 完整保留，并保留原始属性
        const { tokenCount, index: _, ...rest } = msg;
        return rest as unknown as T;
      } else {
        // 截断处理
        let truncatedContent: string | LlmMessageContent[];

        if (typeof msg.content === "string") {
          // 纯文本消息
          if (retainedCharacters > 0 && msg.content.length > retainedCharacters) {
            truncatedContent = msg.content.substring(0, retainedCharacters) + "...[已截断]";
          } else if (retainedCharacters > 0) {
            truncatedContent = msg.content + "[已截断]";
          } else {
            truncatedContent = "[消息已截断]";
          }
        } else {
          // 多模态消息：保留结构，但截断文本部分
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
          originalLength: typeof msg.content === "string" ? msg.content.length : "multimodal",
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

  return {
    applyContextLimit,
  };
}