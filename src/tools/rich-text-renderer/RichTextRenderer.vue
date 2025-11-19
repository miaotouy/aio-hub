<template>
  <div class="rich-text-renderer" :style="cssVariables">
    <!-- AST 渲染模式（V1/V2 等） -->
    <AstNodeRenderer
      v-if="useAstRenderer"
      :nodes="ast"
    />
    <!-- 纯 markdown-it 渲染模式 -->
    <div
      v-else
      class="pure-markdown-renderer"
      v-html="htmlContent"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref, computed } from 'vue';
import MarkdownIt from 'markdown-it';
import { useMarkdownAst } from './composables/useMarkdownAst';
import { StreamProcessor } from './StreamProcessor';
import { StreamProcessorV2 } from './StreamProcessorV2';
import AstNodeRenderer from './components/AstNodeRenderer.tsx';
import type { StreamSource, LlmThinkRule, RichTextRendererStyleOptions, MarkdownStyleOption } from './types';
import { RendererVersion } from './types';

const props = withDefaults(defineProps<{
  content?: string;
  streamSource?: StreamSource;
  version?: RendererVersion; // 渲染器版本
  llmThinkRules?: LlmThinkRule[]; // LLM 思考节点规则配置
  styleOptions?: RichTextRendererStyleOptions; // 样式配置
}>(), {
  version: RendererVersion.V1_MARKDOWN_IT,
  llmThinkRules: () => [
    // 默认规则：标准 <think> 标签
    {
      id: 'standard-think',
      kind: 'xml_tag',
      tagName: 'think',
      displayName: 'AI 思考过程',
      collapsedByDefault: true,
    }
  ],
  styleOptions: () => ({})
});

/**
 * 将样式配置转换为 CSS 变量
 */
const cssVariables = computed(() => {
  const vars: Record<string, string> = {};
  const opts = props.styleOptions;
  
  if (!opts) return vars;

  // 辅助函数：生成变量名并赋值
  const addVars = (prefix: string, style?: MarkdownStyleOption) => {
    if (!style) return;
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

  addVars('strong', opts.strong);
  addVars('em', opts.em);
  addVars('strikethrough', opts.strikethrough);
  addVars('blockquote', opts.blockquote);
  addVars('inline-code', opts.inlineCode);
  addVars('link', opts.link);
  
  // 标题
  addVars('h1', opts.h1);
  addVars('h2', opts.h2);
  addVars('h3', opts.h3);
  addVars('h4', opts.h4);
  addVars('h5', opts.h5);
  addVars('h6', opts.h6);

  return vars;
});

// 是否使用 AST 渲染器（V1 / V2 等）
const useAstRenderer = computed(() =>
  props.version === RendererVersion.V1_MARKDOWN_IT ||
  props.version === RendererVersion.V2_CUSTOM_PARSER
);

// AST 状态
const { ast, enqueuePatch } = useMarkdownAst();

// 纯 markdown-it 渲染的 HTML
const htmlContent = ref('');

// 流式累积的原始文本缓冲
const buffer = ref('');

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
      const thinkTagNames = new Set(props.llmThinkRules?.map(rule => rule.tagName) || []);
      return new StreamProcessorV2({
        onPatch: enqueuePatch,
        llmThinkTagNames: thinkTagNames,
        llmThinkRules: props.llmThinkRules || []
      });
    }
    case RendererVersion.V1_MARKDOWN_IT:
    default:
      return new StreamProcessor({ onPatch: enqueuePatch });
  }
};

// 当前使用的流式处理器（仅 AST 模式）
const streamProcessor = ref<StreamProcessor | StreamProcessorV2 | null>(null);

let unsubscribe: (() => void) | null = null;
let unsubscribeComplete: (() => void) | null = null;

/**
 * 静态内容模式：监听 content 变化
 */
watch(
  () => props.content,
  (newContent) => {
    if (props.streamSource) return;

    if (typeof newContent !== 'string' || !newContent) {
      // 清空
      buffer.value = '';
      htmlContent.value = '';
      streamProcessor.value?.reset?.();
      return;
    }

    buffer.value = newContent;

    if (useAstRenderer.value) {
      if (!streamProcessor.value) {
        streamProcessor.value = createProcessor(props.version);
      }
      streamProcessor.value.reset();
      streamProcessor.value.process(newContent);
      streamProcessor.value.finalize();
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
      streamProcessor.value = createProcessor(newVersion);
      streamProcessor.value.reset();
      streamProcessor.value.process(props.content);
      streamProcessor.value.finalize();
    } else {
      // 纯渲染模式
      streamProcessor.value = null;
      htmlContent.value = md.render(props.content);
    }
  },
  { deep: true }
);

/**
 * 流式模式：组件挂载时订阅 streamSource
 */
onMounted(() => {
  if (!props.streamSource) return;

  // 初始化状态
  buffer.value = '';
  htmlContent.value = '';

  if (useAstRenderer.value) {
    streamProcessor.value = createProcessor(props.version);
    streamProcessor.value.reset();
  } else {
    streamProcessor.value = null;
  }

  // 订阅流式数据
  unsubscribe = props.streamSource.subscribe((chunk) => {
    buffer.value += chunk;

    if (useAstRenderer.value) {
      streamProcessor.value?.process(chunk);
    } else {
      // 纯 markdown-it：每次全量重渲染
      htmlContent.value = md.render(buffer.value);
    }
  });

  // 监听流完成事件
  if (props.streamSource.onComplete) {
    unsubscribeComplete = props.streamSource.onComplete(() => {
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
</script>

<style scoped>
.rich-text-renderer {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
}
</style>