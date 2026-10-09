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
 * 模型重选弹窗的回显解析与打开封装
 *
 * 统一「指定模型重新生成/续写」类入口的回显回退链：
 * 目标来源（消息元数据/节点数据）→ 输入框临时模型 → 当前智能体默认模型。
 * 消息栏（MessageMenubar）与树图操作栏（GraphNodeMenubar）共用，
 * 避免三份拷贝在回退规则变化时漏改。
 */

import { useLlmProfiles } from "@/composables/useLlmProfiles";
import {
  useModelSelectDialog,
  type ModelSelection,
} from "@/composables/useModelSelectDialog";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useChatInputManager } from "@/tools/llm-chat/composables/input/useChatInputManager";
import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import type { ModelIdentifier } from "@/tools/llm-chat/types";

export interface ModelSelectionFallbackOptions {
  /** 目标来源缺失时是否回退到输入框临时模型，默认 true */
  includeTemporary?: boolean;
  /** 仍缺失时是否回退到当前智能体默认模型，默认 true */
  includeAgent?: boolean;
}

export function useModelReselection() {
  const { open: openModelSelectDialog } = useModelSelectDialog();
  const { getProfileById } = useLlmProfiles();
  const agentStore = useAgentStore();
  const { currentAgentId } = useLlmChatUiState();

  /** 按显式 modelId/profileId 构建选中状态，任一缺失或找不到时返回 null */
  const buildSelection = (
    modelId?: string,
    profileId?: string
  ): ModelSelection | null => {
    if (!modelId || !profileId) return null;
    const profile = getProfileById(profileId);
    if (!profile) return null;
    const model = profile.models.find((m) => m.id === modelId);
    return model ? { profile, model } : null;
  };

  /** 当前智能体默认模型对应的选中状态 */
  const getAgentSelection = (): ModelSelection | null => {
    if (!currentAgentId.value) return null;
    const agent = agentStore.getAgentById(currentAgentId.value);
    if (!agent) return null;
    return buildSelection(agent.modelId, agent.profileId);
  };

  /** 输入框临时模型的载荷；未设置时返回 null */
  const getTemporaryModelPayload = (): ModelIdentifier | null => {
    const temporaryModel = useChatInputManager().temporaryModel.value;
    return temporaryModel
      ? { modelId: temporaryModel.modelId, profileId: temporaryModel.profileId }
      : null;
  };

  /**
   * 解析回显选中状态：目标来源 → 临时模型 → 智能体默认。
   * 任一环节命中即返回，全部未命中返回 null（弹窗无回显）。
   */
  const resolveSelection = (
    target?: { modelId?: string; profileId?: string } | null,
    options: ModelSelectionFallbackOptions = {}
  ): ModelSelection | null => {
    const { includeTemporary = true, includeAgent = true } = options;
    return (
      buildSelection(target?.modelId, target?.profileId) ??
      (includeTemporary ? buildSelectionFromTemporary() : null) ??
      (includeAgent ? getAgentSelection() : null)
    );
  };

  const buildSelectionFromTemporary = (): ModelSelection | null => {
    const temporaryModel = useChatInputManager().temporaryModel.value;
    if (!temporaryModel) return null;
    return buildSelection(temporaryModel.modelId, temporaryModel.profileId);
  };

  /**
   * 打开模型重选弹窗并返回用户选择。
   * 回显按 resolveSelection 的回退链解析；用户取消返回 null。
   */
  const openModelReselectDialog = async (
    target?: { modelId?: string; profileId?: string } | null,
    options: ModelSelectionFallbackOptions = {}
  ): Promise<ModelSelection | null> => {
    return openModelSelectDialog({
      current: resolveSelection(target, options),
      initialCapabilities: { embedding: false, rerank: false },
    });
  };

  return {
    buildSelection,
    getAgentSelection,
    getTemporaryModelPayload,
    resolveSelection,
    openModelReselectDialog,
  };
}
