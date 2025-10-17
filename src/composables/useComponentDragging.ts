import { ref, onUnmounted } from 'vue';
import { useDetachedComponents, type ComponentPreviewConfig } from './useDetachedComponents';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('ComponentDragging');

/**
 * 拖拽配置选项
 */
export interface DragOptions {
  /** 拖拽阈值（像素），超过此距离才开始预览 */
  threshold?: number;
  /** 固定阈值（像素），拖拽超过此距离才固定窗口 */
  finalizeThreshold?: number;
  /** 是否启用 RAF 节流 */
  enableThrottle?: boolean;
}

/**
 * 拖拽结果回调
 */
export interface DragCallbacks {
  /** 预览创建前的回调，返回预览配置 */
  onCreatePreview?: (event: MouseEvent) => ComponentPreviewConfig | null;
  /** 拖拽开始回调 */
  onDragStart?: (event: MouseEvent) => void;
  /** 拖拽移动回调 */
  onDragMove?: (event: MouseEvent) => void;
  /** 拖拽结束回调 */
  onDragEnd?: (event: MouseEvent, finalized: boolean) => void;
}

/**
 * 组件拖拽 Composable
 * 提供组件分离时的拖拽功能
 *
 * @param options 拖拽配置选项
 * @param callbacks 拖拽回调函数
 */
export function useComponentDragging(
  options: DragOptions = {},
  callbacks: DragCallbacks = {}
) {
  const {
    threshold = 10,
    finalizeThreshold = 100,
    enableThrottle = true,
  } = options;

  // 拖拽状态
  const isDragging = ref(false);
  const dragLabel = ref<string | null>(null);
  const dragStartPos = ref({ x: 0, y: 0 });
  const hasMovedEnough = ref(false);

  // RAF 节流变量
  let pendingDragPosition: { x: number; y: number } | null = null;
  let dragAnimationFrame: number | null = null;

  // 使用组件分离管理器
  const {
    requestPreviewWindow,
    updatePreviewPosition,
    finalizePreviewWindow,
    cancelPreviewWindow,
  } = useDetachedComponents();

  /**
   * 实际执行拖拽位置更新（在 RAF 中调用）
   */
  const applyPendingDrag = async () => {
    if (!pendingDragPosition || !dragLabel.value) {
      dragAnimationFrame = null;
      return;
    }

    const { x, y } = pendingDragPosition;
    pendingDragPosition = null;
    dragAnimationFrame = null;

    try {
      await updatePreviewPosition(dragLabel.value, x, y);
    } catch (error) {
      logger.error('通过 RAF 更新预览位置失败', { error });
      isDragging.value = false;
    }
  };

  /**
   * 创建预览窗口
   */
  const createPreview = async (e: MouseEvent) => {
    // 调用回调获取预览配置
    const previewConfig = callbacks.onCreatePreview?.(e);
    
    if (!previewConfig) {
      logger.error('未提供预览配置');
      isDragging.value = false;
      return;
    }

    try {
      const label = await requestPreviewWindow(previewConfig);

      if (label) {
        dragLabel.value = label;
        logger.info('预览窗口已创建', { label });
      } else {
        isDragging.value = false;
        hasMovedEnough.value = false;
      }
    } catch (error) {
      logger.error('创建预览窗口失败', { error });
      isDragging.value = false;
      hasMovedEnough.value = false;
    }
  };

  /**
   * 鼠标移动处理
   */
  const handleDragMove = async (e: MouseEvent) => {
    if (!isDragging.value) return;

    const dx = e.clientX - dragStartPos.value.x;
    const dy = e.clientY - dragStartPos.value.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 移动超过阈值才真正触发预览窗口
    if (distance > threshold && !hasMovedEnough.value) {
      hasMovedEnough.value = true;
      logger.info('达到拖拽阈值，开始创建预览窗口', { distance, threshold });
      await createPreview(e);
    }

    // 如果预览窗口已创建，更新位置
    if (hasMovedEnough.value && dragLabel.value) {
      if (enableThrottle) {
        // 使用 RAF 节流
        pendingDragPosition = { x: e.screenX, y: e.screenY };
        if (dragAnimationFrame === null) {
          dragAnimationFrame = requestAnimationFrame(applyPendingDrag);
        }
      } else {
        // 直接更新
        await updatePreviewPosition(dragLabel.value, e.screenX, e.screenY);
      }
    }

    // 调用移动回调
    callbacks.onDragMove?.(e);
  };

  /**
   * 鼠标释放处理
   */
  const handleDragEnd = async (e: MouseEvent) => {
    // 移除全局事件监听
    window.removeEventListener('mousemove', handleDragMove);

    if (!isDragging.value) return;

    logger.info('结束拖拽');

    // 取消任何待处理的 RAF
    if (dragAnimationFrame !== null) {
      cancelAnimationFrame(dragAnimationFrame);
      dragAnimationFrame = null;
    }

    let finalized = false;

    // 如果预览窗口被创建了，根据最终位置决定是固定还是取消
    if (dragLabel.value && hasMovedEnough.value) {
      const dx = e.clientX - dragStartPos.value.x;
      const dy = e.clientY - dragStartPos.value.y;
      const totalDistance = Math.sqrt(dx * dx + dy * dy);

      if (totalDistance > finalizeThreshold) {
        logger.info('固定预览窗口', { totalDistance, finalizeThreshold });
        await finalizePreviewWindow(dragLabel.value);
        finalized = true;
      } else {
        logger.info('取消预览窗口', { totalDistance, finalizeThreshold });
        await cancelPreviewWindow(dragLabel.value);
      }
    }

    // 调用结束回调
    callbacks.onDragEnd?.(e, finalized);

    // 重置所有状态
    isDragging.value = false;
    hasMovedEnough.value = false;
    dragLabel.value = null;
    pendingDragPosition = null;
  };

  /**
   * 开始拖拽
   */
  const startDrag = (e: MouseEvent) => {
    e.preventDefault();
    logger.info('准备拖拽');

    dragStartPos.value = { x: e.clientX, y: e.clientY };
    isDragging.value = true;
    hasMovedEnough.value = false;

    // 调用开始回调
    callbacks.onDragStart?.(e);

    // 注册全局的移动和释放事件
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd, { once: true });
  };

  /**
   * 清理函数
   */
  const cleanup = () => {
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);

    if (dragAnimationFrame !== null) {
      cancelAnimationFrame(dragAnimationFrame);
      dragAnimationFrame = null;
    }
  };

  // 组件卸载时清理
  onUnmounted(cleanup);

  return {
    isDragging,
    dragLabel,
    hasMovedEnough,
    startDrag,
    cleanup,
  };
}