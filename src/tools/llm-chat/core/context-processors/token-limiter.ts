import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";

const logger = createModuleLogger("primary:token-limiter");

export const tokenLimiter: ContextProcessor = {
  id: "primary:token-limiter",
  name: "Token 限制器",
  description: "根据预算截断历史消息。",
  priority: 450, // 调整到注入组装器 (400) 之后，消息格式化 (500) 之前
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

    // 1. 计算所有消息的 Token (包含文本和附件)
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

        // 使用 calculateMessageTokens 同时计算文本和附件(_attachments)的 Token
        const { count } = await tokenCalculatorService.calculateMessageTokens(
          contentText,
          modelId,
          msg._attachments // 传入附件列表
        );
        return { ...msg, tokenCount: count };
      }),
    );

    // 2. 区分历史消息和预设消息
    // sourceType === 'session_history' 为历史消息，其他均为预设/注入消息
    const historyMessages: typeof messagesWithTokens = [];
    const presetMessages: typeof messagesWithTokens = [];
    let presetTokens = 0;

    for (const msg of messagesWithTokens) {
      if (msg.sourceType === "session_history") {
        historyMessages.push(msg);
      } else {
        presetMessages.push(msg);
        presetTokens += msg.tokenCount;
      }
    }

    // 3. 计算历史消息可用预算
    const availableForHistory =
      contextManagement.maxContextTokens - presetTokens;

    if (availableForHistory <= 0) {
      const message = `预设消息 (${presetTokens} tokens) 已耗尽所有预算 (${contextManagement.maxContextTokens})，历史消息被完全截断。`;
      logger.warn(message);
      context.logs.push({
        processorId: "primary:token-limiter",
        level: "warn",
        message,
      });
      // 只保留预设消息
      context.messages = messages.filter(
        (m) => m.sourceType !== "session_history",
      );
      return;
    }

    // 4. 对历史消息进行从后往前的截断
    let currentHistoryTokens = 0;
    let keepCount = 0;
    let totalSavedTokens = 0;
    let partialTruncatedCount = 0;

    // 获取保留字符数配置 (默认为 0，即不保留)
    const retainedCharacters = contextManagement.retainedCharacters ?? 0;

    // 记录哪些消息需要被保留，以及是否被修改过
    const finalHistoryMessages: Array<{ original: any; final: any }> = [];

    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const msg = historyMessages[i];

      if (currentHistoryTokens + msg.tokenCount <= availableForHistory) {
        // 预算充足，完整保留
        currentHistoryTokens += msg.tokenCount;
        keepCount++;
        const msgIndex = messagesWithTokens.indexOf(msg);
        finalHistoryMessages.unshift({ original: messages[msgIndex], final: msg });
      } else {
        // 预算不足，尝试截断保留开头
        if (retainedCharacters > 0 && typeof msg.content === 'string') {
          const originalContent = msg.content;
          // 截取开头，并添加提示
          const truncatedContent = originalContent.slice(0, retainedCharacters) + "\n...(已截断)";

          // 重新计算截断后的 Token
          const { count: truncatedTokens } = await tokenCalculatorService.calculateMessageTokens(
            truncatedContent,
            modelId,
            msg._attachments
          );

          // 如果截断后能放得下
          if (currentHistoryTokens + truncatedTokens <= availableForHistory) {
            totalSavedTokens += (msg.tokenCount - truncatedTokens);
            partialTruncatedCount++;

            // 创建一个新的消息对象，包含修改后的内容
            const truncatedMsg = {
              ...msg,
              content: truncatedContent,
              tokenCount: truncatedTokens,
              isTruncated: true // 标记已被截断
            };

            currentHistoryTokens += truncatedTokens;
            keepCount++;
            const msgIndex = messagesWithTokens.indexOf(msg);
            finalHistoryMessages.unshift({ original: messages[msgIndex], final: truncatedMsg });
          }
        }

        // 无论是否截断成功，一旦遇到第一条放不下的消息（处理完后），
        // 更早的消息都无法保留，直接结束循环
        // 计算那些被完全丢弃的消息所节省的 Token
        for (let j = 0; j <= i - (partialTruncatedCount > 0 && finalHistoryMessages[0].final.isTruncated ? 0 : 0); j++) {
           // 这里逻辑有点绕，直接重算更清晰
        }
        break;
      }
    }

    // 计算总节省 Token
    const originalHistoryTokens = historyMessages.reduce((sum, m) => sum + m.tokenCount, 0);
    totalSavedTokens = originalHistoryTokens - currentHistoryTokens;

    // 5. 重组最终消息列表 (保持原有顺序)
    // 建立一个从原始消息到最终消息（可能是截断后的）的映射
    const finalMsgMap = new Map<any, any>();
    
    // 预设消息直接映射
    presetMessages.forEach(msg => {
      const msgIndex = messagesWithTokens.indexOf(msg);
      if (msgIndex !== -1) {
        finalMsgMap.set(messages[msgIndex], msg);
      }
    });

    // 历史消息使用我们计算好的结果
    finalHistoryMessages.forEach(item => {
      finalMsgMap.set(item.original, item.final);
    });

    // 按照原始 messages 的顺序构造最终列表
    // 这样可以保持预设消息和历史消息的相对顺序（虽然通常预设在前，历史在后）
    const newContextMessages = messages
      .filter(m => finalMsgMap.has(m))
      .map(m => finalMsgMap.get(m));

    const originalHistoryCount = historyMessages.length;
    const finalHistoryCount = keepCount;
    // truncatedCount 包含：被完全删除的消息 + 被部分截断的消息
    const deletedCount = originalHistoryCount - finalHistoryCount;
    const truncatedCount = deletedCount + partialTruncatedCount;

    context.messages = newContextMessages;

    // 将统计信息写入 sharedData 供预览使用
    context.sharedData.set("tokenLimiterStats", {
      originalHistoryCount,
      finalHistoryCount,
      truncatedCount,
      presetTokens,
      historyTokens: currentHistoryTokens,
      totalTokens: presetTokens + currentHistoryTokens,
      savedTokens: totalSavedTokens
    });

    const message = `Token 限制处理完成。预设占用 ${presetTokens}，历史可用 ${availableForHistory}。保留历史 ${finalHistoryCount}/${originalHistoryCount} 条。`;
    logger.info(message, {
      originalHistoryCount,
      finalHistoryCount,
      truncatedCount,
      presetTokens,
      historyTokens: currentHistoryTokens,
      totalTokens: presetTokens + currentHistoryTokens,
      savedTokens: totalSavedTokens
    });
    context.logs.push({
      processorId: "primary:token-limiter",
      level: "info",
      message,
    });
  },
};
