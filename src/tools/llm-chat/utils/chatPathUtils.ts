// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 会话路径计算工具
 */

import type {
  ChatMessageNode,
  ChatAgent,
  ChatSessionIndex,
  ChatSessionDetail,
  InjectionStrategy,
} from "../types";
import {
  isModelMatchSatisfied,
  type ModelMatchContext,
} from "./modelMatchUtils";

/**
 * 判断消息是否具有非默认的注入策略
 * 深度注入、高级深度、锚点注入的消息不应作为开场白展示
 */
function hasNonDefaultInjection(strategy?: InjectionStrategy): boolean {
  if (!strategy) return false;
  // 有显式 type 字段时，直接根据 type 判断
  if (strategy.type) {
    return strategy.type !== "default";
  }
  // 兼容旧数据（无 type 字段）：depth > 0 或有 depthConfig/anchorTarget 视为非默认
  if (
    (strategy.depth !== undefined && strategy.depth > 0) ||
    strategy.depthConfig ||
    strategy.anchorTarget
  )
    return true;
  return false;
}

/**
 * 计算包含智能体预设展示的消息路径
 *
 * 逻辑：
 * 1. 获取当前活动路径。
 * 2. 如果智能体配置了 displayPresetCount，则从预设消息中提取对应的消息。
 * 3. 排除深度注入、锚点注入等非默认策略的消息（它们不是"开场白"）。
 * 4. 排除当前模型不匹配的消息。
 * 5. 标记这些预设消息为 isPresetDisplay，以便 UI 渲染。
 */
export function getActivePathWithPresets(
  activePath: ChatMessageNode[],
  index: ChatSessionIndex | null,
  detail: ChatSessionDetail | null,
  agent: ChatAgent | null,
  modelMatchContext?: ModelMatchContext
): ChatMessageNode[] {
  if (
    !index ||
    !detail ||
    !agent ||
    !agent.presetMessages ||
    !agent.displayPresetCount ||
    agent.displayPresetCount <= 0
  ) {
    return activePath;
  }

  const chatHistoryIndex = agent.presetMessages.findIndex(
    (msg: ChatMessageNode) => msg.type === "chat_history"
  );

  if (chatHistoryIndex === -1) {
    return activePath;
  }

  // 提取占位符之前的、符合显示条件的消息
  const presetsBeforePlaceholder = agent.presetMessages
    .slice(0, chatHistoryIndex)
    .filter((msg: ChatMessageNode) => {
      // 角色过滤：只取 user/assistant
      if (msg.role !== "user" && msg.role !== "assistant") return false;
      // 启用状态过滤
      if (msg.isEnabled === false) return false;
      // 排除非默认注入策略的消息（深度注入、锚点注入不是开场白）
      if (hasNonDefaultInjection(msg.injectionStrategy)) return false;
      // 排除当前模型不匹配的消息
      if (msg.modelMatch?.enabled && modelMatchContext) {
        if (!isModelMatchSatisfied(msg.modelMatch, modelMatchContext))
          return false;
      }
      return true;
    });

  // 取最后 N 条进行展示
  const displayPresets = presetsBeforePlaceholder.slice(
    -agent.displayPresetCount
  );

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
