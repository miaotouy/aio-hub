<template>
  <div class="markdown-code-block">
    <div v-if="language" class="code-header">
      <span class="language-tag">{{ language }}</span>
    </div>
    <vue-monaco-editor
      v-model:value="code"
      :language="monacoLanguage"
      :options="editorOptions"
      :height="editorHeight"
      theme="vs-dark"
      @mount="handleMount"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { VueMonacoEditor } from '@guolao/vue-monaco-editor';

const props = defineProps<{
  nodeId: string;
  content: string;
  language?: string;
}>();

const code = ref(props.content);

// 监听内容变化（用于流式更新）
watch(() => props.content, (newContent) => {
  code.value = newContent;
});

// Monaco 编辑器语言映射
const languageMap: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'sh': 'shell',
  'bash': 'shell',
  'yml': 'yaml',
};

const monacoLanguage = computed(() => {
  if (!props.language) return 'plaintext';
  return languageMap[props.language] || props.language;
});

// 编辑器选项
const editorOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  lineNumbers: 'on' as const,
  renderLineHighlight: 'none' as const,
  scrollbar: {
    vertical: 'auto' as const,
    horizontal: 'auto' as const,
  },
  wordWrap: 'off' as const,
  folding: true,
  automaticLayout: true,
};

// 根据代码行数动态计算高度
const editorHeight = computed(() => {
  const lines = code.value.split('\n').length;
  const lineHeight = 19; // Monaco 默认行高
  const padding = 8;
  const minHeight = 100;
  const maxHeight = 500;
  
  const height = Math.min(Math.max(lines * lineHeight + padding, minHeight), maxHeight);
  return `${height}px`;
});

// 编辑器挂载回调
function handleMount(editor: any) {
  // 可以在这里做一些编辑器初始化操作
  editor.updateOptions({ readOnly: true });
}
</script>

<style scoped>
.markdown-code-block {
  margin: 12px 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background-color: #1e1e1e;
}

.code-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #252526;
  border-bottom: 1px solid #3e3e42;
}

.language-tag {
  font-size: 12px;
  font-weight: 500;
  color: #858585;
  text-transform: uppercase;
}

:deep(.monaco-editor) {
  border-radius: 0 0 6px 6px;
}
</style>