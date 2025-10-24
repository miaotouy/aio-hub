<template>
  <div class="rich-text-renderer">
    <AstNodeRenderer :nodes="ast" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue';
import { useMarkdownAst } from './composables/useMarkdownAst';
import { StreamProcessor } from './StreamProcessor';
import AstNodeRenderer from './components/AstNodeRenderer.tsx';
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
  if (typeof newContent === 'string' && !props.streamSource) {
    streamProcessor.reset();
    streamProcessor.process(newContent);
    streamProcessor.finalize();
  }
}, { immediate: true });

let unsubscribeComplete: (() => void) | null = null;

onMounted(() => {
  if (props.streamSource) {
    // 流式模式
    streamProcessor.reset();
    unsubscribe = props.streamSource.subscribe((chunk) => {
      streamProcessor.process(chunk);
    });
    // 监听流完成事件
    if (props.streamSource.onComplete) {
      unsubscribeComplete = props.streamSource.onComplete(() => {
        streamProcessor.finalize();
      });
    }
  }
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribeComplete?.();
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