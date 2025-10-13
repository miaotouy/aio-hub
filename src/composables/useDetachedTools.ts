import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createModuleLogger } from '../utils/logger';
import { type AppSettings, loadAppSettings } from '../utils/appSettings';

const logger = createModuleLogger('DetachedTools');

// 全局状态：已分离的工具 ID 列表
const detachedToolIds = ref<Set<string>>(new Set());

// 是否已初始化监听器
let initialized = false;

// 定时检查器（在模块级别声明）
let positionCheckInterval: number | null = null;

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
 * 管理分离工具的 composable
 */
export function useDetachedTools() {
  /**
   * 初始化事件监听器
   */
  const initializeListeners = async () => {
    if (initialized) return;

    try {
      // 监听工具被分离事件
      await listen<string>('tool-detached', (event) => {
        logger.info('工具被分离', { toolId: event.payload });
        detachedToolIds.value.add(event.payload);
      });

      // 监听工具被重新附着事件
      await listen<string>('tool-attached', (event) => {
        logger.info('工具被重新附着', { toolId: event.payload });
        detachedToolIds.value.delete(event.payload);
      });

      // 从后端获取当前所有工具窗口
      const existingWindows = await invoke<string[]>('get_all_tool_windows');
      existingWindows.forEach(label => {
        detachedToolIds.value.add(label);
      });

      initialized = true;
      logger.info('分离工具监听器初始化完成', {
        existingWindows: Array.from(detachedToolIds.value)
      });

      // 根据设置启动或停止定期位置检查
      const settings = loadAppSettings();
      if (settings.autoAdjustWindowPosition) {
        startPositionCheck();
      }

      // 监听设置变化，动态启停检查器
      window.addEventListener("app-settings-changed", (event: Event) => {
        const customEvent = event as CustomEvent<AppSettings>;
        if (customEvent.detail.autoAdjustWindowPosition) {
          startPositionCheck();
        } else {
          stopPositionCheck();
        }
      });

    } catch (error) {
      logger.error('初始化监听器失败', { error });
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

    // 每30秒检查一次所有工具窗口的位置
    positionCheckInterval = window.setInterval(async () => {
      const toolIds = Array.from(detachedToolIds.value);
      if (toolIds.length === 0) return;

      for (const toolId of toolIds) {
        try {
          const adjusted = await ensureWindowVisible(toolId);
          if (adjusted) {
            logger.info('已调整窗口位置', { toolId });
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
   * 检查工具是否已分离
   */
  const isToolDetached = (toolId: string): boolean => {
    return detachedToolIds.value.has(toolId);
  };

  /**
   * 获取所有已分离的工具 ID
   */
  const getDetachedTools = computed(() => {
    return Array.from(detachedToolIds.value);
  });

  return {
    initializeListeners,
    createToolWindow,
    focusWindow,
    ensureWindowVisible,
    isToolDetached,
    detachedToolIds: computed(() => detachedToolIds.value),
    getDetachedTools,
    startPositionCheck,
    stopPositionCheck,
  };
}