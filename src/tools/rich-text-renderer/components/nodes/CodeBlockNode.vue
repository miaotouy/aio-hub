<template>
  <div
    class="markdown-code-block"
    :class="{
      'seamless-mode': seamless,
      hovered: isHovered,
      'no-cv': seamless && viewMode === 'preview',
    }"
    v-bind="$attrs"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="code-header" :class="{ floating: seamless && viewMode === 'preview' }">
      <div class="language-info">
        <span class="language-tag">{{ language || "文本" }}</span>
        <!-- 预览模式指示器 -->
        <span v-if="isHtml && viewMode === 'preview'" class="mode-tag">预览模式</span>
      </div>
      <div class="header-actions">
        <!-- HTML 预览切换按钮 -->
        <template v-if="isHtml">
          <el-tooltip
            :content="viewMode === 'preview' ? '查看源码' : '预览 HTML'"
            :show-after="300"
          >
            <button
              class="action-btn"
              :class="{ 'action-btn-active': viewMode === 'preview' }"
              @click="toggleViewMode"
            >
              <Code v-if="viewMode === 'preview'" :size="14" />
              <Eye v-else :size="14" />
            </button>
          </el-tooltip>

          <el-tooltip
            :content="closed === false ? '内容生成中...' : '在弹窗中预览'"
            :show-after="300"
          >
            <button class="action-btn" :disabled="closed === false" @click="openDialogPreview">
              <ExternalLink :size="14" />
            </button>
          </el-tooltip>

          <div class="divider"></div>
        </template>

        <!-- 字体大小调整按钮 -->
        <el-tooltip content="减小字体" :show-after="300">
          <button
            class="action-btn"
            :disabled="codeFontSize <= codeFontMin"
            @click="decreaseCodeFont"
          >
            <Minus :size="14" />
          </button>
        </el-tooltip>
        <el-tooltip content="重置字体大小" :show-after="300">
          <button
            class="action-btn"
            :disabled="!fontBaselineReady || codeFontSize === defaultCodeFontSize"
            @click="resetCodeFont"
          >
            <RotateCcw :size="14" />
          </button>
        </el-tooltip>
        <el-tooltip content="增大字体" :show-after="300">
          <button
            class="action-btn"
            :disabled="codeFontSize >= codeFontMax"
            @click="increaseCodeFont"
          >
            <Plus :size="14" />
          </button>
        </el-tooltip>

        <!-- 换行切换按钮 -->
        <el-tooltip :content="wordWrapEnabled ? '禁用换行' : '启用换行'" :show-after="300">
          <button
            class="action-btn"
            :class="{ 'action-btn-active': wordWrapEnabled }"
            @click="toggleWordWrap"
          >
            <WrapText :size="14" />
          </button>
        </el-tooltip>

        <!-- 复制按钮 -->
        <el-tooltip :content="copied ? '已复制' : '复制代码'" :show-after="300">
          <button class="action-btn" :class="{ 'action-btn-active': copied }" @click="copyCode">
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
          </button>
        </el-tooltip>

        <!-- 展开/折叠按钮 -->
        <el-tooltip :content="isExpanded ? '折叠' : '展开'" :show-after="300">
          <button class="action-btn" @click="toggleExpand">
            <Minimize2 v-if="isExpanded" :size="14" />
            <Maximize2 v-else :size="14" />
          </button>
        </el-tooltip>
      </div>
    </div>
    <!-- 容器本身负责滚动，而不是 Monaco 编辑器 -->
    <div
      class="code-editor-container"
      :class="{ expanded: isExpanded, 'editor-ready': isEditorReady }"
      v-show="viewMode === 'code'"
      ref="containerRef"
    >
      <!-- Monaco 准备好之前显示 PreCodeNode -->
      <PreCodeNode v-if="!isEditorReady" :content="content" :line-numbers="true" />
      <div ref="editorEl" class="monaco-wrapper" :class="{ visible: isEditorReady }"></div>
    </div>

    <!-- HTML 预览区域 (内嵌) -->
    <div v-if="viewMode === 'preview'" class="html-preview-container">
      <HtmlInteractiveViewer
        v-if="!shouldFreeze"
        :content="processedHtmlContent"
        :immediate="closed"
        auto-height
        :seamless="seamless"
        @content-hover="handleContentHover"
      />
      <div v-else class="html-preview-frozen">
        <div class="frozen-tip">
          <span class="tip-text">HTML 预览已冻结以节流性能</span>
          <el-button size="small" type="primary" @click="manualActive = true"> 恢复预览 </el-button>
        </div>
      </div>
    </div>
  </div>

  <!-- 弹窗预览 -->
  <BaseDialog v-model="showDialog" title="HTML 预览" width="90%" height="85vh">
    <HtmlInteractiveViewer :content="processedHtmlContent" :immediate="true" />
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject } from "vue";
import { useIntersectionObserver } from "@vueuse/core";
import {
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  RotateCcw,
  WrapText,
  Eye,
  Code,
  ExternalLink,
} from "lucide-vue-next";
import { useTheme } from "@composables/useTheme";
import { customMessage } from "@/utils/customMessage";
import { getMonacoLanguageId } from "@/utils/codeLanguages";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import HtmlInteractiveViewer from "../HtmlInteractiveViewer.vue";
import PreCodeNode from "./PreCodeNode.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";

// 动态导入，避免类型检查时就报错
type StreamMonacoModule = typeof import("stream-monaco");

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    nodeId: string;
    content: string;
    language?: string;
    closed?: boolean;
    seamless?: boolean;
    defaultExpanded?: boolean;
  }>(),
  {
    seamless: undefined,
    defaultExpanded: undefined,
  }
);

const containerRef = ref<HTMLElement | null>(null);
const editorEl = ref<HTMLElement | null>(null);
const { isDark } = useTheme();
const logger = createModuleLogger("tools/rich-text-renderer/components/nodes/CodeBlockNode.vue");
const errorHandler = createModuleErrorHandler(
  "tools/rich-text-renderer/components/nodes/CodeBlockNode.vue"
);

// 注入上下文以获取全局设置
const context = inject<RichTextContext>(RICH_TEXT_CONTEXT_KEY);
const defaultRenderHtml = context?.defaultRenderHtml;
const seamlessMode = context?.seamlessMode;
const resolveAsset = context?.resolveAsset;

// 手动激活状态（用于覆盖冻结逻辑）
const manualActive = ref(false);

// 冻结状态
const shouldFreeze = computed(() => {
  // 如果用户手动激活了，则不冻结
  if (manualActive.value) return false;
  return context?.shouldFreeze?.value ?? false;
});

// 经过资产转换后的内容（用于 HTML 预览）
const processedHtmlContent = computed(() => {
  if (isHtml.value && resolveAsset) {
    return resolveAsset(props.content);
  }
  return props.content;
});

// 无边框模式：优先使用 prop，其次使用上下文
const seamless = computed(() => {
  if (props.seamless !== undefined) {
    return props.seamless;
  }
  return seamlessMode?.value ?? false;
});

// 监听无边框模式变化，自动切换到预览模式
watch(seamless, (isSeamless) => {
  if (isSeamless && isHtml.value) {
    viewMode.value = "preview";
  }
});

// 视图模式
const viewMode = ref<"code" | "preview">("code");
const showDialog = ref(false);

// 判断是否为 HTML
const isHtml = computed(() => {
  const lang = props.language?.toLowerCase();
  return lang === "html" || lang === "xml" || lang === "svg";
});

// 悬停状态管理
const isHovered = ref(false);
let hoverTimer: any = null;

const handleMouseEnter = () => {
  if (hoverTimer) clearTimeout(hoverTimer);
  isHovered.value = true;
};

const handleMouseLeave = () => {
  // 延迟隐藏，给用户一点移动鼠标的时间
  hoverTimer = setTimeout(() => {
    isHovered.value = false;
  }, 100);
};

const handleContentHover = (hover: boolean) => {
  // 只处理进入事件，保持悬停状态
  // 离开事件由外层容器的 @mouseleave 统一处理
  // 避免鼠标从 iframe 移入悬浮 Header 时导致 Header 闪烁
  if (hover) {
    handleMouseEnter();
  }
};

// 切换视图模式
const toggleViewMode = () => {
  viewMode.value = viewMode.value === "code" ? "preview" : "code";
};

// 打开弹窗预览
const openDialogPreview = () => {
  showDialog.value = true;
};

// 复制状态
const copied = ref(false);

// 换行状态
const wordWrapEnabled = ref(false);

// 字体大小控制
const codeFontMin = 10;
const codeFontMax = 36;
const codeFontStep = 1;
const defaultCodeFontSize = ref<number>(14);
const codeFontSize = ref<number>(14);
const fontBaselineReady = computed(() => {
  const a = defaultCodeFontSize.value;
  const b = codeFontSize.value;
  return (
    typeof a === "number" &&
    Number.isFinite(a) &&
    a > 0 &&
    typeof b === "number" &&
    Number.isFinite(b) &&
    b > 0
  );
});

const monacoLanguage = computed(() => {
  return getMonacoLanguageId(props.language);
});

// stream-monaco helpers - 提供默认空实现
let updateCode: (code: string, lang: string) => void = () => {};
let appendCode: (code: string, lang: string) => void = () => {};
let cleanupEditor: () => void = () => {};
let setTheme: (theme: any) => Promise<void> = async () => {};
let getEditorView: () => any = () => ({ updateOptions: () => {} });

// 追踪内容以支持流式追加
const lastContent = ref("");

// 编辑器状态
const isIntersected = ref(false);
const isEditorReady = ref(false);
const isInitializing = ref(false);

// ResizeObserver 清理函数
let cleanupResizeObserver: (() => void) | null = null;

// 展开状态
const isExpanded = ref(props.defaultExpanded ?? context?.defaultCodeBlockExpanded?.value ?? false);

// 复制代码
const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(props.content);
    copied.value = true;
    customMessage.success("代码已复制");
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    errorHandler.error(error, "复制失败");
  }
};

// 获取内容高度
const computeContentHeight = (): number | null => {
  try {
    const editor = getEditorView();
    if (!editor) return null;

    let height = 0;

    // 优先使用 Monaco 的 contentHeight
    if (typeof editor.getContentHeight === "function") {
      const h = editor.getContentHeight();
      if (h > 0) {
        height = h;
      }
    }

    // 后备方案
    if (height === 0) {
      const model = editor.getModel?.();
      const lineCount = model?.getLineCount?.() || 1;
      const lineHeight = 18; // 默认行高
      height = lineCount * lineHeight;
    }

    // +12px 缓冲区，为水平滚动条预留空间，避免展开时出现垂直滚动条
    return Math.ceil(height) + 12;
  } catch {
    return null;
  }
};

// 设置 automaticLayout
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

// 切换展开/折叠
const toggleExpand = async () => {
  isExpanded.value = !isExpanded.value;
  logger.debug("切换展开状态", { isExpanded: isExpanded.value });

  const editor = getEditorView();
  // 我们要操作的是 .code-editor-container，它是 editorEl 的父元素
  const container = editorEl.value?.parentElement;
  if (!editor || !container || !editorEl.value) return;

  // 等待 Vue 更新 DOM，应用/移除 .expanded 类
  await nextTick();

  try {
    const contentHeight = computeContentHeight();
    if (!contentHeight || contentHeight <= 0) return;

    if (isExpanded.value) {
      // 展开：启用自动布局，editorEl 和 container 都使用内容高度
      setAutomaticLayout(true);
      editorEl.value.style.height = `${contentHeight}px`;
      container.style.maxHeight = `${contentHeight}px`;
      // 禁用 Monaco 的滚轮处理，让事件冒泡到外层，实现滚动消息列表
      editor.updateOptions({ scrollbar: { handleMouseWheel: false } });
    } else {
      // 收起：禁用自动布局，editorEl 高度限制为 min(内容高度, 500px)
      setAutomaticLayout(false);
      const maxHeightInCollapsed = 500;
      const editorHeight = Math.min(contentHeight, maxHeightInCollapsed);
      editorEl.value.style.height = `${editorHeight}px`;
      container.style.maxHeight = ""; // 恢复由 CSS 控制（500px）
      // 启用 Monaco 的滚轮处理，实现编辑器内部滚动
      editor.updateOptions({ scrollbar: { handleMouseWheel: true } });
    }

    // 触发重新布局
    if (typeof editor.layout === "function") {
      // 延迟一小段时间，确保 CSS transition 开始
      setTimeout(() => editor.layout(), 50);
    }
  } catch (error) {
    errorHandler.error(error, "切换展开状态失败");
  }
};

// 字体大小调整
const increaseCodeFont = () => {
  const newSize = Math.min(codeFontMax, codeFontSize.value + codeFontStep);
  codeFontSize.value = newSize;
  updateEditorFontSize(newSize);
};

const decreaseCodeFont = () => {
  const newSize = Math.max(codeFontMin, codeFontSize.value - codeFontStep);
  codeFontSize.value = newSize;
  updateEditorFontSize(newSize);
};

const resetCodeFont = () => {
  codeFontSize.value = defaultCodeFontSize.value;
  updateEditorFontSize(defaultCodeFontSize.value);
};

const updateEditorFontSize = (size: number) => {
  try {
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === "function") {
      editor.updateOptions({ fontSize: size });
    }
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "更新字体大小失败",
      showToUser: false,
      context: { size },
    });
  }
};

// 切换换行
const toggleWordWrap = () => {
  wordWrapEnabled.value = !wordWrapEnabled.value;
  try {
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === "function") {
      editor.updateOptions({
        wordWrap: wordWrapEnabled.value ? "on" : "off",
      });
      adjustLayout();
    }
  } catch (error) {
    errorHandler.error(error, "切换换行失败");
  }
};

// 统一的高度调整逻辑，增加防抖以优化性能
let layoutTimer: any = null;
const adjustLayout = () => {
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    nextTick(() => {
      const editor = getEditorView();
      const container = editorEl.value?.parentElement;
      if (!editor || !container || !editorEl.value) return;

      const contentHeight = computeContentHeight();
      if (contentHeight && contentHeight > 0) {
        if (isExpanded.value) {
          editorEl.value.style.height = `${contentHeight}px`;
          container.style.maxHeight = `${contentHeight}px`;
        } else {
          const maxHeightInCollapsed = 500;
          const editorHeight = Math.min(contentHeight, maxHeightInCollapsed);
          editorEl.value.style.height = `${editorHeight}px`;
        }
      }
      // 触发重新布局
      if (typeof editor.layout === "function") {
        editor.layout();
      }
    });
  }, 100);
};

// 初始化编辑器核心逻辑
const initEditor = async () => {
  if (isInitializing.value || isEditorReady.value || !editorEl.value) return;
  isInitializing.value = true;

  try {
    const [sm, themeLight, themeDark] = await Promise.all([
      import("stream-monaco") as Promise<StreamMonacoModule>,
      import("shiki/themes/github-light.mjs"),
      import("shiki/themes/github-dark.mjs"),
    ]);

    if (!editorEl.value) return;

    const useMonaco = sm.useMonaco;
    if (typeof useMonaco !== "function") {
      logger.warn("stream-monaco 未安装或 useMonaco 未找到");
      return;
    }

    const editorOptions = {
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: "on" as const,
      renderLineHighlight: "none" as const,
      renderValidationDecorations: "off" as const,
      scrollbar: {
        vertical: "auto" as const,
        horizontal: "auto" as const,
        handleMouseWheel: true,
      },
      wordWrap: wordWrapEnabled.value ? ("on" as const) : ("off" as const),
      wrappingIndent: "same" as const,
      folding: true,
      automaticLayout: false,
      theme: isDark.value ? "github-dark" : "github-light",
    };

    const helpers = useMonaco({
      ...editorOptions,
      themes: [themeLight.default, themeDark.default],
      updateThrottleMs: 60, // VMR 优化：降低 CPU 占用
      revealDebounceMs: 100, // VMR 优化：合并滚动，减少抖动
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
      const actualFontSize = editorOptions.fontSize || 13;
      defaultCodeFontSize.value = actualFontSize;
      codeFontSize.value = actualFontSize;
    }

    // 标记准备就绪
    isEditorReady.value = true;

    await nextTick();
    adjustLayout();

    if (editorEl.value) {
      editorEl.value.style.width = "100%";
      editorEl.value.style.overflow = "hidden";
      editorEl.value.style.maxHeight = "none";
    }

    const container = editorEl.value?.parentElement;
    if (container) {
      const resizeObserver = new ResizeObserver(() => {
        const editor = getEditorView();
        if (editor && typeof editor.layout === "function") {
          requestAnimationFrame(() => {
            editor.layout();
          });
        }
      });
      resizeObserver.observe(container);
      cleanupResizeObserver = () => {
        resizeObserver.disconnect();
      };
    }
  } catch (error) {
    errorHandler.error(error, "初始化代码块失败");
  } finally {
    isInitializing.value = false;
  }
};

onMounted(() => {
  // 初始化视图模式
  if (isHtml.value && (defaultRenderHtml?.value || seamless.value)) {
    viewMode.value = "preview";
  }

  // 设置视口观察者
  if (containerRef.value) {
    const { stop } = useIntersectionObserver(
      containerRef,
      ([{ isIntersecting }]) => {
        if (isIntersecting && !isIntersected.value) {
          isIntersected.value = true;
          initEditor();
          stop(); // 一旦进入视口并开始初始化，就停止观察
        }
      },
      { rootMargin: "400px" } // 提前 400px 开始加载，参考 VMR 经验
    );
  }
});

watch(isDark, async (dark) => {
  await setTheme(dark ? "github-dark" : "github-light");
});

onUnmounted(() => {
  if (typeof cleanupEditor === "function") {
    cleanupEditor();
  }
  if (cleanupResizeObserver) {
    cleanupResizeObserver();
    cleanupResizeObserver = null;
  }
});

// 内容更新时，需要同步更新编辑器内容和高度
watch(
  () => props.content,
  (newContent) => {
    if (newContent === lastContent.value) return;

    if (isEditorReady.value) {
      // 流式追加优化
      if (newContent.startsWith(lastContent.value) && lastContent.value !== "") {
        const addedText = newContent.slice(lastContent.value.length);
        if (addedText) {
          appendCode(addedText, monacoLanguage.value);
        }
      } else {
        updateCode(newContent, monacoLanguage.value);
      }
      adjustLayout();
    }

    lastContent.value = newContent;
  }
);

// 监听流结束状态
watch(
  () => props.closed,
  (isClosed) => {
    if (isClosed) {
      updateCode(props.content, monacoLanguage.value);
      lastContent.value = props.content;
      adjustLayout();
    }
  }
);
</script>

<style scoped>
.markdown-code-block {
  margin: 12px 0;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  /* overflow: hidden 必须保留，以裁剪内部圆角 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  /* 移除 content-visibility，避免在高度自适应计算时出现问题 */
  /* content-visibility: auto; */
  /* contain-intrinsic-size: 150px; */
}

/* 无边框模式样式 */
.markdown-code-block.seamless-mode {
  border: none;
  background-color: transparent;
  margin: 8px 0;
  overflow: visible; /* 允许 Header 溢出 */
}

.markdown-code-block.seamless-mode .html-preview-container {
  border-top: none;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--code-block-bg, var(--card-bg));
  flex-shrink: 0;
}
/* 悬浮 Header 模式 */
.code-header.floating {
  position: absolute;
  top: -40px; /* 移到上方 */
  height: 40px;
  left: 0;
  right: 0;
  padding: 0 8px 4px 8px; /* 底部留一点空隙 */
  background-color: transparent;
  pointer-events: none; /* 让鼠标穿透空白区域 */
  z-index: 10;
  justify-content: flex-end; /* 靠右对齐 */
  align-items: flex-end; /* 底部对齐 */
}

.code-header.floating .language-info {
  display: none; /* 隐藏语言标签 */
}

.code-header.floating .header-actions {
  /* 悬浮模式下使用更清晰的背景，并叠加毛玻璃效果 */
  background-color: var(--el-bg-color);
  backdrop-filter: blur(var(--ui-blur, 10px));
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px;
  box-shadow: var(--el-box-shadow-light);
  pointer-events: auto; /* 恢复按钮点击 */
  opacity: 0;
  transform: translateY(5px);
  transition: all 0.2s ease-in-out;
  position: relative; /* 用于伪元素定位 */
}

/* 桥接层：增加一个透明的伪元素，填补 Header 和内容之间的缝隙，防止鼠标移出时状态丢失 */
.code-header.floating .header-actions::after {
  content: "";
  position: absolute;
  bottom: -15px; /* 向下延伸 */
  left: 0;
  right: 0;
  height: 20px;
  background: transparent;
  z-index: -1;
}

.markdown-code-block.hovered .code-header.floating .header-actions {
  opacity: 1;
  transform: translateY(0);
}

.language-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.language-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  opacity: 0;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-btn:hover:not(:disabled) {
  color: var(--el-text-color-primary);
  transform: translateY(-1px);
}

.action-btn:hover:not(:disabled)::before {
  opacity: 1;
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-active {
  background-color: var(--el-color-primary);
  color: white;
}

.action-btn-active::before {
  display: none;
}

.action-btn-active:hover:not(:disabled) {
  background-color: var(--el-color-primary-light-3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.code-editor-container {
  /* 容器高度自适应，但最大不超过500px */
  height: auto;
  max-height: 500px;
  min-height: 20px;
  position: relative;
  /* 过渡效果应用在 max-height 上 */
  transition: max-height 0.3s ease-in-out;
  /* 容器不需要滚动，让内部 Monaco 处理 */
  overflow: hidden;
}

.html-preview-container {
  /* 移除固定高度，允许自适应 */
  /* min-height 设置为 500px，防止依赖 vh 的应用（如游戏）因高度塌陷而缩成一团 */
  min-height: 50px;
  height: auto;
  /* max-height: 75vh;  如果不希望有限制，可以注释掉这行，或者设得更大 */
  border-top: 1px solid var(--border-color);
}

.html-preview-frozen {
  padding: 40px 20px;
  background-color: var(--bg-color);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120px;
}

.frozen-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-color-light);
  font-size: 13px;
}

.frozen-tip .tip-text {
  opacity: 0.8;
}

/* Monaco 编辑器容器的 div 高度由 JS 动态设置 */
.code-editor-container > div {
  width: 100%;
}

.monaco-wrapper {
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
  height: 0;
  overflow: hidden;
}

.monaco-wrapper.visible {
  opacity: 1;
  height: auto;
}

:deep(.monaco-editor) {
  height: 100% !important;
}

/* 适配主题外观：使 Monaco 编辑器背景透明，使用经过颜色混合处理的背景变量 */
:deep(.monaco-editor) {
  /*
    Monaco 的主题会注入一个 .monaco-editor 选择器来覆盖 --vscode-editor-background 变量。
    我们需要用 Vue 的 scoped style 生成的更高优先级的选择器 ([data-v-xxxx]) 来覆盖回去。
    这里我们不能直接使用 var(--vscode-editor-background)，因为它已经被污染了。
    我们根据 useThemeAppearance 的逻辑重新构建正确的背景色，并使用 --code-block-bg 变量来同步设置。
  */
  --vscode-editor-background: var(--code-block-bg, var(--container-bg)) !important;
  --vscode-editorGutter-background: var(--code-block-bg, var(--container-bg)) !important;
  --vscode-editorStickyScrollGutter-background: var(--code-block-bg, var(--card-bg)) !important;
  --vscode-editorStickyScroll-background: var(--code-block-bg, var(--card-bg)) !important;
  --vscode-editorStickyScroll-shadow: var(--code-block-bg, var(--card-bg)) !important;
}

:deep(.monaco-editor .monaco-editor-background),
:deep(.monaco-editor .overflow-guard),
:deep(.monaco-editor .lines-content) {
  background-color: var(--vscode-editor-background) !important;
}

:deep(.monaco-editor .margin) {
  background-color: var(--vscode-editorGutter-background) !important;
}
</style>
