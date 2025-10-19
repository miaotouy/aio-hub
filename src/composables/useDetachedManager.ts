import { ref, computed, readonly } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { createModuleLogger } from '@/utils/logger';
import { getOrCreateInstance } from '@/utils/singleton';
import { type AppSettings, loadAppSettings } from '@/utils/appSettings';

const logger = createModuleLogger('DetachedManager');

export interface DetachedWindow {
  label: string;
  id: string;
  type: 'tool' | 'component';
}

/**
 * 窗口配置接口
 */
export interface WindowConfig {
  label: string;
  title: string;
  url: string;
  width?: number;
  height?: number;
}

/**
 * 统一管理分离窗口（工具和组件）的状态。
 * 这是一个单例，以确保在整个应用中只有一个状态源。
 */
const useDetachedWindowManager = () => {
  const detachedWindows = ref<Map<string, DetachedWindow>>(new Map());
  let initialized = false;
  let positionCheckInterval: number | null = null;

  const initialize = async () => {
    if (initialized) return;
    initialized = true;

    try {
      await listen<DetachedWindow>('window-detached', (event) => {
        const { label, id, type } = event.payload;
        logger.info(`窗口已分离: ${type} '${id}' (label: ${label})`);
        detachedWindows.value.set(label, { label, id, type });
        detachedWindows.value = new Map(detachedWindows.value); // 强制响应式更新
      });

      await listen<{ label: string }>('window-attached', (event) => {
        const { label } = event.payload;
        const detached = detachedWindows.value.get(label);
        if (detached) {
          logger.info(`窗口已重新附着: ${detached.type} '${detached.id}' (label: ${label})`);
          if (detachedWindows.value.delete(label)) {
            detachedWindows.value = new Map(detachedWindows.value); // 强制响应式更新
          }
        }
      });

      // 兼容旧的工具系统事件
      await listen<string>('tool-detached', (event) => {
        const label = event.payload;
        logger.info(`工具窗口已分离(旧事件): '${label}'`);
        detachedWindows.value.set(label, { label, id: label, type: 'tool' });
        detachedWindows.value = new Map(detachedWindows.value); // 强制响应式更新
      });

      await listen<string>('tool-attached', (event) => {
        const label = event.payload;
        logger.info(`工具窗口已重新附着(旧事件): '${label}'`);
        if (detachedWindows.value.delete(label)) {
          detachedWindows.value = new Map(detachedWindows.value); // 强制响应式更新
        }
      });

      // 兼容旧的组件系统事件
      await listen<{ label: string; componentId: string }>('component-detached', (event) => {
        const { label, componentId } = event.payload;
        logger.info(`组件窗口已分离(旧事件): '${componentId}' (label: ${label})`);
        detachedWindows.value.set(label, { label, id: componentId, type: 'component' });
        detachedWindows.value = new Map(detachedWindows.value); // 强制响应式更新
      });

      await listen<{ label: string; componentId: string }>('component-attached', (event) => {
        const { label } = event.payload;
        logger.info(`组件窗口已重新附着(旧事件): (label: ${label})`);
        if (detachedWindows.value.delete(label)) {
          detachedWindows.value = new Map(detachedWindows.value); // 强制响应式更新
        }
      });

      // 监听窗口销毁事件，确保状态被清理
      await listen<{ label: string }>('tauri://destroyed', (event) => {
        const { label } = event.payload;
        if (detachedWindows.value.has(label)) {
          const detached = detachedWindows.value.get(label)!;
          logger.info(`窗口已销毁，清理状态: ${detached.type} '${detached.id}' (label: ${label})`);
          if (detachedWindows.value.delete(label)) {
            detachedWindows.value = new Map(detachedWindows.value); // 强制响应式更新
          }
        }
      });

      // 从后端获取当前所有已分离的窗口进行初始化
      const existingWindows = await invoke<DetachedWindow[]>('get_all_detached_windows');
      for (const win of existingWindows) {
        detachedWindows.value.set(win.label, win);
      }

      logger.info('分离窗口管理器初始化完成', {
        existing: existingWindows.length,
      });

      // 根据设置启动或停止定期位置检查
      const settings = loadAppSettings();
      if (settings.autoAdjustWindowPosition) {
        startPositionCheck();
      }

      // 监听设置变化，动态启停检查器
      window.addEventListener('app-settings-changed', (event: Event) => {
        const customEvent = event as CustomEvent<AppSettings>;
        if (customEvent.detail.autoAdjustWindowPosition) {
          startPositionCheck();
        } else {
          stopPositionCheck();
        }
      });

    } catch (error) {
      logger.error('初始化分离窗口管理器失败', { error });
    }
  };

  /**
   * 启动定期位置检查
   */
  const startPositionCheck = () => {
    if (positionCheckInterval !== null) return;

    const settings = loadAppSettings();
    if (!settings.autoAdjustWindowPosition) {
      logger.info('自动调整窗口位置功能已禁用，不启动检查器');
      return;
    }

    // 每30秒检查一次所有窗口的位置
    positionCheckInterval = window.setInterval(async () => {
      const labels = Array.from(detachedWindows.value.keys());
      if (labels.length === 0) return;

      for (const label of labels) {
        try {
          const adjusted = await ensureWindowVisible(label);
          if (adjusted) {
            logger.info('已调整窗口位置', { label });
          }
        } catch (error) {
          // 窗口可能已被关闭，忽略错误
        }
      }
    }, 30000);

    logger.info('已启动窗口位置定期检查');
  };

  /**
   * 停止定期位置检查
   */
  const stopPositionCheck = () => {
    if (positionCheckInterval !== null) {
      window.clearInterval(positionCheckInterval);
      positionCheckInterval = null;
      logger.info('已停止窗口位置定期检查');
    }
  };

  /**
   * 创建工具窗口
   */
  const createToolWindow = async (config: WindowConfig): Promise<boolean> => {
    try {
      logger.info('正在创建工具窗口', { config });
      const result = await invoke<string>('create_tool_window', { config });
      logger.info('工具窗口创建成功', { result });
      return true;
    } catch (error) {
      logger.error('创建工具窗口失败', { error, config });
      return false;
    }
  };

  /**
   * 聚焦现有窗口
   */
  const focusWindow = async (label: string): Promise<boolean> => {
    try {
      logger.info('正在聚焦窗口', { label });
      await invoke('focus_window', { label });
      logger.info('窗口聚焦成功', { label });
      return true;
    } catch (error) {
      logger.error('聚焦窗口失败', { error, label });
      return false;
    }
  };

  /**
   * 确保窗口在可见区域内
   */
  const ensureWindowVisible = async (label: string): Promise<boolean> => {
    try {
      const adjusted = await invoke<boolean>('ensure_window_visible', { label });
      if (adjusted) {
        logger.info('窗口位置已调整到可见区域', { label });
      }
      return adjusted;
    } catch (error) {
      logger.error('调整窗口位置失败', { error, label });
      return false;
    }
  };

  /**
   * 关闭窗口（重新附加）
   */
  const closeWindow = async (label: string): Promise<boolean> => {
    try {
      logger.info('正在关闭窗口', { label });
      // 使用新的统一关闭命令
      await invoke('close_detached_window', { label });
      logger.info('窗口关闭成功', { label });
      return true;
    } catch (error) {
      logger.error('关闭窗口失败', { error, label });
      return false;
    }
  };

  /**
   * 检查指定 ID 的项（工具或组件）是否已分离。
   * @param id - 工具或组件的 ID
   * @returns 如果已分离则返回 true
   */
  const isDetached = (id: string): boolean => {
    for (const window of detachedWindows.value.values()) {
      if (window.id === id) {
        return true;
      }
    }
    return false;
  };

  /**
   * 按类型获取所有已分离窗口的 ID。
   * @param type - 'tool' 或 'component'
   */
  const getDetachedIdsByType = (type: 'tool' | 'component'): string[] => {
    const ids: string[] = [];
    for (const window of detachedWindows.value.values()) {
      if (window.type === type) {
        ids.push(window.id);
      }
    }
    return ids;
  };

  return {
    // 初始化
    initialize,
    // 状态查询
    isDetached,
    getDetachedIdsByType,
    detachedWindows: readonly(detachedWindows),
    detachedTools: computed(() => getDetachedIdsByType('tool')),
    detachedComponents: computed(() => getDetachedIdsByType('component')),
    // 窗口操作
    createToolWindow,
    focusWindow,
    ensureWindowVisible,
    closeWindow,
    // 位置检查
    startPositionCheck,
    stopPositionCheck,
  };
};

export const useDetachedManager = () => getOrCreateInstance('DetachedManager', useDetachedWindowManager);