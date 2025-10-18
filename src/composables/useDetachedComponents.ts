import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('DetachedComponents');

// 全局状态：已分离的组件标签集合
const detachedComponentLabels = ref<Set<string>>(new Set());

// 全局状态：窗口标签到组件 ID 的映射
const labelToComponentId = ref<Map<string, string>>(new Map());

// 是否已初始化监听器
let initialized = false;

/**
 * 打印当前组件窗口列表
 */
const printComponentWindowList = (context: string) => {
  const labels = Array.from(detachedComponentLabels.value);
  console.log('========================================');
  console.log(`[${context}] 当前组件窗口列表 (总数: ${labels.length})`);
  console.log('========================================');
  labels.forEach((label, index) => {
    const componentId = labelToComponentId.value.get(label);
    console.log(`  [${index + 1}] ${label} -> ${componentId || 'unknown'}`);
  });
  console.log('========================================');
};

/**
 * 组件预览配置接口
 */
export interface ComponentPreviewConfig {
  componentId: string;
  displayName: string;
  width: number;
  height: number;
  mouseX: number;
  mouseY: number;
  // 允许任意额外的属性，用于传递组件特定的 props
  [key: string]: any;
}

/**
 * 管理分离组件的 composable
 */
export function useDetachedComponents() {
  /**
   * 初始化事件监听器
   */
  const initializeListeners = async () => {
    if (initialized) return;

    try {
      // 监听组件被分离事件
      await listen<{ label: string; componentId: string }>('component-detached', (event) => {
        const { label, componentId } = event.payload;
        logger.info('组件被分离', { label, componentId });
        
        // 创建新的 Set 和 Map 来触发响应式更新
        const newSet = new Set(detachedComponentLabels.value);
        newSet.add(label);
        detachedComponentLabels.value = newSet;
        
        // 同时更新映射表
        const newMap = new Map(labelToComponentId.value);
        newMap.set(label, componentId);
        labelToComponentId.value = newMap;
        
        logger.info('更新后的状态', {
          detachedLabels: Array.from(detachedComponentLabels.value),
          labelToComponentIdMap: Array.from(labelToComponentId.value.entries())
        });
        
        printComponentWindowList('组件分离');
      });

      // 监听组件被重新附着事件
      await listen<{ label: string; componentId: string }>('component-attached', (event) => {
        const { label, componentId } = event.payload;
        logger.info('组件被重新附着', { label, componentId });
        
        // 创建新的 Set 和 Map 来触发响应式更新
        const newSet = new Set(detachedComponentLabels.value);
        newSet.delete(label);
        detachedComponentLabels.value = newSet;
        
        const newMap = new Map(labelToComponentId.value);
        newMap.delete(label);
        labelToComponentId.value = newMap;
        
        logger.info('更新后的状态', {
          detachedLabels: Array.from(detachedComponentLabels.value),
          labelToComponentIdMap: Array.from(labelToComponentId.value.entries())
        });
        
        printComponentWindowList('组件附着');
      });

      initialized = true;
      logger.info('分离组件监听器初始化完成');
      printComponentWindowList('初始化');

    } catch (error) {
      logger.error('初始化监听器失败', { error });
    }
  };

  /**
   * 请求预览窗口
   */
  const requestPreviewWindow = async (config: ComponentPreviewConfig): Promise<string | null> => {
    try {
      logger.info('正在请求预览窗口', { config });
      const label = await invoke<string>('request_preview_window', { config });
      logger.info('预览窗口已创建', { label });
      
      // 记录 label 到 componentId 的映射
      labelToComponentId.value.set(label, config.componentId);
      
      return label;
    } catch (error) {
      logger.error('请求预览窗口失败', { error, config });
      return null;
    }
  };

  /**
   * 更新预览窗口位置
   */
  const updatePreviewPosition = async (label: string, x: number, y: number): Promise<boolean> => {
    try {
      await invoke('update_preview_position', { label, x, y });
      return true;
    } catch (error) {
      logger.error('更新预览窗口位置失败', { error, label, x, y });
      return false;
    }
  };

  /**
   * 固定预览窗口（转为最终窗口）
   */
  const finalizePreviewWindow = async (label: string): Promise<boolean> => {
    try {
      logger.info('正在固定预览窗口', { label });
      await invoke('finalize_preview_window', { label });
      logger.info('预览窗口已固定', { label });
      return true;
    } catch (error) {
      logger.error('固定预览窗口失败', { error, label });
      return false;
    }
  };

  /**
   * 取消预览窗口（回收到池）
   */
  const cancelPreviewWindow = async (label: string): Promise<boolean> => {
    try {
      logger.info('正在取消预览窗口', { label });
      await invoke('cancel_preview_window', { label });
      logger.info('预览窗口已取消', { label });
      return true;
    } catch (error) {
      logger.error('取消预览窗口失败', { error, label });
      return false;
    }
  };

  /**
   * 获取窗口池状态（用于调试）
   */
  const getPoolStatus = async () => {
    try {
      const status = await invoke('get_component_pool_status');
      logger.info('窗口池状态', { status });
      return status;
    } catch (error) {
      logger.error('获取窗口池状态失败', { error });
      return null;
    }
  };

  /**
   * 检查组件是否已分离
   */
  const isComponentDetached = (componentId: string): boolean => {
    logger.info('检查组件是否已分离', {
      componentId,
      detachedLabels: Array.from(detachedComponentLabels.value),
      labelToComponentIdMap: Array.from(labelToComponentId.value.entries())
    });
    
    // 遍历所有已分离的窗口标签，检查是否有匹配的组件 ID
    for (const label of detachedComponentLabels.value) {
      const mappedComponentId = labelToComponentId.value.get(label);
      logger.info('检查标签映射', { label, mappedComponentId, targetComponentId: componentId });
      if (mappedComponentId === componentId) {
        logger.info('找到匹配的已分离组件', { componentId, label });
        return true;
      }
    }
    
    logger.info('组件未分离', { componentId });
    return false;
  };

  /**
   * 获取所有已分离的组件 ID 列表
   */
  const getDetachedComponents = computed(() => {
    const componentIds = new Set<string>();
    for (const label of detachedComponentLabels.value) {
      const componentId = labelToComponentId.value.get(label);
      if (componentId) {
        componentIds.add(componentId);
      }
    }
    return Array.from(componentIds);
  });

  return {
    initializeListeners,
    requestPreviewWindow,
    updatePreviewPosition,
    finalizePreviewWindow,
    cancelPreviewWindow,
    getPoolStatus,
    isComponentDetached,
    detachedComponentLabels: computed(() => detachedComponentLabels.value),
    labelToComponentId: computed(() => labelToComponentId.value),
    getDetachedComponents,
  };
}