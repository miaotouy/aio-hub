import { ref, computed, onUnmounted, type Ref } from "vue";

interface UseMessageInputResizeOptions {
  isDetached: boolean;
  textareaRef: Ref<any>;
  extraHeight?: Ref<number>; // 附件等额外组件占据的高度
  onResizeStart?: () => void;
}

export function useMessageInputResize(options: UseMessageInputResizeOptions) {
  const isResizing = ref(false);
  const startY = ref(0);
  const startHeight = ref(0);
  const customHeight = ref<string | number>("auto");
  const customMaxHeight = ref<string | number>("70vh");

  // 计算最终传给编辑器的实际高度
  const editorHeight = computed(() => {
    return customHeight.value;
  });

  // 计算最终传给编辑器的最大高度
  const editorMaxHeight = computed(() => {
    if (typeof customMaxHeight.value === "number") {
      return customMaxHeight.value;
    }
    // 如果是默认的 70vh，需要减去 extraHeight 以防溢出
    const extra = options.extraHeight?.value || 0;
    return `calc(70vh - ${extra}px)`;
  });

  // 鼠标移动处理
  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value || !options.textareaRef.value) return;

    // 计算高度差值
    const deltaY = startY.value - e.clientY;
    const newHeight = startHeight.value + deltaY;

    // 限制最小和最大高度
    const minHeight = 40;
    const extra = options.extraHeight?.value || 0;
    // 总高度限制在视口的 70% 或 90%，所以编辑器最大高度要减去 extra
    const baseMax = options.isDetached ? window.innerHeight * 0.9 : window.innerHeight * 0.7;
    const maxHeight = Math.max(minHeight, baseMax - extra - 60); // 60 是给 toolbar 和 padding 留的余量

    const finalHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    // 更新自定义高度
    customHeight.value = finalHeight;
    customMaxHeight.value = finalHeight;
  };

  // 鼠标释放处理
  const handleMouseUp = () => {
    isResizing.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    // 移除全局事件监听
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  // 拖拽开始处理 - 输入框高度调整
  const handleInputResizeStart = (e: MouseEvent) => {
    options.onResizeStart?.();
    isResizing.value = true;
    startY.value = e.clientY;

    if (options.textareaRef.value) {
      // 获取组件根元素的实际高度
      const el = options.textareaRef.value.$el;
      startHeight.value = el?.offsetHeight || 0;
    }

    // 阻止默认行为和文本选择
    e.preventDefault();
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    // 添加全局事件监听
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // 双击手柄重置高度
  const handleResizeDoubleClick = () => {
    customHeight.value = "auto";
    customMaxHeight.value = "70vh";
  };

  // 组件卸载时清理事件监听
  onUnmounted(() => {
    if (isResizing.value) {
      handleMouseUp();
    }
  });

  return {
    isResizing,
    customHeight,
    customMaxHeight,
    editorHeight,
    editorMaxHeight,
    handleInputResizeStart,
    handleResizeDoubleClick,
  };
}
