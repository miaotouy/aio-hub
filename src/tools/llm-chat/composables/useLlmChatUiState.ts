/**
 * LLM Chat UI 状态持久化管理
 */

import { ref, watch } from 'vue';
import { createConfigManager } from '@/utils/configManager';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('LlmChatUiState');

export interface LlmChatUiState {
  // 侧边栏折叠状态
  isLeftSidebarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  
  // 侧边栏宽度
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  
  // 左侧边栏当前激活的标签页
  leftSidebarActiveTab: 'agents' | 'parameters';
  
  // 智能体列表排序方式
  agentSortBy: 'lastUsed' | 'name' | 'createdAt';
  
  // 配置版本
  version?: string;
}

// 默认UI状态
const defaultUiState: LlmChatUiState = {
  isLeftSidebarCollapsed: false,
  isRightSidebarCollapsed: false,
  leftSidebarWidth: 320,
  rightSidebarWidth: 280,
  leftSidebarActiveTab: 'agents',
  agentSortBy: 'lastUsed',
  version: '1.0.0',
};

// 创建配置管理器
const uiStateManager = createConfigManager<LlmChatUiState>({
  moduleName: 'llm-chat',
  fileName: 'ui-state.json',
  version: '1.0.0',
  createDefault: () => defaultUiState,
});

// 创建防抖保存函数
const debouncedSave = uiStateManager.createDebouncedSave(300);

// 将响应式状态提升到模块级别，使其成为真正的单例
const isLeftSidebarCollapsed = ref(defaultUiState.isLeftSidebarCollapsed);
const isRightSidebarCollapsed = ref(defaultUiState.isRightSidebarCollapsed);
const leftSidebarWidth = ref(defaultUiState.leftSidebarWidth);
const rightSidebarWidth = ref(defaultUiState.rightSidebarWidth);
const leftSidebarActiveTab = ref<'agents' | 'parameters'>(defaultUiState.leftSidebarActiveTab);
const agentSortBy = ref<'lastUsed' | 'name' | 'createdAt'>(defaultUiState.agentSortBy);

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
      const state = await uiStateManager.load();
      
      isLeftSidebarCollapsed.value = state.isLeftSidebarCollapsed;
      isRightSidebarCollapsed.value = state.isRightSidebarCollapsed;
      leftSidebarWidth.value = state.leftSidebarWidth;
      rightSidebarWidth.value = state.rightSidebarWidth;
      leftSidebarActiveTab.value = state.leftSidebarActiveTab;
      agentSortBy.value = state.agentSortBy;
      
      isInitialized = true;
      logger.info('UI状态加载成功', state);
    } catch (error) {
      logger.error('加载UI状态失败', error as Error);
      // 加载失败时使用默认值
      isInitialized = true;
    }
  };
  
  /**
   * 保存UI状态
   */
  const saveUiState = () => {
    if (!isInitialized) {
      logger.warn('UI状态尚未初始化，跳过保存');
      return;
    }
    
    const state: LlmChatUiState = {
      isLeftSidebarCollapsed: isLeftSidebarCollapsed.value,
      isRightSidebarCollapsed: isRightSidebarCollapsed.value,
      leftSidebarWidth: leftSidebarWidth.value,
      rightSidebarWidth: rightSidebarWidth.value,
      leftSidebarActiveTab: leftSidebarActiveTab.value,
      agentSortBy: agentSortBy.value,
    };
    
    debouncedSave(state);
  };
  
  /**
   * 启动状态监听
   * 当状态变化时自动保存
   */
  const startWatching = () => {
    // 监听所有UI状态变化
    watch(
      [isLeftSidebarCollapsed, isRightSidebarCollapsed, leftSidebarWidth, rightSidebarWidth, leftSidebarActiveTab, agentSortBy],
      () => {
        saveUiState();
      }
    );
    
    logger.info('UI状态监听已启动');
  };
  
  /**
   * 重置UI状态
   */
  const resetUiState = async () => {
    try {
      await uiStateManager.save(defaultUiState);
      
      isLeftSidebarCollapsed.value = defaultUiState.isLeftSidebarCollapsed;
      isRightSidebarCollapsed.value = defaultUiState.isRightSidebarCollapsed;
      leftSidebarWidth.value = defaultUiState.leftSidebarWidth;
      rightSidebarWidth.value = defaultUiState.rightSidebarWidth;
      leftSidebarActiveTab.value = defaultUiState.leftSidebarActiveTab;
      agentSortBy.value = defaultUiState.agentSortBy;
      
      logger.info('UI状态已重置');
    } catch (error) {
      logger.error('重置UI状态失败', error as Error);
    }
  };
  
  return {
    // 状态
    isLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    leftSidebarWidth,
    rightSidebarWidth,
    leftSidebarActiveTab,
    agentSortBy,
    
    // 方法
    loadUiState,
    saveUiState,
    startWatching,
    resetUiState,
  };
}