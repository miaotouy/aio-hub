/**
 * Smart OCR UI 状态持久化管理
 */

import { ref, watch } from 'vue';
import { createConfigManager } from '@/utils/configManager';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('SmartOcrUiState');

export interface SmartOcrUiState {
  // 侧边栏折叠状态
  isLeftPanelCollapsed: boolean;
  isRightPanelCollapsed: boolean;
  
  // 侧边栏宽度
  leftPanelWidth: number;
  rightPanelWidth: number;
  
  // 配置版本
  version?: string;
}

// 默认UI状态
const defaultUiState: SmartOcrUiState = {
  isLeftPanelCollapsed: false,
  isRightPanelCollapsed: false,
  leftPanelWidth: 360,
  rightPanelWidth: 420,
  version: '1.0.0',
};

// 创建配置管理器
const uiStateManager = createConfigManager<SmartOcrUiState>({
  moduleName: 'smart-ocr',
  fileName: 'ui-state.json',
  version: '1.0.0',
  createDefault: () => defaultUiState,
});

// 创建防抖保存函数
const debouncedSave = uiStateManager.createDebouncedSave(300);

// 将响应式状态提升到模块级别，使其成为真正的单例
const isLeftPanelCollapsed = ref(defaultUiState.isLeftPanelCollapsed);
const isRightPanelCollapsed = ref(defaultUiState.isRightPanelCollapsed);
const leftPanelWidth = ref(defaultUiState.leftPanelWidth);
const rightPanelWidth = ref(defaultUiState.rightPanelWidth);

// 是否已初始化
let isInitialized = false;

/**
 * Smart OCR UI 状态管理 Composable
 */
export function useSmartOcrUiState() {
  
  /**
   * 加载UI状态
   */
  const loadUiState = async () => {
    try {
      const state = await uiStateManager.load();
      
      isLeftPanelCollapsed.value = state.isLeftPanelCollapsed;
      isRightPanelCollapsed.value = state.isRightPanelCollapsed;
      leftPanelWidth.value = state.leftPanelWidth;
      rightPanelWidth.value = state.rightPanelWidth;
      
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
    
    const state: SmartOcrUiState = {
      isLeftPanelCollapsed: isLeftPanelCollapsed.value,
      isRightPanelCollapsed: isRightPanelCollapsed.value,
      leftPanelWidth: leftPanelWidth.value,
      rightPanelWidth: rightPanelWidth.value,
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
      [isLeftPanelCollapsed, isRightPanelCollapsed, leftPanelWidth, rightPanelWidth],
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
      
      isLeftPanelCollapsed.value = defaultUiState.isLeftPanelCollapsed;
      isRightPanelCollapsed.value = defaultUiState.isRightPanelCollapsed;
      leftPanelWidth.value = defaultUiState.leftPanelWidth;
      rightPanelWidth.value = defaultUiState.rightPanelWidth;
      
      logger.info('UI状态已重置');
    } catch (error) {
      logger.error('重置UI状态失败', error as Error);
    }
  };
  
  return {
    // 状态
    isLeftPanelCollapsed,
    isRightPanelCollapsed,
    leftPanelWidth,
    rightPanelWidth,
    
    // 方法
    loadUiState,
    saveUiState,
    startWatching,
    resetUiState,
  };
}