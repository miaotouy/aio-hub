import { ref, readonly } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { createModuleLogger } from '../utils/logger';
import type { WindowConfig } from './useDetachedTools';

const logger = createModuleLogger('ToolDragging');

// 指示器尺寸 (唯一来源)
const INDICATOR_WIDTH = 400;
const INDICATOR_HEIGHT = 120;

// 拖拽状态
const isDragging = ref(false);
const draggedTool = ref<WindowConfig | null>(null);

/**
 * 管理工具拖拽分离的 composable
 */
export function useToolDragging() {

  /**
   * 开始拖拽
   * @param event 鼠标事件
   * @param toolConfig 要拖拽的工具配置
   */
  const startDrag = async (event: MouseEvent, toolConfig: WindowConfig) => {
    // 防止重复启动
    if (isDragging.value) return;
    
    isDragging.value = true;
    draggedTool.value = toolConfig;

    // 添加鼠标释放监听器
    document.addEventListener('mouseup', endDrag);

    try {
      logger.info('开始拖拽会话', {
        tool: toolConfig.title,
        clientPos: `${event.clientX},${event.clientY}`,
      });
      
      // 调用后端开始拖拽会话
      await invoke('start_drag_session', {
        toolConfig: toolConfig,
        indicatorWidth: INDICATOR_WIDTH,
        indicatorHeight: INDICATOR_HEIGHT,
      });
    } catch (error) {
      logger.error('开始拖拽会话失败', { error });
      // 如果失败，重置状态
      isDragging.value = false;
      draggedTool.value = null;
      document.removeEventListener('mouseup', endDrag);
    }
  };

  /**
   * 结束拖拽
   */
  const endDrag = async () => {
    if (!isDragging.value || !draggedTool.value) return;

    // 清理事件监听器
    document.removeEventListener('mouseup', endDrag);

    try {
      logger.info('结束拖拽会话', {
        tool: draggedTool.value.title,
      });

      // 调用后端结束拖拽会话
      const created = await invoke<boolean>('end_drag_session');

      if (created) {
        logger.info('成功创建独立窗口', { tool: draggedTool.value.title });
      } else {
        logger.info('取消创建窗口（距离不足或在主窗口内）', { tool: draggedTool.value.title });
      }
    } catch (error) {
      logger.error('结束拖拽会话失败', { error });
    } finally {
      // 重置状态
      isDragging.value = false;
      draggedTool.value = null;
    }
  };

  return {
    isDragging: readonly(isDragging),
    draggedTool: readonly(draggedTool),
    startDrag,
  };
}