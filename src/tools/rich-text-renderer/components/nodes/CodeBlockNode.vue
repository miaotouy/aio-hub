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
    <!-- 头部组件 -->
    <CodeBlockHeader
      :language="language"
      :view-mode="viewMode"
      :is-html="isHtml"
      :is-expanded="isExpanded"
      :word-wrap-enabled="wordWrapEnabled"
      :copied="copied"
      :code-font-size="codeFontSize"
      :code-font-min="codeFontMin"
      :code-font-max="codeFontMax"
      :default-code-font-size="defaultCodeFontSize"
      :font-baseline-ready="fontBaselineReady"
      :token-count="tokenCount"
      :show-token-count="!!context?.showTokenCount?.value"
      :content-length="content.length"
      :closed="closed"
      :seamless="seamless"
      :is-hovered="isHovered"
      @toggle-view-mode="toggleViewMode"
      @open-dialog-preview="openDialogPreview"
      @decrease-font="decreaseCodeFont"
      @reset-font="resetCodeFont"
      @increase-font="increaseCodeFont"
      @toggle-word-wrap="wordWrapEnabled = !wordWrapEnabled"
      @copy-code="copyCode"
      @toggle-expand="isExpanded = !isExpanded"
    />

    <!-- 代码查看器组件 -->
    <MonacoSourceViewer
      v-show="viewMode === 'code'"
      :content="content"
      :language="language"
      :is-expanded="isExpanded"
      :word-wrap-enabled="wordWrapEnabled"
      :code-font-size="codeFontSize"
      :closed="closed"
      @ready="handleEditorReady"
    />

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
import { ref, computed, watch, onMounted, inject } from "vue";
import { throttle } from "lodash-es";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import HtmlInteractiveViewer from "../HtmlInteractiveViewer.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";
import { calculatorProxy } from "@/tools/token-calculator/worker/calculator.proxy";

// 导入拆分出的组件
import CodeBlockHeader from "./code-block/CodeBlockHeader.vue";
import MonacoSourceViewer from "./code-block/MonacoSourceViewer.vue";

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
    generationMeta?: {
      modelId?: string;
      [key: string]: any;
    };
  }>(),
  {
    seamless: undefined,
    defaultExpanded: undefined,
  }
);

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
  // 无边框模式通常用于显式预览，但这里我们也遵循“必须是完整 HTML 页面”的原则
  // 且必须尊重全局的自动预览开关
  if (
    isSeamless &&
    defaultRenderHtml?.value &&
    isHtml.value &&
    (isFullHtmlPage.value || props.language?.toLowerCase() === "svg")
  ) {
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

// 判断是否为完整的 HTML 页面声明
const isFullHtmlPage = computed(() => {
  if (!props.content) return false;
  // 优化：流式场景下只需检测前几行内容（前 200 个字符足以包含 doctype 或 html 标签）
  const head = props.content.slice(0, 200).trim().toLowerCase();
  return head.startsWith("<!doctype") || head.includes("<html");
});

// 是否满足自动预览的条件
const isAutoPreviewable = computed(() => {
  const lang = props.language?.toLowerCase();
  return isHtml.value && (isFullHtmlPage.value || lang === "svg");
});

// 监听内容变化，实现流式输出过程中的自动预览切换
watch(
  isAutoPreviewable,
  (canPreview) => {
    // 仅当开启了自动预览开关，且当前还是代码模式时，才尝试自动切换
    if (canPreview && defaultRenderHtml?.value && viewMode.value === "code") {
      viewMode.value = "preview";
    }
  },
  { immediate: true }
);

// 悬停状态管理
const isHovered = ref(false);
let hoverTimer: any = null;

const handleMouseEnter = () => {
  if (hoverTimer) clearTimeout(hoverTimer);
  isHovered.value = true;
};

const handleMouseLeave = () => {
  hoverTimer = setTimeout(() => {
    isHovered.value = false;
  }, 100);
};

const handleContentHover = (hover: boolean) => {
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
  return codeFontSize.value > 0 && defaultCodeFontSize.value > 0;
});

// 展开状态
const isExpanded = ref(props.defaultExpanded ?? context?.defaultCodeBlockExpanded?.value ?? false);

const tokenCount = ref<number>(0);

/**
 * 计算 Token 数
 */
const updateTokenCount = throttle(async () => {
  if (!context?.showTokenCount?.value || !props.content) {
    return;
  }

  try {
    const modelId = props.generationMeta?.modelId || "gpt-4o";
    const result = await calculatorProxy.calculateTokens(props.content, modelId);
    tokenCount.value = result.count;
  } catch (error) {
    console.warn("[CodeBlockNode] Token calculation failed", error);
  }
}, 1000);

// 监听 content 变化更新 token
watch(
  () => props.content,
  () => {
    if (context?.showTokenCount?.value) {
      updateTokenCount();
    }
  },
  { immediate: true }
);

// 监听开关变化
watch(
  () => context?.showTokenCount?.value,
  (show) => {
    if (show) {
      updateTokenCount();
    }
  }
);

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

const handleEditorReady = (fontSize: number) => {
  defaultCodeFontSize.value = fontSize;
  codeFontSize.value = fontSize;
};

// 字体大小调整
const increaseCodeFont = () => {
  codeFontSize.value = Math.min(codeFontMax, codeFontSize.value + codeFontStep);
};

const decreaseCodeFont = () => {
  codeFontSize.value = Math.max(codeFontMin, codeFontSize.value - codeFontStep);
};

const resetCodeFont = () => {
  codeFontSize.value = defaultCodeFontSize.value;
};

onMounted(() => {
  // 初始化逻辑（目前 watch 已覆盖自动预览逻辑）
});
</script>

<style scoped>
.markdown-code-block {
  margin: 12px 0;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 无边框模式样式 */
.markdown-code-block.seamless-mode {
  border: none;
  background-color: transparent;
  margin: 8px 0;
  overflow: visible;
}

.markdown-code-block.seamless-mode .html-preview-container {
  border-top: none;
}

.html-preview-container {
  min-height: 50px;
  height: auto;
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
</style>
