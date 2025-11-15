<template>
  <div class="rich-text-renderer">
    <AstNodeRenderer :nodes="ast" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref } from 'vue';
import { useMarkdownAst } from './composables/useMarkdownAst';
import { StreamProcessor } from './StreamProcessor';
import { StreamProcessorV2 } from './StreamProcessorV2';
import AstNodeRenderer from './components/AstNodeRenderer.tsx';
import type { StreamSource, LlmThinkRule } from './types';
import { RendererVersion } from './types';

const props = withDefaults(defineProps<{
  content?: string;
  streamSource?: StreamSource;
  version?: RendererVersion; // 渲染器版本
  llmThinkRules?: LlmThinkRule[]; // LLM 思考节点规则配置
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
  ]
});

const { ast, enqueuePatch } = useMarkdownAst();

/**
 * 根据版本创建对应的处理器
 */
const createProcessor = (version: RendererVersion) => {
  switch (version) {
    case RendererVersion.V2_CUSTOM_PARSER:
      // 提取思考标签名集合传递给 V2 处理器
      const thinkTagNames = new Set(props.llmThinkRules?.map(rule => rule.tagName) || []);
      return new StreamProcessorV2({
        onPatch: enqueuePatch,
        llmThinkTagNames: thinkTagNames,
        llmThinkRules: props.llmThinkRules || []
      });
    case RendererVersion.V1_MARKDOWN_IT:
    default:
      return new StreamProcessor({ onPatch: enqueuePatch });
    // 未来可以在这里添加更多版本的处理器
    // case RendererVersion.PURE_MARKDOWN_IT:
    //   return new PureMarkdownItProcessor({ onPatch: enqueuePatch });
    // case RendererVersion.HYBRID_V3:
    //   return new HybridV3Processor({ onPatch: enqueuePatch });
  }
};

// 根据 props 选择处理器
const streamProcessor = ref(createProcessor(props.version));

let unsubscribe: (() => void) | null = null;

// 监听版本或规则变化，重新创建处理器
watch(() => [props.version, props.llmThinkRules] as const, ([newVersion]) => {
  streamProcessor.value = createProcessor(newVersion);
  
  // 如果有内容，重新处理
  if (props.content && !props.streamSource) {
    streamProcessor.value.reset();
    streamProcessor.value.process(props.content);
    streamProcessor.value.finalize();
  }
}, { deep: true });

// 监听 content 属性变化（用于静态内容模式的响应式更新）
watch(() => props.content, (newContent) => {
  if (typeof newContent === 'string' && !props.streamSource) {
    streamProcessor.value.reset();
    streamProcessor.value.process(newContent);
    streamProcessor.value.finalize();
  }
}, { immediate: true });

let unsubscribeComplete: (() => void) | null = null;

onMounted(() => {
  if (props.streamSource) {
    // 流式模式
    streamProcessor.value.reset();
    unsubscribe = props.streamSource.subscribe((chunk) => {
      streamProcessor.value.process(chunk);
    });
    // 监听流完成事件
    if (props.streamSource.onComplete) {
      unsubscribeComplete = props.streamSource.onComplete(() => {
        streamProcessor.value.finalize();
      });
    }
  }
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribeComplete?.();
  streamProcessor.value.reset();
});
</script>

<style scoped>
.rich-text-renderer {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
}
</style>