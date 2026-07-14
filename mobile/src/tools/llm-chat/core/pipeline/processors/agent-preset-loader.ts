import type { ContextProcessor, ProcessableMessage } from "../../../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/agent-preset-loader");

export const agentPresetLoader: ContextProcessor = {
  id: "primary:agent-preset-loader",
  name: "智能体预设加载器",
  description: "将当前智能体的预设消息注入会话上下文。",
  priority: 200,
  isCore: true,
  defaultEnabled: true,
  execute: async (context) => {
    const presetMessages = context.agentConfig?.presetMessages || [];
    const injected: ProcessableMessage[] = presetMessages
      .filter((message) => message.content.trim())
      .map((message, index) => ({
        role: message.role,
        content: message.content,
        sourceType: "agent_preset",
        sourceId: message.id || index,
        sourceIndex: index,
      }));

    if (injected.length === 0) return;
    context.messages = [...injected, ...context.messages];
    context.logs.push({
      processorId: "primary:agent-preset-loader",
      level: "info",
      message: `已注入 ${injected.length} 条智能体预设消息。`,
    });
    logger.info("智能体预设消息注入完成", {
      agentId: context.agentConfig?.id,
      count: injected.length,
    });
  },
};
