/**
 * 默认智能体模板
 *
 * 定义首次启动时自动创建的默认 Agent 的模板数据。
 * 从 agentStore 中抽离，方便独立修改和维护。
 */

import type { ChatMessageNode, LlmParameters } from "../types";
import { getLocalISOString } from "@/utils/time";

export interface DefaultAgentTemplate {
  name: string;
  description: string;
  icon: string;
  presetMessages: ChatMessageNode[];
  parameters: LlmParameters;
}

/**
 * 创建默认智能体模板
 *
 * 返回一个全新的模板对象（每次调用都生成新的 ID 和时间戳），
 * 可直接传入 agentStore.createAgent 的 options 参数。
 */
export function createDefaultAgentTemplate(): DefaultAgentTemplate {
  return {
    name: "助手",
    description: "一个可以自由定制的对话伙伴",
    icon: "✨",
    presetMessages: [
      {
        id: `preset-system-${Date.now()}`,
        parentId: null,
        childrenIds: [],
        content: "## 核心定位\n友好且乐于助人的 AI 助手。",
        role: "system",
        status: "complete",
        isEnabled: true,
        timestamp: getLocalISOString(),
      },
    ],
    parameters: {
      temperature: 1,
      maxTokens: 4096,
      topP: undefined,
      topK: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
    },
  };
}
