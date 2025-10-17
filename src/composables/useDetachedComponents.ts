import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('DetachedComponents');

// 全局状态：已分离的组件 ID 集合
const detachedComponentIds = ref<Set<string>>(new Set());

// 是否已初始化监听器
let initialized = false;

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
      await listen<string>('component-detached', (event) => {
        logger.info('组件被分离', { label: event.payload });
        // 从 label 中提取 componentId (格式: component-window-N)
        // 但我们需要存储实际的组件ID，而不是窗口label
        // 这里暂时使用 label，后续可以改进
        detachedComponentIds.value.add(event.payload);
      });

      // 监听组件被重新附着事件
      await listen<string>('component-attached', (event) => {
        logger.info('组件被重新附着', { label: event.payload });
        detachedComponentIds.value.delete(event.payload);
      });

      initialized = true;
      logger.info('分离组件监听器初始化完成');

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
    // TODO: 这里需要改进，因为我们存储的是窗口label，而不是componentId
    // 暂时使用简单的检查
    return Array.from(detachedComponentIds.value).some(label => 
      label.includes(componentId)
    );
  };

  /**
   * 获取所有已分离的组件
   */
  const getDetachedComponents = computed(() => {
    return Array.from(detachedComponentIds.value);
  });

  return {
    initializeListeners,
    requestPreviewWindow,
    updatePreviewPosition,
    finalizePreviewWindow,
    cancelPreviewWindow,
    getPoolStatus,
    isComponentDetached,
    detachedComponentIds: computed(() => detachedComponentIds.value),
    getDetachedComponents,
  };
}