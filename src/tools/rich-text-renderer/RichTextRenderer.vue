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
import type { StreamSource } from './types';

const props = withDefaults(defineProps<{
  content?: string;
  streamSource?: StreamSource;
  useV2?: boolean; // 是否使用 V2 处理器
}>(), {
  useV2: false
});

const { ast, enqueuePatch } = useMarkdownAst();

// 根据 props 选择处理器
const streamProcessor = ref(props.useV2
  ? new StreamProcessorV2({ onPatch: enqueuePatch })
  : new StreamProcessor({ onPatch: enqueuePatch })
);

let unsubscribe: (() => void) | null = null;

// 监听 useV2 变化，重新创建处理器
watch(() => props.useV2, (newUseV2) => {
  streamProcessor.value = newUseV2
    ? new StreamProcessorV2({ onPatch: enqueuePatch })
    : new StreamProcessor({ onPatch: enqueuePatch });
  
  // 如果有内容，重新处理
  if (props.content && !props.streamSource) {
    streamProcessor.value.reset();
    streamProcessor.value.process(props.content);
    streamProcessor.value.finalize();
  }
});

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