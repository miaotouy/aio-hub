<template>
  <component :is="displayMode ? 'div' : 'span'" ref="containerRef" :class="containerClass"></component>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import katex from 'katex';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('rich-text-renderer/KatexRenderer');
const errorHandler = createModuleErrorHandler('rich-text-renderer/KatexRenderer');

interface Props {
  content: string;
  displayMode?: boolean; // true 为块级公式，false 为行内公式
}

const props = withDefaults(defineProps<Props>(), {
  displayMode: false,
});

const containerRef = ref<HTMLElement>();

const containerClass = props.displayMode ? 'katex-block-container' : 'katex-inline-container';

/**
 * 渲染 KaTeX 公式
 */
const renderKatex = () => {
  if (!containerRef.value) {
    logger.warn('容器元素未准备好', { content: props.content });
    return;
  }

  try {
    katex.render(props.content, containerRef.value, {
      displayMode: props.displayMode,
      throwOnError: false, // 出错时显示错误信息而不是抛出异常
      errorColor: '#cc0000',
      strict: 'warn', // 对不严格的 LaTeX 语法发出警告而不是错误
      trust: false, // 不信任 HTML 和 JavaScript，保证安全性
      macros: {}, // 可以在这里定义自定义宏
    });

    logger.debug('KaTeX 公式渲染成功', { 
      content: props.content, 
      displayMode: props.displayMode 
    });
  } catch (error) {
    errorHandler.error(error, 'KaTeX 公式渲染失败', {
      content: props.content,
      displayMode: props.displayMode,
    });
  }
};

// 挂载时渲染
onMounted(() => {
  renderKatex();
});

// 监听内容变化重新渲染
watch(() => props.content, () => {
  renderKatex();
});
</script>

<style scoped>
.katex-block-container {
  margin: 1em 0;
  text-align: center;
  overflow-x: auto;
  overflow-y: hidden;
}

.katex-inline-container {
  display: inline;
}

/* KaTeX 渲染错误样式 */
:deep(.katex-error) {
  color: var(--el-color-danger);
  font-family: var(--el-font-family);
}
</style>