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
 * LLM Chat UI 状态持久化管理
 */

import { reactive, toRefs, watch } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";

const logger = createModuleLogger("LlmChatUiState");
const errorHandler = createModuleErrorHandler("LlmChatUiState");

export interface LlmChatUiState {
  // 侧边栏折叠状态
  isLeftSidebarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;

  // 侧边栏宽度
  leftSidebarWidth: number;
  rightSidebarWidth: number;

  // 左侧边栏当前激活的标签页
  leftSidebarActiveTab: "agents" | "parameters";

  // 智能体列表排序方式
  agentSortBy: "lastUsed" | "name" | "createdAt";

  // 当前选中的智能体 ID
  currentAgentId: string | null;

  // ParametersSidebar 折叠状态
  presetMessagesExpanded: boolean;

  // ModelParametersEditor 折叠状态
  basicParamsExpanded: boolean;
  advancedParamsExpanded: boolean;
  contextManagementExpanded: boolean;
  contextCompressionExpanded: boolean;
  postProcessingExpanded: boolean;
  safetySettingsExpanded: boolean;
  specialFeaturesExpanded: boolean;
  customParamsExpanded: boolean;

  // 会话视图模式
  viewMode: "linear" | "force-graph";

  // 配置版本
  version?: string;
}

// 默认UI状态
const defaultUiState: LlmChatUiState = {
  isLeftSidebarCollapsed: false,
  isRightSidebarCollapsed: false,
  leftSidebarWidth: 320,
  rightSidebarWidth: 280,
  leftSidebarActiveTab: "agents",
  agentSortBy: "lastUsed",
  currentAgentId: null,
  presetMessagesExpanded: true,
  basicParamsExpanded: true,
  advancedParamsExpanded: false,
  contextManagementExpanded: true,
  contextCompressionExpanded: false,
  postProcessingExpanded: false,
  safetySettingsExpanded: false,
  specialFeaturesExpanded: false,
  customParamsExpanded: false,
  viewMode: "linear",
  version: "1.0.0",
};

// 创建配置管理器
const uiStateManager = createConfigManager<LlmChatUiState>({
  moduleName: "llm-chat",
  fileName: "ui-state.json",
  version: "1.0.0",
  createDefault: () => defaultUiState,
  debounceDelay: 300,
});

// 创建防抖保存函数
const debouncedSave = uiStateManager.saveDebounced;

// 将响应式状态提升到模块级别，使其成为真正的单例
const state = reactive<LlmChatUiState>({ ...defaultUiState });

// 是否已初始化
let isInitialized = false;

/**
 * LLM Chat UI 状态管理 Composable
 */
export function useLlmChatUiState() {
  /**
   * 加载UI状态
   */
  const loadUiState = async () => {
    try {
      const loadedState = await uiStateManager.load();

      // 合并加载的状态，并对可能缺失的字段使用默认值兜底
      Object.assign(state, {
        ...defaultUiState,
        ...loadedState,
        currentAgentId: loadedState.currentAgentId ?? null,
      });

      isInitialized = true;
      logger.info("UI状态加载成功", state);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载UI状态失败",
        showToUser: false,
      });
      // 加载失败时使用默认值
      isInitialized = true;
    }
  };

  /**
   * 保存UI状态
   */
  const saveUiState = () => {
    if (!isInitialized) {
      logger.warn("UI状态尚未初始化，跳过保存");
      return;
    }

    // 浅拷贝当前状态进行保存
    debouncedSave({ ...state });
  };

  /**
   * 启动状态监听
   * 当状态变化时自动保存
   */
  const startWatching = () => {
    // 监听整个响应式状态对象的变化
    watch(
      () => state,
      () => {
        saveUiState();
      },
      { deep: true }
    );

    // 监听智能体列表变化，如果当前选中的智能体被删除了，安全回退
    watch(
      () => useAgentStore().agents,
      (newAgents) => {
        if (
          state.currentAgentId &&
          !newAgents.some((a) => a.id === state.currentAgentId)
        ) {
          state.currentAgentId = newAgents[0]?.id || null;
        }
      }
    );

    logger.info("UI状态监听已启动");
  };

  /**
   * 重置UI状态
   */
  const resetUiState = async () => {
    try {
      await uiStateManager.save(defaultUiState);
      Object.assign(state, defaultUiState);
      logger.info("UI状态已重置");
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "重置UI状态失败",
        showToUser: false,
      });
    }
  };

  /**
   * 选择智能体
   */
  const selectAgent = (
    agentId: string,
    options?: {
      sessionId?: string | null;
      syncCurrentSessionGreetings?: boolean;
    }
  ) => {
    state.currentAgentId = agentId;

    const agentStore = useAgentStore();
    agentStore.updateLastUsed(agentId);

    const sessionId = options?.sessionId;
    if (sessionId) {
      import("../../stores/llmChatStore").then(({ useLlmChatStore }) => {
        const chatStore = useLlmChatStore();
        chatStore.updateSession(sessionId, { displayAgentId: agentId });
      });
    }
  };

  return {
    // 状态 (通过 toRefs 保持解构后的响应式)
    ...toRefs(state),

    // 方法
    loadUiState,
    saveUiState,
    startWatching,
    resetUiState,
    selectAgent,
  };
}
