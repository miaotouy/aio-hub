<template>
  <div class="rich-text-renderer" :style="cssVariables">
    <!-- AST 渲染模式（V1/V2 等） -->
    <AstNodeRenderer
      v-if="useAstRenderer"
      :nodes="ast"
      :generation-meta="generationMeta"
      :enable-enter-animation="enableEnterAnimation"
    />
    <!-- 纯 markdown-it 渲染模式 -->
    <div v-else class="pure-markdown-renderer" v-html="htmlContent" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref, computed, provide } from "vue";
import { throttle } from "lodash-es";
import MarkdownIt from "markdown-it";
import { useMarkdownAst } from "./composables/useMarkdownAst";
import { StreamProcessor } from "./core/StreamProcessor";
import { StreamProcessorV2 } from "./core/StreamProcessorV2";
import AstNodeRenderer from "./components/AstNodeRenderer.tsx";
import type {
  StreamSource,
  LlmThinkRule,
  RichTextRendererStyleOptions,
  MarkdownStyleOption,
  AstNode,
} from "./types";
import { RendererVersion, RICH_TEXT_CONTEXT_KEY } from "./types";
import { applyRegexRules } from "@/tools/llm-chat/utils/chatRegexUtils";
import type { ChatRegexRule } from "@/tools/llm-chat/types/chatRegex";

const props = withDefaults(
  defineProps<{
    content?: string;
    streamSource?: StreamSource;
    version?: RendererVersion; // 渲染器版本
    llmThinkRules?: LlmThinkRule[]; // LLM 思考节点规则配置
    styleOptions?: RichTextRendererStyleOptions; // 样式配置
    generationMeta?: any; // 生成元数据（用于计时）
    isStreaming?: boolean; // 是否处于流式传输中（用于控制思考块的闭合状态）
    defaultRenderHtml?: boolean; // 是否默认渲染 HTML 代码块
    seamlessMode?: boolean; // HTML 预览无边框模式
    defaultCodeBlockExpanded?: boolean; // 代码块默认展开
    defaultToolCallCollapsed?: boolean; // 工具调用默认折叠
    enableCdnLocalizer?: boolean; // 是否启用 CDN 资源本地化
    throttleMs?: number; // 节流时间（毫秒）
    enableEnterAnimation?: boolean; // 是否启用节点进入动画
    allowExternalScripts?: boolean; // 是否允许加载外部资源（如 CDN 脚本、样式）
    regexRules?: ChatRegexRule[]; // 正则表达式规则
    resolveAsset?: (content: string) => string; // 资产路径解析钩子
    shouldFreeze?: boolean; // 是否冻结 HTML 预览
    allowDangerousHtml?: boolean; // 是否允许渲染危险的 HTML 标签
  }>(),
  {
    version: RendererVersion.V1_MARKDOWN_IT,
    isStreaming: false,
    defaultRenderHtml: false,
    seamlessMode: false,
    defaultCodeBlockExpanded: false,
    defaultToolCallCollapsed: false,
    enableCdnLocalizer: true,
    allowExternalScripts: false,
    enableEnterAnimation: true,
    shouldFreeze: false,
    allowDangerousHtml: false,
    throttleMs: 80, // 默认 80ms 节流，避免打字机效果过于频繁
    llmThinkRules: () => [
      // 默认规则：标准 <think> 标签
      {
        id: "standard-think",
        kind: "xml_tag",
        tagName: "think",
        displayName: "AI 思考过程",
        collapsedByDefault: true,
      },
    ],
    styleOptions: () => ({}),
    regexRules: () => [],
  }
);

/**
 * 将样式配置转换为 CSS 变量
 */
const cssVariables = computed(() => {
  const vars: Record<string, string> = {};
  const opts = props.styleOptions;

  if (!opts) return vars;

  // 全局总开关：如果关闭则不生成任何 CSS 变量
  if (opts.globalEnabled === false) return vars;

  // 辅助函数：生成变量名并赋值
  const addVars = (prefix: string, style?: MarkdownStyleOption) => {
    if (!style) return;
    // 子项开关：如果 enabled 为 false，则跳过生成 CSS 变量
    if (style.enabled === false) return;
    if (style.color) vars[`--md-${prefix}-color`] = style.color;
    if (style.backgroundColor) vars[`--md-${prefix}-bg-color`] = style.backgroundColor;
    if (style.borderColor) vars[`--md-${prefix}-border-color`] = style.borderColor;
    if (style.fontWeight) vars[`--md-${prefix}-font-weight`] = String(style.fontWeight);
    if (style.fontStyle) vars[`--md-${prefix}-font-style`] = style.fontStyle;
    if (style.textDecoration) vars[`--md-${prefix}-text-decoration`] = style.textDecoration;
    if (style.textShadow) vars[`--md-${prefix}-text-shadow`] = style.textShadow;
    if (style.boxShadow) vars[`--md-${prefix}-box-shadow`] = style.boxShadow;
    if (style.borderRadius) vars[`--md-${prefix}-border-radius`] = style.borderRadius;
  };

  addVars("paragraph", opts.paragraph);
  addVars("strong", opts.strong);
  addVars("em", opts.em);
  addVars("strikethrough", opts.strikethrough);
  addVars("quote", opts.quote);
  addVars("blockquote", opts.blockquote);
  addVars("alert", opts.alert);
  addVars("inline-code", opts.inlineCode);
  addVars("link", opts.link);

  // 标题
  addVars("h1", opts.h1);
  addVars("h2", opts.h2);
  addVars("h3", opts.h3);
  addVars("h4", opts.h4);
  addVars("h5", opts.h5);
  addVars("h6", opts.h6);

  return vars;
});

// 是否使用 AST 渲染器（V1 / V2 等）
const useAstRenderer = computed(
  () =>
    props.version === RendererVersion.V1_MARKDOWN_IT ||
    props.version === RendererVersion.V2_CUSTOM_PARSER
);

// AST 状态
const { ast, enqueuePatch } = useMarkdownAst({ throttleMs: props.throttleMs });

// 图片列表状态
const imageList = ref<string[]>([]);

/**
 * 递归提取 AST 中的所有图片链接
 */
const extractImages = (nodes: AstNode[]): string[] => {
  const images: string[] = [];
  const traverse = (nodeList: AstNode[]) => {
    for (const nodeListElement of nodeList) {
      if (nodeListElement.type === "image" && "src" in nodeListElement.props) {
        images.push((nodeListElement.props as { src: string }).src);
      }
      if (nodeListElement.children && nodeListElement.children.length > 0) {
        traverse(nodeListElement.children);
      }
    }
  };
  traverse(nodes);
  return images;
};

/**
 * 节流版的图片提取函数
 * 避免在流式输出过程中频繁深度遍历 AST 导致性能下降
 */
const throttledUpdateImageList = throttle(
  (nodes: AstNode[]) => {
    imageList.value = extractImages(nodes);
  },
  1000,
  { leading: true, trailing: true }
);

// 监听 AST 变化，更新图片列表
watch(
  ast,
  (newAst) => {
    if (useAstRenderer.value) {
      // 在流式传输中，使用节流更新
      if (props.isStreaming) {
        throttledUpdateImageList(newAst);
      } else {
        // 非流式状态下，立即更新一次以确保准确性
        imageList.value = extractImages(newAst);
      }
    }
  },
  { deep: true }
);

// 内部流式状态跟踪
const internalIsStreaming = ref(false);

// 提供上下文给子组件
provide(RICH_TEXT_CONTEXT_KEY, {
  images: imageList,
  defaultRenderHtml: computed(() => props.defaultRenderHtml),
  seamlessMode: computed(() => props.seamlessMode),
  defaultCodeBlockExpanded: computed(() => props.defaultCodeBlockExpanded),
  defaultToolCallCollapsed: computed(() => props.defaultToolCallCollapsed),
  enableCdnLocalizer: computed(() => props.enableCdnLocalizer),
  allowExternalScripts: computed(() => props.allowExternalScripts),
  allowDangerousHtml: computed(() => props.allowDangerousHtml),
  resolveAsset: props.resolveAsset,
  shouldFreeze: computed(() => props.shouldFreeze),
  isStreaming: computed(() => props.isStreaming || internalIsStreaming.value),
});

// 纯 markdown-it 渲染的 HTML
const htmlContent = ref("");

// 流式累积的原始文本缓冲
const buffer = ref("");

// markdown-it 实例（纯渲染模式）
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true,
});

/**
 * 根据版本创建对应的处理器（仅 AST 模式下使用）
 */
const createProcessor = (version: RendererVersion) => {
  switch (version) {
    case RendererVersion.V2_CUSTOM_PARSER: {
      // 提取思考标签名集合传递给 V2 处理器
      const thinkTagNames = new Set(props.llmThinkRules?.map((rule) => rule.tagName) || []);
      return new StreamProcessorV2({
        onPatch: enqueuePatch,
        llmThinkTagNames: thinkTagNames,
        llmThinkRules: props.llmThinkRules || [],
        defaultToolCallCollapsed: props.defaultToolCallCollapsed,
      });
    }
    case RendererVersion.V1_MARKDOWN_IT:
    default:
      return new StreamProcessor({
        onPatch: enqueuePatch,
        defaultToolCallCollapsed: props.defaultToolCallCollapsed,
      });
  }
};

// 当前使用的流式处理器（仅 AST 模式）
const streamProcessor = ref<any>(null);

let unsubscribe: (() => void) | null = null;
let unsubscribeComplete: (() => void) | null = null;

/**
 * 经过正则处理后的内容
 * 这是所有渲染逻辑的统一入口点
 */
const processedContent = computed(() => {
  let text = props.content || "";

  // 1. 应用正则规则
  if (props.regexRules && props.regexRules.length > 0) {
    text = applyRegexRules(text, props.regexRules);
  }

  // 2. 解析资产路径
  // 注意：在 AST 模式下，我们不再全局替换智能体资产链接 (agent-asset://)，而是交给具体的节点组件（如 ImageNode）处理
  // 这样可以避免 Markdown 解析器对转换后的本地 URL 进行二次编码导致 Tauri 无法识别路径。
  // 但是对于 file:// 协议，由于它是外部复制进来的且如果不转换则完全无法加载，我们在这里强制进行一次预处理。
  if (props.resolveAsset) {
    if (!useAstRenderer.value) {
      // 纯渲染模式：全量处理
      text = props.resolveAsset(text);
    } else if (text.includes("file://")) {
      // AST 模式：仅预处理 file:// 链接，agent-asset:// 留给节点处理
      text = props.resolveAsset(text);
    }
  }

  // 3. 补全末尾换行：确保处于末尾的块（如思考块、工具调用）能被正确闭合检测
  if (text && !text.endsWith("\n")) {
    text += "\n";
  }

  return text;
});

/**
 * 静态内容模式：监听处理后的 content 变化
 */
watch(
  processedContent,
  (newContent) => {
    if (props.streamSource) return;

    if (typeof newContent !== "string" || !newContent) {
      // 清空
      buffer.value = "";
      htmlContent.value = "";
      streamProcessor.value?.reset?.();
      return;
    }

    buffer.value = newContent;

    if (useAstRenderer.value) {
      if (!streamProcessor.value) {
        streamProcessor.value = createProcessor(props.version);
      }
      streamProcessor.value.setContent(newContent).then(() => {
        // 只有在非流式状态下才 finalize（finalize 会强制结束思考状态）
        if (!props.isStreaming) {
          streamProcessor.value?.finalize();
        }
      });
    } else {
      // 纯 markdown-it：直接全量渲染
      htmlContent.value = md.render(newContent);
    }
  },
  { immediate: true }
);

/**
 * 监听版本或规则变化
 */
watch(
  () => [props.version, props.llmThinkRules] as const,
  ([newVersion]) => {
    // 流式模式或无静态内容时，交给流式逻辑处理
    if (!props.content || props.streamSource) {
      if (!useAstRenderer.value) {
        // 切到纯模式时清理 AST 处理器
        streamProcessor.value = null;
      }
      return;
    }

    // 静态内容 + 版本切换
    buffer.value = props.content;

    if (useAstRenderer.value) {
      // AST 模式
      const processor = createProcessor(newVersion);
      streamProcessor.value = processor;
      processor.setContent(props.content).then(() => {
        processor.finalize();
      });
    } else {
      // 纯渲染模式
      streamProcessor.value = null;
      htmlContent.value = md.render(props.content);
    }
  },
  { deep: true }
);

/**
 * 监听流式状态变化
 * 当流式结束时，确保执行 finalize 以清理状态（如强制结束思考）
 */
watch(
  () => props.isStreaming,
  (newIsStreaming) => {
    if (!newIsStreaming && useAstRenderer.value && streamProcessor.value) {
      streamProcessor.value.finalize();
    }
  }
);

/**
 * 流式模式：组件挂载时订阅 streamSource
 */
onMounted(() => {
  if (!props.streamSource) return;

  // 初始化状态
  buffer.value = "";
  htmlContent.value = "";

  if (useAstRenderer.value) {
    streamProcessor.value = createProcessor(props.version);
    streamProcessor.value.reset();
  } else {
    streamProcessor.value = null;
  }

  // 订阅流式数据
  internalIsStreaming.value = true;
  unsubscribe = props.streamSource.subscribe((chunk) => {
    buffer.value += chunk;

    // 在流式模式下，我们必须手动应用正则规则和资产解析到 buffer
    // 因为 props.content 通常是空的或静态的，而 buffer 才是包含最新内容的数据源
    let bufferToProcess = buffer.value;

    // 1. 应用正则规则
    if (props.regexRules && props.regexRules.length > 0) {
      bufferToProcess = applyRegexRules(bufferToProcess, props.regexRules);
    }

    // 2. 解析资产路径
    if (props.resolveAsset) {
      if (!useAstRenderer.value) {
        bufferToProcess = props.resolveAsset(bufferToProcess);
      } else if (bufferToProcess.includes("file://")) {
        bufferToProcess = props.resolveAsset(bufferToProcess);
      }
    }

    // 3. 补全末尾换行：辅助解析器闭合末尾的块节点
    if (bufferToProcess && !bufferToProcess.endsWith("\n")) {
      bufferToProcess += "\n";
    }

    if (useAstRenderer.value) {
      // 对于流式数据，每次都处理整个应用了正则的缓冲区
      // StreamProcessor 的 diff 机制和 useMarkdownAst 的节流会处理性能问题
      streamProcessor.value?.setContent(bufferToProcess);
    } else {
      // 纯 markdown-it：每次全量重渲染
      htmlContent.value = md.render(bufferToProcess);
    }
  });

  // 监听流完成事件
  if (props.streamSource.onComplete) {
    unsubscribeComplete = props.streamSource.onComplete(() => {
      internalIsStreaming.value = false;
      if (useAstRenderer.value) {
        streamProcessor.value?.finalize();
      }
    });
  }
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribeComplete?.();
  streamProcessor.value?.reset?.();
});

// 暴露 AST 给父组件（用于测试和调试）
defineExpose({
  ast,
});
</script>

<style scoped>
.rich-text-renderer {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
}

/* 统一图片样式限制 */
.rich-text-renderer :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 4px 0;
  vertical-align: middle;
}

/* 块级节点渲染优化：出视口不渲染 */
:deep(.rich-text-block:not(.no-cv)) {
  /*
    使用 content-visibility: auto 让浏览器跳过不在视口内的节点渲染。
    这能极大提升长消息列表的滚动性能。
  */
  content-visibility: auto;
  /*
    配合 contain-intrinsic-size 防止滚动条因高度塌陷而跳动。
    这里给一个通用的预估高度。
  */
  contain-intrinsic-size: auto 40px;
}

/* 节点进入动画：淡入+轻微下移 */
:deep(.rich-text-node) {
  animation: fade-in-up 0.3s ease-out forwards;
  opacity: 0;
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
