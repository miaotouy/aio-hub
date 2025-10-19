import { ref, reactive } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useEventListener } from '@vueuse/core';

/**
 * 统一窗口分离的配置，与 Rust 端的 `DetachableConfig` 对应。
 */
export interface DetachableConfig {
  /** 唯一标识符 (e.g., "json-formatter" or "chat-area") */
  id: string;
  /** 显示名称 (e.g., "JSON Formatter" or "对话区域") */
  displayName: string;
  /** 窗口类型: 'tool' 或 'component' */
  type: 'tool' | 'component';
  /** 初始宽度 */
  width: number;
  /** 初始高度 */
  height: number;
  /** 鼠标起始X坐标 */
  mouseX: number;
  /** 鼠标起始Y坐标 */
  mouseY: number;
  /** 可选的元数据，可用于传递额外信息 */
  metadata?: Record<string, any>;
  /** 如果未触发拖拽（视为点击），调用此回调 */
  onClickInstead?: () => void;
}

const isDragging = ref(false);

// 拖拽状态管理
const dragState = reactive({
  startX: 0,
  startY: 0,
  startTime: 0,
  canDetach: false,
  isPreparing: false, // 准备阶段，还未真正开始拖拽
  config: null as DetachableConfig | null, // 保存配置，用于延迟创建会话
});

// 拖拽触发配置
const DRAG_THRESHOLD = {
  DISTANCE: 8,        // 启动距离阈值（像素）- 移动超过此距离才开始拖拽会话
  TIME_MIN: 100,      // 最小按下时间（毫秒）- 防止误触
  TIME_MAX: 300,      // 超过此时间即使移动很小也触发拖拽（毫秒）
};

const DETACH_THRESHOLD = 50; // 分离阈值：拖拽距离超过此距离才能创建独立窗口

/**
 * 统一处理可分离组件/工具拖拽逻辑的 Composable。
 */
export function useDetachable() {
  /**
   * 开始拖拽准备（在 mousedown 时调用）
   * @param config 拖拽配置（包含起始鼠标位置）
   */
  const startDragging = (config: DetachableConfig) => {
    if (isDragging.value || dragState.isPreparing) return;

    // 进入准备阶段，记录起始位置、时间和配置
    dragState.isPreparing = true;
    dragState.startX = config.mouseX;
    dragState.startY = config.mouseY;
    dragState.startTime = Date.now();
    dragState.canDetach = false;
    dragState.config = config;
    
    console.log('[DETACH] 准备拖拽', {
      startX: config.mouseX,
      startY: config.mouseY,
      startTime: dragState.startTime
    });
  };

  const beginDragSession = async () => {
    if (!dragState.config || isDragging.value) return;

    try {
      isDragging.value = true;
      dragState.isPreparing = false;
      
      // 使用新的基于 rdev 的拖拽会话
      await invoke('start_drag_session', {
        config: dragState.config
      });
      
      console.log('[DETACH] 基于 rdev 的拖拽会话已启动');
    } catch (error) {
      console.error('[DETACH] 启动拖拽会话失败:', error);
      isDragging.value = false;
      dragState.isPreparing = false;
      dragState.config = null;
    }
  };

  const handleMouseMove = async (event: MouseEvent) => {
    // 计算当前距离和经过时间
    const deltaX = event.screenX - dragState.startX;
    const deltaY = event.screenY - dragState.startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const elapsed = Date.now() - dragState.startTime;

    // 如果在准备阶段，检查是否应该启动拖拽会话
    if (dragState.isPreparing && !isDragging.value) {
      const shouldTrigger =
        // 条件1：移动距离超过阈值且按下时间超过最小时间
        (distance >= DRAG_THRESHOLD.DISTANCE && elapsed >= DRAG_THRESHOLD.TIME_MIN) ||
        // 条件2：按下时间超过最大时间阈值（即使移动距离小）
        (elapsed >= DRAG_THRESHOLD.TIME_MAX && distance >= 3);

      if (shouldTrigger) {
        console.log('[DETACH] 触发拖拽会话', {
          distance,
          elapsed,
          thresholds: DRAG_THRESHOLD
        });
        await beginDragSession();
      }
    }

    // 更新 canDetach 状态供 stopDragging 使用
    if (isDragging.value) {
      dragState.canDetach = distance >= DETACH_THRESHOLD;
    }
  };

  const stopDragging = () => {
    // 如果还在准备阶段（没有真正开始拖拽），视为点击
    if (dragState.isPreparing && !isDragging.value) {
      console.log('[DETACH] 未达到启动条件，视为点击');
      
      // 如果提供了点击回调，执行它
      if (dragState.config?.onClickInstead) {
        dragState.config.onClickInstead();
      }
      
      // 清理状态
      dragState.isPreparing = false;
      dragState.config = null;
      dragState.canDetach = false;
      dragState.startTime = 0;
      return;
    }

    // 如果已经开始拖拽，调用新的结束命令
    if (isDragging.value) {
      console.log('[DETACH] 结束拖拽会话，是否固化由后端根据距离判断');

      invoke<boolean>('end_drag_session')
        .then((created) => {
          console.log(`[DETACH] 拖拽会话结束，窗口${created ? '已' : '未'}创建`);
        })
        .catch(error => {
          console.error('[DETACH] 结束拖拽会话失败:', error);
        })
        .finally(() => {
          isDragging.value = false;
          dragState.isPreparing = false;
          dragState.config = null;
          dragState.canDetach = false;
          dragState.startTime = 0;
        });
    }
  };

  const handleMouseUp = (_event: MouseEvent) => {
    // 后端会根据拖拽距离自动判断是否创建窗口
    stopDragging();
  };

  // 在准备阶段和拖拽阶段都需要监听全局事件
  useEventListener(window, 'mousemove', (event) => {
    if (isDragging.value || dragState.isPreparing) {
      handleMouseMove(event);
    }
  });

  useEventListener(window, 'mouseup', (event) => {
    if (isDragging.value || dragState.isPreparing) {
      handleMouseUp(event);
    }
  });

  return {
    isDetaching: isDragging,
    startDetaching: startDragging,
  };
}