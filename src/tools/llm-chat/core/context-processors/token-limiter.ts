import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";

const logger = createModuleLogger("primary:token-limiter");

export const tokenLimiter: ContextProcessor = {
  id: "primary:token-limiter",
  name: "Token 限制器",
  description: "根据预算截断历史消息。",
  priority: 300,
  execute: async (context: PipelineContext) => {
    const { messages, agentConfig } = context;
    const { parameters, modelId } = agentConfig;
    const contextManagement = parameters.contextManagement;

    if (!contextManagement?.enabled || !contextManagement.maxContextTokens) {
      const message = "上下文管理未启用或未设置最大 Token，已跳过。";
      context.logs.push({
        processorId: "primary:token-limiter",
        level: "info",
        message,
      });
      return;
    }

    if (messages.length === 0) {
      return;
    }

    // 在这个阶段，预设消息还未注入，所以 presetMessagesTokens 为 0
    const presetMessagesTokens = 0;
    const availableTokens =
      contextManagement.maxContextTokens - presetMessagesTokens;

    if (availableTokens <= 0) {
      const message = `预设消息已耗尽所有 Token，历史消息被完全截断。`;
      logger.warn(message, { availableTokens });
      context.logs.push({
        processorId: "primary:token-limiter",
        level: "warn",
        message,
      });
      context.messages = [];
      return;
    }

    const messagesWithTokens = await Promise.all(
      messages.map(async (msg) => {
        let contentText = "";
        if (typeof msg.content === "string") {
          contentText = msg.content;
        } else if (Array.isArray(msg.content)) {
          // 简单地将所有 text 部分拼接起来计算 token
          contentText = msg.content
            .filter(
              (p): p is { type: "text"; text: string } =>
                p.type === "text" && !!p.text,
            )
            .map((p) => p.text)
            .join("\n");
        }
        const { count } = await tokenCalculatorService.calculateTokens(
          contentText,
          modelId,
        );
        return { ...msg, tokenCount: count };
      }),
    );

    let totalTokens = 0;
    let sliceIndex = messagesWithTokens.length;

    for (let i = messagesWithTokens.length - 1; i >= 0; i--) {
      const msg = messagesWithTokens[i];
      if (totalTokens + msg.tokenCount <= availableTokens) {
        totalTokens += msg.tokenCount;
      } else {
        // 找到了截断点
        sliceIndex = i + 1;
        break;
      }
      // 如果循环正常结束 (所有消息都保留), sliceIndex 将保持为 length
      if (i === 0) {
        sliceIndex = 0;
      }
    }

    const originalCount = context.messages.length;
    if (sliceIndex > 0) {
      context.messages = context.messages.slice(sliceIndex);
    } else if (sliceIndex === 0 && totalTokens > availableTokens) {
      // 这种情况意味着即使是最后一条消息也超过了预算
      context.messages = [];
    }

    const finalCount = context.messages.length;
    const truncatedCount = originalCount - finalCount;

    const message = `Token 限制处理完成。保留 ${finalCount} 条，截断 ${truncatedCount} 条消息。`;
    logger.info(message, {
      originalCount,
      finalCount,
      truncatedCount,
      usedTokens: totalTokens,
      availableTokens,
    });
    context.logs.push({
      processorId: "primary:token-limiter",
      level: "info",
      message,
    });
  },
};
