import { ref, type Ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { createModuleLogger } from "@utils/logger";
import {
  DEFAULT_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
} from "../core/configManager";

const logger = createModuleLogger("LlmInspector/SplitPane");

export interface UseSplitPaneOptions {
  /** 初始比例 (0.1 - 0.9) */
  initialRatio?: number;
  /** 默认比例（双击恢复时使用） */
  defaultRatio?: number;
  /** 最小比例 */
  minRatio?: number;
  /** 最大比例 */
  maxRatio?: number;
}

/**
 * Split View 拖拽逻辑（D4）
 *
 * 提供：
 * - 响应式 `ratio`（左栏占比，0.1 - 0.9）
 * - `containerRef`：绑定到外层容器，用于计算相对位置
 * - `onDividerMouseDown`：分割条 mousedown 处理器
 * - `resetRatio`：恢复默认比例（用于双击）
 *
 * 持久化由调用方通过 watch `ratio` 触发，本 composable 不负责存储。
 */
export function useSplitPane(options: UseSplitPaneOptions = {}) {
  const {
    initialRatio = DEFAULT_SPLIT_RATIO,
    defaultRatio = DEFAULT_SPLIT_RATIO,
    minRatio = MIN_SPLIT_RATIO,
    maxRatio = MAX_SPLIT_RATIO,
  } = options;

  const ratio = ref<number>(clamp(initialRatio, minRatio, maxRatio));
  const containerRef = ref<HTMLElement | null>(null);
  const isDragging = ref(false);

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function onDividerMouseDown(event: MouseEvent) {
    event.preventDefault();
    if (!containerRef.value) {
      logger.warn("containerRef 未绑定，拖拽中止");
      return;
    }
    isDragging.value = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function onMouseMove(event: MouseEvent) {
    if (!isDragging.value || !containerRef.value) return;
    const rect = containerRef.value.getBoundingClientRect();
    if (rect.width <= 0) return;
    const offset = event.clientX - rect.left;
    const newRatio = clamp(offset / rect.width, minRatio, maxRatio);
    ratio.value = newRatio;
  }

  function onMouseUp() {
    if (!isDragging.value) return;
    isDragging.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function resetRatio() {
    ratio.value = clamp(defaultRatio, minRatio, maxRatio);
  }

  // 全局监听（mousemove/mouseup 必须在 window 级别才能正确捕获拖出容器的事件）
  useEventListener(window, "mousemove", onMouseMove);
  useEventListener(window, "mouseup", onMouseUp);

  return {
    ratio: ratio as Ref<number>,
    containerRef,
    isDragging,
    onDividerMouseDown,
    resetRatio,
  };
}
