<template>
  <div class="pre-code-node" :class="{ 'with-line-numbers': lineNumbers }">
    <div v-if="lineNumbers" class="line-numbers-gutter">
      <div v-for="n in lineCount" :key="n" class="line-number">{{ n }}</div>
    </div>
    <pre class="code-content"><code>{{ content }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  content: string;
  lineNumbers?: boolean;
}>();

const lineCount = computed(() => {
  return props.content.split("\n").length || 1;
});
</script>

<style scoped>
.pre-code-node {
  display: flex;
  background-color: var(--vscode-editor-background, var(--container-bg));
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
  tab-size: 4;
  overflow: hidden;
  width: 100%;
  min-height: 20px;
  padding: 4px 0;
}

.line-numbers-gutter {
  padding: 0 10px;
  color: var(--text-color-light, #858585);
  text-align: right;
  user-select: none;
  flex-shrink: 0;
  min-width: 45px;
  font-size: 12px;
  opacity: 0.6;
}

.line-number {
  height: 1.5em;
}

.code-content {
  margin: 0;
  padding: 0 12px;
  overflow-x: auto;
  flex-grow: 1;
  color: var(--text-color);
  white-space: pre;
}

.code-content code {
  font-family: inherit;
}

/* 隐藏滚动条但保持可滚动 */
.code-content::-webkit-scrollbar {
  display: none;
}
</style>
