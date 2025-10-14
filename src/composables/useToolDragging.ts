import { ref, readonly, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createModuleLogger } from '../utils/logger';
import type { WindowConfig } from './useDetachedTools';

const logger = createModuleLogger('ToolDragging');

// 指示器尺寸 (唯一来源)
const INDICATOR_WIDTH = 400;
const INDICATOR_HEIGHT = 120;

// 拖拽状态
const isDragging = ref(false);
const draggedTool = ref<WindowConfig | null>(null);
const dragStartX = ref(0);
const dragStartY = ref(0);
const currentX = ref(0);
const currentY = ref(0);

// 拖拽距离阈值 (与后端保持一致)
const DETACH_THRESHOLD = 100.0;

/**
 * 实时计算当前是否满足分离条件
 */
const canDetach = computed(() => {
  if (!isDragging.value) return false;
  const distance = Math.sqrt(
    (currentX.value - dragStartX.value) ** 2 + (currentY.value - dragStartY.value) ** 2
  );
  return distance > DETACH_THRESHOLD;
});

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
    isDragging.value = true;
    draggedTool.value = toolConfig;
    dragStartX.value = event.clientX;
    dragStartY.value = event.clientY;
    currentX.value = event.clientX;
    currentY.value = event.clientY;

    document.addEventListener('mousemove', updateDragPosition);
    document.addEventListener('mouseup', endDrag);

    try {
      // 获取主窗口的全局屏幕位置（物理坐标）和缩放因子
      const mainWindow = getCurrentWindow();
      const windowPosition = await mainWindow.outerPosition(); // 物理坐标
      const scaleFactor = await mainWindow.scaleFactor();
      
      // clientX/clientY 是逻辑坐标，需要转为物理坐标后再加到窗口物理位置上
      const physicalClientX = event.clientX * scaleFactor;
      const physicalClientY = event.clientY * scaleFactor;
      const globalPhysicalX = windowPosition.x + physicalClientX;
      const globalPhysicalY = windowPosition.y + physicalClientY;
      
      // 后端期望逻辑坐标，所以转回
      const globalX = globalPhysicalX / scaleFactor;
      const globalY = globalPhysicalY / scaleFactor;
      
      logger.info('准备拖拽指示器', {
        tool: toolConfig.title,
        clientX: event.clientX,
        clientY: event.clientY,
        scaleFactor,
        windowPhysical: `${windowPosition.x},${windowPosition.y}`,
        globalLogical: `${globalX},${globalY}`
      });
      
      await invoke('prepare_drag_indicator', {
        toolName: toolConfig.title,
        mouseX: globalX,
        mouseY: globalY,
        width: INDICATOR_WIDTH,
        height: INDICATOR_HEIGHT,
      });
    } catch (error) {
      logger.error('准备拖拽指示器失败', { error });
      // 如果准备失败，直接取消拖拽
      isDragging.value = false;
    }
  };

  /**
   * 更新拖拽位置
   * @param event 鼠标事件
   */
  const updateDragPosition = async (event: MouseEvent) => {
    if (!isDragging.value) return;

    currentX.value = event.clientX;
    currentY.value = event.clientY;

    try {
      // 获取主窗口的全局屏幕位置（物理坐标）和缩放因子
      const mainWindow = getCurrentWindow();
      const windowPosition = await mainWindow.outerPosition();
      const scaleFactor = await mainWindow.scaleFactor();
      
      // clientX/clientY 是逻辑坐标，转为物理坐标后再加到窗口物理位置上
      const physicalClientX = event.clientX * scaleFactor;
      const physicalClientY = event.clientY * scaleFactor;
      const globalPhysicalX = windowPosition.x + physicalClientX;
      const globalPhysicalY = windowPosition.y + physicalClientY;
      
      // 后端期望逻辑坐标，所以转回
      const globalX = globalPhysicalX / scaleFactor;
      const globalY = globalPhysicalY / scaleFactor;
      
      // 更新指示器窗口的物理位置，并保持居中
      await invoke('set_window_position', {
        label: 'drag-indicator',
        x: globalX,
        y: globalY,
        center: true,
      });

      // 发送事件，通知 DragIndicator.vue 更新状态
      emit('update-drag-status', { canDetach: canDetach.value });
    } catch (err) {
      logger.warn('更新拖拽指示器位置失败', { error: err });
    }
  };

  /**
   * 结束拖拽
   * @param event 鼠标事件
   */
  const endDrag = async (event: MouseEvent) => {
    if (!isDragging.value || !draggedTool.value) return;

    // 清理事件监听器
    document.removeEventListener('mousemove', updateDragPosition);
    document.removeEventListener('mouseup', endDrag);

    try {
      // 获取主窗口的全局屏幕位置（物理坐标）和缩放因子
      const mainWindow = getCurrentWindow();
      const windowPosition = await mainWindow.outerPosition();
      const scaleFactor = await mainWindow.scaleFactor();
      
      // clientX/clientY 是逻辑坐标，转为物理坐标后再加到窗口物理位置上
      const physicalEndX = event.clientX * scaleFactor;
      const physicalEndY = event.clientY * scaleFactor;
      const globalPhysicalEndX = windowPosition.x + physicalEndX;
      const globalPhysicalEndY = windowPosition.y + physicalEndY;
      
      const physicalStartX = dragStartX.value * scaleFactor;
      const physicalStartY = dragStartY.value * scaleFactor;
      const globalPhysicalStartX = windowPosition.x + physicalStartX;
      const globalPhysicalStartY = windowPosition.y + physicalStartY;
      
      // 后端期望逻辑坐标，所以转回
      const globalEndX = globalPhysicalEndX / scaleFactor;
      const globalEndY = globalPhysicalEndY / scaleFactor;
      const globalStartX = globalPhysicalStartX / scaleFactor;
      const globalStartY = globalPhysicalStartY / scaleFactor;
      
      logger.info('结束拖拽，正在调用后端处理', {
        tool: draggedTool.value.title,
        clientEnd: `${event.clientX},${event.clientY}`,
        globalLogical: `${globalEndX},${globalEndY}`,
      });

      const created = await invoke<boolean>('finalize_drag_indicator', {
        toolConfig: draggedTool.value,
        mouseX: globalEndX,
        mouseY: globalEndY,
        dragStartX: globalStartX,
        dragStartY: globalStartY,
      });

      if (created) {
        logger.info('后端成功创建窗口', { tool: draggedTool.value.title });
      } else {
        logger.info('后端取消创建窗口（距离不足或在主窗口内）', { tool: draggedTool.value.title });
      }

    } catch (error) {
      logger.error('结束拖拽失败', { error });
    } finally {
      // 重置状态
      isDragging.value = false;
      draggedTool.value = null;
      dragStartX.value = 0;
      dragStartY.value = 0;
      currentX.value = 0;
      currentY.value = 0;
    }
  };

  return {
    isDragging: readonly(isDragging),
    draggedTool: readonly(draggedTool),
    canDetach: readonly(canDetach),
    startDrag,
  };
}