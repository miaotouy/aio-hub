/**
 * 会话路径计算工具
 */

import type { ChatSession, ChatMessageNode, ChatAgent } from "../types";

/**
 * 计算包含智能体预设展示的消息路径
 * 
 * 逻辑：
 * 1. 获取当前活动路径。
 * 2. 如果智能体配置了 displayPresetCount，则从预设消息中提取对应的消息。
 * 3. 标记这些预设消息为 isPresetDisplay，以便 UI 渲染。
 */
export function getActivePathWithPresets(
  activePath: ChatMessageNode[],
  session: ChatSession | null,
  agent: ChatAgent | null
): ChatMessageNode[] {
  if (!session || !agent || !agent.presetMessages || !agent.displayPresetCount || agent.displayPresetCount <= 0) {
    return activePath;
  }

  const chatHistoryIndex = agent.presetMessages.findIndex(
    (msg: ChatMessageNode) => msg.type === "chat_history"
  );

  if (chatHistoryIndex === -1) {
    return activePath;
  }

  // 提取占位符之前的、启用的、且角色为 user/assistant 的消息
  const presetsBeforePlaceholder = agent.presetMessages
    .slice(0, chatHistoryIndex)
    .filter(
      (msg: ChatMessageNode) =>
        (msg.role === "user" || msg.role === "assistant") &&
        msg.isEnabled !== false
    );

  // 取最后 N 条进行展示
  const displayPresets = presetsBeforePlaceholder.slice(-agent.displayPresetCount);

  const markedPresets = displayPresets.map((msg: ChatMessageNode) => ({
    ...msg,
    metadata: {
      ...msg.metadata,
      isPresetDisplay: true,
      agentId: agent.id,
      agentName: agent.name,
      agentDisplayName: agent.displayName || agent.name,
      agentIcon: agent.icon,
      profileId: agent.profileId,
      modelId: agent.modelId,
    },
  }));

  return [...markedPresets, ...activePath];
}