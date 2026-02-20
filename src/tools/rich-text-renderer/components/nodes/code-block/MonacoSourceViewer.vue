<template>
  <div
    class="code-editor-container"
    :class="{
      expanded: isExpanded,
      'editor-ready': isEditorReady,
      'is-streaming': !closed,
    }"
    ref="containerRef"
  >
    <!-- Monaco 准备好之前显示 PreCodeNode -->
    <PreCodeNode v-if="!isEditorReady" :content="content" :line-numbers="true" />
    <div ref="editorEl" class="monaco-wrapper" :class="{ visible: isEditorReady }"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useIntersectionObserver } from "@vueuse/core";
import { useTheme } from "@composables/useTheme";
import { getMonacoLanguageId } from "@/utils/codeLanguages";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import PreCodeNode from "./PreCodeNode.vue";

// 动态导入，避免类型检查时就报错
type StreamMonacoModule = typeof import("stream-monaco");

const props = defineProps<{
  content: string;
  language?: string;
  isExpanded: boolean;
  wordWrapEnabled: boolean;
  codeFontSize: number;
  closed?: boolean;
}>();

const emit = defineEmits<{
  (e: "ready", fontSize: number): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const editorEl = ref<HTMLElement | null>(null);
const { isDark } = useTheme();
const logger = createModuleLogger("code-block/MonacoSourceViewer.vue");
const errorHandler = createModuleErrorHandler("code-block/MonacoSourceViewer.vue");

const isEditorReady = ref(false);
const isInitializing = ref(false);
const isIntersected = ref(false);
const lastContent = ref(""); // 已经同步给 Monaco 的内容
const contentBuffer = ref(""); // 待同步的缓冲区内容

// 用于 adjustLayout 的 rAF 防抖
let pendingLayoutFrame: number | null = null;
// 用于平滑消费缓冲区的节流定时器
let consumeTimer: ReturnType<typeof setInterval> | null = null;

// Chrome 警告修复：Monaco 注册非 passive 的 touchstart 监听器
const MONACO_TOUCH_PATCH_FLAG = "__guguMonacoPassiveTouch__";

function ensureMonacoPassiveTouchListeners() {
  try {
    const globalObj = window as any;
    if (globalObj[MONACO_TOUCH_PATCH_FLAG]) return;
    const proto = window.Element?.prototype;
    const nativeAdd = proto?.addEventListener;
    if (!proto || !nativeAdd) return;

    proto.addEventListener = function patchedMonacoTouchStart(
      this: Element,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) {
      const isTouchStart = type === "touchstart";
      const isMonaco = this.closest?.(".monaco-editor, .monaco-diff-editor");
      const hasPassive = options && typeof options === "object" && "passive" in options;

      if (isTouchStart && isMonaco && !hasPassive) {
        const newOptions =
          typeof options === "object" ? { ...options, passive: true } : { passive: true };
        return nativeAdd.call(this, type, listener, newOptions);
      }
      return nativeAdd.call(this, type, listener, options);
    };
    globalObj[MONACO_TOUCH_PATCH_FLAG] = true;
  } catch (e) {
    console.warn("[MonacoSourceViewer] Failed to patch touch events", e);
  }
}

// stream-monaco helpers
let updateCode: (code: string, lang: string) => void = () => {};
let appendCode: (code: string, lang: string) => void = () => {};
let cleanupEditor: () => void = () => {};
let setTheme: (theme: any) => Promise<void> = async () => {};
let getEditorView: () => any = () => ({ updateOptions: () => {} });

let cleanupResizeObserver: (() => void) | null = null;

const monacoLanguage = computed(() => getMonacoLanguageId(props.language));

// 获取内容高度
const computeContentHeight = (): number | null => {
  try {
    const editor = getEditorView();
    if (!editor) return null;

    let height = 0;
    if (typeof editor.getContentHeight === "function") {
      const h = editor.getContentHeight();
      if (h > 0) height = h;
    }

    if (height === 0) {
      const model = editor.getModel?.();
      const lineCount = model?.getLineCount?.() || 1;
      const lineHeight = 18;
      height = lineCount * lineHeight;
    }

    // 减少魔法数字偏移，流式传输时高度计算要更精准
    // 增加 4px 的冗余缓冲，防止浮点数舍入误差导致滚动条闪烁
    return Math.ceil(height) + (props.closed ? 20 : 12) + 4;
  } catch {
    return null;
  }
};

const setAutomaticLayout = (enabled: boolean) => {
  try {
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === "function") {
      editor.updateOptions({ automaticLayout: enabled });
    }
  } catch (error) {
    errorHandler.handle(error, { userMessage: "设置 automaticLayout 失败", showToUser: false });
  }
};

/**
 * 实际执行布局调整（内部方法，不应直接调用）
 */
const doAdjustLayout = () => {
  const editor = getEditorView();
  const container = containerRef.value;
  if (!editor || !container || !editorEl.value) return;

  const contentHeight = computeContentHeight();

  if (contentHeight && contentHeight > 0) {
    const maxHeightInCollapsed = 500;
    const isSaturated = !props.isExpanded && contentHeight >= maxHeightInCollapsed;

    if (props.isExpanded) {
      // 展开模式：解除所有高度限制，由内容撑开
      // 注意：这里必须显式设置容器高度，否则 CSS transition 可能无法正确计算目标值
      editorEl.value.style.height = `${contentHeight}px`;
      container.style.maxHeight = `${contentHeight}px`;
      container.style.height = "auto";

      // 在下一帧解除 maxHeight 限制，确保 transition 结束后不会被截断
      nextTick(() => {
        if (props.isExpanded && containerRef.value) {
          containerRef.value.style.maxHeight = "none";
        }
      });
    } else {
      const editorHeight = Math.min(contentHeight, maxHeightInCollapsed);

      // 折叠模式：饱和状态下强制同步物理高度，防止滚动条计算偏差
      editorEl.value.style.height = `${editorHeight}px`;
      container.style.height = `${editorHeight}px`;
      container.style.maxHeight = `${maxHeightInCollapsed}px`;
    }

    // 饱和状态下（高度达到 500px），显式控制滚动条
    // 关键优化：在流式传输期间（!props.closed），即使饱和也保持滚动条隐藏，防止频繁计算导致的闪烁
    if (isSaturated) {
      const shouldShowScrollbar = !!props.closed;
      editor.updateOptions({
        scrollbar: {
          vertical: shouldShowScrollbar ? "auto" : "hidden",
          verticalScrollbarSize: shouldShowScrollbar ? 10 : 0,
          alwaysConsumeMouseWheel: isSaturated,
          // 彻底禁用流式期间的阴影和额外布局计算
          useShadows: shouldShowScrollbar,
        },
        // 流式期间禁用滚动条装饰
        hideCursorInOverviewRuler: !shouldShowScrollbar,
        scrollBeyondLastLine: shouldShowScrollbar,
      });
    } else {
      editor.updateOptions({
        scrollbar: {
          vertical: "hidden",
          verticalScrollbarSize: 0,
          alwaysConsumeMouseWheel: false,
          useShadows: false,
        },
      });
    }
  }

  if (typeof editor.layout === "function") {
    editor.layout();
  }
};

/**
 * 请求布局调整（rAF 防抖，避免流式模式下的高频调用和循环触发）
 */
const adjustLayout = () => {
  if (pendingLayoutFrame !== null) return;
  pendingLayoutFrame = requestAnimationFrame(() => {
    pendingLayoutFrame = null;
    doAdjustLayout();
  });
};

/**
 * 节流消费内容缓冲区：以固定频率批量同步内容，减少 Monaco 重绘
 */
const startConsumingBuffer = () => {
  if (consumeTimer) return;

  consumeTimer = setInterval(() => {
    if (!isEditorReady.value || contentBuffer.value.length === 0) {
      if (props.closed) {
        stopConsumingBuffer();
      }
      return;
    }

    // 批量取出当前缓冲区的所有内容
    const toAppend = contentBuffer.value;
    contentBuffer.value = "";

    const currentTotal = lastContent.value + toAppend;
    appendCode(toAppend, monacoLanguage.value);
    lastContent.value = currentTotal;

    adjustLayout();

    if (props.closed && contentBuffer.value.length === 0) {
      stopConsumingBuffer();
    }
  }, 260); // 节流周期，平衡实时性与渲染压力
};

const stopConsumingBuffer = () => {
  if (consumeTimer) {
    clearInterval(consumeTimer);
    consumeTimer = null;
  }
};

const initEditor = async () => {
  if (isInitializing.value || isEditorReady.value || !editorEl.value) return;
  isInitializing.value = true;

  try {
    const sm = (await import("stream-monaco")) as StreamMonacoModule;
    if (!editorEl.value) return;

    const useMonaco = sm.useMonaco;
    const editorOptions = {
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: props.codeFontSize,
      lineNumbers: "on" as const,
      renderLineHighlight: "none" as const,
      renderValidationDecorations: "off" as const,
      scrollbar: {
        vertical: "auto" as const,
        horizontal: "auto" as const,
        handleMouseWheel: !props.isExpanded,
        useShadows: false,
      },
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      wordWrap: props.wordWrapEnabled ? ("on" as const) : ("off" as const),
      wrappingIndent: "same" as const,
      folding: true,
      automaticLayout: false,
      theme: isDark.value ? "vs-dark" : "vs",
    };

    logger.debug("Initializing Monaco Source Viewer", { language: monacoLanguage.value });
    const helpers = useMonaco({
      ...editorOptions,
      updateThrottleMs: 60,
      revealDebounceMs: 100,
      minimalEditMaxChars: 200000,
    });

    await helpers.createEditor(editorEl.value, "", monacoLanguage.value);

    updateCode = helpers.updateCode;
    appendCode = helpers.appendCode || helpers.updateCode;
    cleanupEditor = helpers.cleanupEditor;
    setTheme = helpers.setTheme;
    getEditorView = helpers.getEditorView || getEditorView;

    if (props.content) {
      updateCode(props.content, monacoLanguage.value);
      lastContent.value = props.content;
    }

    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === "function") {
      emit("ready", editorOptions.fontSize);
    }

    isEditorReady.value = true;
    await nextTick();
    adjustLayout();

    if (editorEl.value) {
      editorEl.value.style.width = "100%";
      editorEl.value.style.overflow = "hidden";
      editorEl.value.style.maxHeight = "none";
    }

    const container = containerRef.value;
    if (container) {
      ensureMonacoPassiveTouchListeners();
      const resizeObserver = new ResizeObserver(() => {
        // 仅通知 Monaco 重新布局，且使用 rAF 节流，避免同步调用导致的死循环
        adjustLayout();
      });
      resizeObserver.observe(container);
      cleanupResizeObserver = () => resizeObserver.disconnect();
    }
  } catch (error) {
    errorHandler.error(error, "初始化代码块失败");
  } finally {
    isInitializing.value = false;
  }
};

onMounted(() => {
  if (containerRef.value) {
    const { stop } = useIntersectionObserver(
      containerRef,
      ([{ isIntersecting }]) => {
        if (isIntersecting && !isIntersected.value) {
          isIntersected.value = true;
          initEditor();
          stop();
        }
      },
      { rootMargin: "400px" }
    );
  }
});

watch(isDark, async (dark) => {
  await setTheme(dark ? "vs-dark" : "vs");
});

onUnmounted(() => {
  if (pendingLayoutFrame !== null) {
    cancelAnimationFrame(pendingLayoutFrame);
    pendingLayoutFrame = null;
  }
  stopConsumingBuffer();
  if (typeof cleanupEditor === "function") cleanupEditor();
  if (cleanupResizeObserver) {
    cleanupResizeObserver();
    cleanupResizeObserver = null;
  }
});

watch(
  () => props.content,
  (newContent) => {
    // 计算当前组件已知的完整内容（已同步 + 缓冲中）
    const knownContent = lastContent.value + contentBuffer.value;
    if (newContent === knownContent) return;

    if (isEditorReady.value) {
      if (!props.closed) {
        // 流式模式：放入缓冲区，通过定时器节流同步
        if (newContent.startsWith(knownContent)) {
          const delta = newContent.slice(knownContent.length);
          contentBuffer.value += delta;
          startConsumingBuffer();
        } else {
          // 发生非增量变化（如重置或大幅跳变），直接更新
          stopConsumingBuffer();
          contentBuffer.value = "";
          updateCode(newContent, monacoLanguage.value);
          lastContent.value = newContent;
          adjustLayout();
        }
      } else {
        // 非流式模式：直接更新
        stopConsumingBuffer();
        contentBuffer.value = "";
        updateCode(newContent, monacoLanguage.value);
        lastContent.value = newContent;
        adjustLayout();
      }
    } else {
      // 编辑器未就绪，仅同步状态
      lastContent.value = newContent;
      contentBuffer.value = "";
    }
  }
);

watch(
  () => props.closed,
  (isClosed) => {
    if (!isEditorReady.value) return;

    if (isClosed) {
      // 流式结束：停止节流定时器并清空缓冲区，确保同步最终内容
      stopConsumingBuffer();
      contentBuffer.value = "";
      updateCode(props.content, monacoLanguage.value);
      lastContent.value = props.content;

      // 强制触发一次布局调整，以显示滚动条
      nextTick(() => {
        adjustLayout();
      });
    }
  }
);

watch(
  () => props.isExpanded,
  (expanded) => {
    const editor = getEditorView();
    if (!editor) return;
    if (expanded) {
      setAutomaticLayout(true);
      editor.updateOptions({ scrollbar: { handleMouseWheel: false } });
    } else {
      setAutomaticLayout(false);
      editor.updateOptions({ scrollbar: { handleMouseWheel: true } });
    }
    adjustLayout();
  }
);

watch(
  () => props.codeFontSize,
  (size) => {
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === "function") {
      editor.updateOptions({ fontSize: size });
    }
  }
);

watch(
  () => props.wordWrapEnabled,
  (enabled) => {
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === "function") {
      editor.updateOptions({ wordWrap: enabled ? "on" : "off" });
      adjustLayout();
    }
  }
);

// 暴露 layout 方法
defineExpose({
  layout: () => {
    const editor = getEditorView();
    if (editor && typeof editor.layout === "function") {
      editor.layout();
    }
  },
});
</script>

<style scoped>
.code-editor-container {
  height: auto;
  max-height: 500px;
  min-height: 20px;
  position: relative;
  transition: max-height 0.3s ease-in-out;
  overflow: hidden !important; /* 强制容器级别不出现滚动条 */
}

/* 流式传输期间禁用过渡动画，防止高度追赶导致的闪烁 */
.code-editor-container.is-streaming {
  transition: none !important;
}

.code-editor-container > div {
  width: 100%;
}

.monaco-wrapper {
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
  height: 0;
  overflow: hidden !important; /* 强制 wrapper 不产生任何滚动条 */
}

.monaco-wrapper.visible {
  opacity: 1;
  height: auto;
}

:deep(.monaco-editor) {
  height: 100% !important;
}

/* 强制 Monaco 内部的溢出保护层不产生滚动条，滚动由 Monaco 内部逻辑控制 */
:deep(.monaco-editor .overflow-guard) {
  overflow: hidden !important;
}

:deep(.monaco-editor),
:deep(.monaco-editor .margin),
:deep(.monaco-editor .monaco-editor-background),
:deep(.monaco-editor .overflow-guard),
:deep(.monaco-editor .lines-content) {
  background-color: var(--code-block-bg, var(--container-bg)) !important;
}
</style>
