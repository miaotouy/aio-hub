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
    <div class="code-editor-layer">
      <!-- Monaco 准备好之前（或后台初始化时）显示 PreCodeNode -->
      <PreCodeNode
        v-if="!isEditorReady"
        class="pre-fallback"
        :content="content"
        :line-numbers="true"
        :style="preFallbackStyle"
      />
      <!-- Monaco 容器：用 opacity 隐藏而不是 v-if，允许其在后台完成初始化 -->
      <div
        ref="editorEl"
        class="monaco-wrapper"
        :class="{ visible: isEditorReady, 'is-hidden': !isEditorReady }"
      ></div>
    </div>
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

// 渲染守卫帧：在内容大幅变化或流式结束时，等待几帧再计算高度
const resumeGuardFrames = ref(0);

// 用于 adjustLayout 的 rAF 防抖
let pendingLayoutFrame: number | null = null;

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
let cleanupEditor: () => void = () => {};
let setTheme: (theme: any) => Promise<void> = async () => {};
let getEditorView: () => any = () => ({ updateOptions: () => {} });

let cleanupResizeObserver: (() => void) | null = null;

const monacoLanguage = computed(() => getMonacoLanguageId(props.language));

/**
 * 精确匹配 Monaco 字体样式的占位样式
 */
const preFallbackStyle = computed(() => {
  const fontSize = props.codeFontSize > 0 ? props.codeFontSize : 14;
  const lineHeight = Math.round(fontSize * 1.5);
  return {
    "--pre-font-size": `${fontSize}px`,
    "--pre-line-height": `${lineHeight}px`,
    fontSize: `${fontSize}px`,
    lineHeight: `${lineHeight}px`,
  };
});

/**
 * 同步 Monaco 内部的 CSS 变量到容器根元素
 * 解决主题切换或初始化时的颜色跳变/闪烁问题
 */
function syncEditorCssVars() {
  const editorWrapper = editorEl.value;
  const rootEl = containerRef.value;
  if (!editorWrapper || !rootEl) return;

  const editorRoot = (editorWrapper.querySelector(".monaco-editor") ||
    editorWrapper) as HTMLElement;
  const bgEl = (editorRoot.querySelector(".monaco-editor-background") || editorRoot) as HTMLElement;
  const fgEl = (editorRoot.querySelector(".view-lines") || editorRoot) as HTMLElement;

  try {
    const rootStyles = window.getComputedStyle(editorRoot);
    const bgStyles = window.getComputedStyle(bgEl);
    const fgStyles = window.getComputedStyle(fgEl);

    const fgVar = rootStyles.getPropertyValue("--vscode-editor-foreground").trim();
    const bgVar = rootStyles.getPropertyValue("--vscode-editor-background").trim();
    const selVar = rootStyles.getPropertyValue("--vscode-editor-selectionBackground").trim();

    const fg = fgVar || fgStyles.color || rootStyles.color;
    const bg = bgVar || bgStyles.backgroundColor || rootStyles.backgroundColor;

    if (fg) rootEl.style.setProperty("--vscode-editor-foreground", fg);
    if (bg) rootEl.style.setProperty("--vscode-editor-background", bg);
    if (selVar) rootEl.style.setProperty("--vscode-editor-selectionBackground", selVar);
  } catch {}
}

/**
 * 从 DOM 实际测量行高，确保高度计算精确
 */
function measureLineHeightFromDom(): number | null {
  try {
    const root = editorEl.value;
    if (!root) return null;
    const lineEl = root.querySelector(".view-line") as HTMLElement | null;
    if (lineEl) {
      const h = lineEl.getBoundingClientRect().height;
      if (h > 0) return h;
    }
  } catch {}
  return null;
}

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
      const lineHeight = measureLineHeightFromDom() || props.codeFontSize * 1.5;
      height = lineCount * lineHeight;
    }

    // 增加 1px 的冗余缓冲（PIXEL_EPSILON），防止浮点数舍入误差导致滚动条闪烁
    return Math.ceil(height) + (props.closed ? 20 : 12) + 1;
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

  // 渲染守卫：等待 Monaco 完成 Token 染色和初步布局
  if (resumeGuardFrames.value > 0) {
    resumeGuardFrames.value--;
    adjustLayout(); // 继续请求下一帧
    return;
  }

  // 记录滚动锚点，用于补偿高度变化导致的视口跳动
  const containerRect = container.getBoundingClientRect();
  const scrollAnchor = window.scrollY + containerRect.top;
  const oldHeight = containerRect.height;

  const contentHeight = computeContentHeight();

  if (contentHeight && contentHeight > 0) {
    const maxHeightInCollapsed = 500;
    const isSaturated = !props.isExpanded && contentHeight >= maxHeightInCollapsed;

    if (props.isExpanded) {
      const targetHeight = Math.ceil(contentHeight);
      editorEl.value.style.height = `${targetHeight}px`;
      container.style.maxHeight = `${targetHeight}px`;
      container.style.height = "auto";

      // 滚动补偿：如果在视口上方变长了，修正滚动位置
      const heightDelta = targetHeight - oldHeight;
      if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
        window.scrollBy(0, heightDelta);
      }

      nextTick(() => {
        if (props.isExpanded && containerRef.value) {
          containerRef.value.style.maxHeight = "none";
        }
      });
    } else {
      const editorHeight = Math.ceil(Math.min(contentHeight, maxHeightInCollapsed));
      editorEl.value.style.height = `${editorHeight}px`;
      container.style.height = `${editorHeight}px`;
      container.style.maxHeight = `${maxHeightInCollapsed}px`;

      // 滚动补偿
      const heightDelta = editorHeight - oldHeight;
      if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
        window.scrollBy(0, heightDelta);
      }
    }

    // 饱和状态下的滚动条控制
    if (isSaturated) {
      const shouldShowScrollbar = !!props.closed;
      editor.updateOptions({
        scrollbar: {
          vertical: shouldShowScrollbar ? "auto" : "hidden",
          verticalScrollbarSize: shouldShowScrollbar ? 10 : 0,
          alwaysConsumeMouseWheel: isSaturated,
          useShadows: shouldShowScrollbar,
        },
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
      updateThrottleMs: 32, // 提高更新频率到约 30fps，让增量解析更细碎平滑
      revealDebounceMs: 100,
      minimalEditMaxChars: 500000, // 增大增量编辑阈值，尽量避免全量重解析导致的高亮闪烁
      onThemeChange() {
        syncEditorCssVars();
      },
    });

    await helpers.createEditor(editorEl.value, "", monacoLanguage.value);

    updateCode = helpers.updateCode;
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
    syncEditorCssVars();
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
  syncEditorCssVars();
});

onUnmounted(() => {
  if (pendingLayoutFrame !== null) {
    cancelAnimationFrame(pendingLayoutFrame);
    pendingLayoutFrame = null;
  }
  if (typeof cleanupEditor === "function") cleanupEditor();
  if (cleanupResizeObserver) {
    cleanupResizeObserver();
    cleanupResizeObserver = null;
  }
});

watch(
  () => props.content,
  (newContent) => {
    if (newContent === lastContent.value) return;

    if (isEditorReady.value) {
      // 直接信任 stream-monaco 的增量检测机制
      // 只要 newContent 是以 lastContent 开头的，它内部会自动调用 applyEdits
      updateCode(newContent, monacoLanguage.value);
      lastContent.value = newContent;
      adjustLayout();
    } else {
      // 编辑器未就绪，仅同步状态
      lastContent.value = newContent;
    }
  }
);

watch(
  () => props.closed,
  (isClosed) => {
    if (!isEditorReady.value) return;

    if (isClosed) {
      // 流式结束：同步最终内容并触发渲染守卫
      updateCode(props.content, monacoLanguage.value);
      lastContent.value = props.content;
      resumeGuardFrames.value = 2; // 等待 2 帧，让 Monaco 完成最终染色和高度撑开

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

.code-editor-layer {
  display: grid;
  width: 100%;
}

.code-editor-layer > .monaco-wrapper,
.code-editor-layer > :deep(.pre-fallback) {
  grid-area: 1 / 1;
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

.monaco-wrapper.is-hidden {
  opacity: 0;
  pointer-events: none;
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
