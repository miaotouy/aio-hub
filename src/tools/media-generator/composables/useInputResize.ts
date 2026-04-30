import { ref, computed, onUnmounted, type Ref } from "vue";

interface UseInputResizeOptions {
  textareaRef: Ref<any>;
  extraHeight?: Ref<number>;
}

export function useInputResize(options: UseInputResizeOptions) {
  const isResizing = ref(false);
  const startY = ref(0);
  const startHeight = ref(0);
  const customHeight = ref<string | number>("auto");
  const customMaxHeight = ref<string | number | null>(null);

  const editorHeight = computed(() => customHeight.value);

  const editorMaxHeight = computed(() => {
    const extra = options.extraHeight?.value || 0;
    if (typeof customMaxHeight.value === "number") {
      return customMaxHeight.value;
    }
    return `calc(40vh - ${extra}px)`;
  });

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value || !options.textareaRef.value) return;

    const deltaY = startY.value - e.clientY;
    const newHeight = startHeight.value + deltaY;

    const minHeight = 40;
    const extra = options.extraHeight?.value || 0;
    const maxHeight = Math.max(minHeight, window.innerHeight * 0.7 - extra - 60);
    const finalHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    customHeight.value = finalHeight;
    customMaxHeight.value = finalHeight;
  };

  const handleMouseUp = () => {
    isResizing.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleInputResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    isResizing.value = true;
    startY.value = e.clientY;

    if (options.textareaRef.value) {
      const el = options.textareaRef.value.$el || options.textareaRef.value;
      startHeight.value = el?.offsetHeight || 0;
    }

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleResizeDoubleClick = () => {
    customHeight.value = "auto";
    customMaxHeight.value = null;
  };

  onUnmounted(() => {
    if (isResizing.value) {
      handleMouseUp();
    }
  });

  return {
    editorHeight,
    editorMaxHeight,
    handleInputResizeStart,
    handleResizeDoubleClick,
  };
}
