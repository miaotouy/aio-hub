<template>
  <div class="rich-text-renderer">
    <AstNodeRenderer :nodes="ast" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue';
import { useMarkdownAst } from './composables/useMarkdownAst';
import { StreamProcessor } from './StreamProcessor';
import AstNodeRenderer from './components/AstNodeRenderer';
import type { StreamSource } from './types';

const props = defineProps<{
  content?: string;
  streamSource?: StreamSource;
}>();

const { ast, enqueuePatch } = useMarkdownAst();

const streamProcessor = new StreamProcessor({
  onPatch: enqueuePatch,
});

let unsubscribe: (() => void) | null = null;

// 监听 content 属性变化（用于静态内容模式的响应式更新）
watch(() => props.content, (newContent) => {
  if (newContent && !props.streamSource) {
    streamProcessor.reset();
    streamProcessor.process(newContent, true); // isComplete = true
  }
}, { immediate: true });

onMounted(() => {
  if (props.streamSource) {
    // 流式模式
    unsubscribe = props.streamSource.subscribe((chunk) => {
      streamProcessor.process(chunk);
    });
  }
});

onBeforeUnmount(() => {
  unsubscribe?.();
  streamProcessor.reset();
});
</script>

<style scoped>
.rich-text-renderer {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
}
</style>