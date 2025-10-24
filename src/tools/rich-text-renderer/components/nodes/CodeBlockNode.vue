<template>
  <div class="markdown-code-block">
    <div v-if="language" class="code-header">
      <span class="language-tag">{{ language }}</span>
    </div>
    <!-- 容器本身负责滚动，而不是 Monaco 编辑器 -->
    <div class="code-editor-container">
      <div ref="editorEl"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useTheme } from '@composables/useTheme';
// 动态导入，避免类型检查时就报错
type StreamMonacoModule = typeof import('stream-monaco');

const props = defineProps<{
  nodeId: string;
  content: string;
  language?: string;
}>();

const editorEl = ref<HTMLElement | null>(null);
const { isDark } = useTheme();

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

// stream-monaco helpers - 提供默认空实现
let updateCode: (code: string, lang: string) => void = () => {};
let cleanupEditor: () => void = () => {};
let setTheme: (theme: any) => Promise<void> = async () => {};

onMounted(async () => {
  if (!editorEl.value) return;

  try {
    const [sm, themeLight, themeDark] = await Promise.all([
      import('stream-monaco') as Promise<StreamMonacoModule>,
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs')
    ]);

    // 再次检查，防止在异步加载模块期间组件被卸载
    if (!editorEl.value) return;

    const useMonaco = sm.useMonaco;
    
    if (typeof useMonaco !== 'function') {
      console.warn('[CodeBlockNode] stream-monaco is not installed or useMonaco not found.');
      return;
    }

    const editorOptions = {
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: 'on' as const,
      renderLineHighlight: 'none' as const,
      scrollbar: {
        // Monaco 自己不处理滚动，由外层 div.code-editor-container 处理
        vertical: 'hidden' as const,
        horizontal: 'hidden' as const,
        handleMouseWheel: false, // 禁用内部滚轮处理
      },
      wordWrap: 'on' as const,
      wrappingIndent: 'same' as const,
      folding: true,
      // 启用自动布局，让 Monaco 自动感知容器变化
      automaticLayout: true,
      // automaticLayout 会自动处理高度，无需手动设置
      theme: isDark.value ? 'github-dark' : 'github-light',
    };
    
    const helpers = useMonaco({
      ...editorOptions,
      themes: [themeLight.default, themeDark.default]
    });
    
    await helpers.createEditor(
      editorEl.value,
      props.content,
      monacoLanguage.value
    );
    
    updateCode = helpers.updateCode;
    cleanupEditor = helpers.cleanupEditor;
    setTheme = helpers.setTheme;

  } catch (error) {
    console.error('[CodeBlockNode] Failed to initialize Monaco editor via stream-monaco:', error);
  }
});

watch(isDark, async (dark) => {
  await setTheme(dark ? 'github-dark' : 'github-light');
});

onUnmounted(() => {
  cleanupEditor();
});

// 内容更新时，仅需要调用 updateCode，高度由 automaticLayout 自动处理
watch(() => props.content, (newContent) => {
  updateCode(newContent, monacoLanguage.value);
});

</script>

<style scoped>
.markdown-code-block {
  margin: 12px 0;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background-color: var(--el-fill-color-lighter);
  /* overflow: hidden 必须保留，以裁剪内部圆角 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* 优化：当代码块滚动到屏幕外时，浏览器可以跳过其渲染 */
  content-visibility: auto;
  contain-intrinsic-size: 150px; /* 提供一个预估高度 */
}

.code-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--el-fill-color);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.language-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.code-editor-container {
  /* 关键：让容器自己处理滚动 */
  overflow: auto;
  /* 关键：设置最大高度，超过则滚动 */
  max-height: 500px;
  min-height: 100px;
  /* 确保 flex 布局下可以正确伸缩 */
  position: relative;
  flex: 1 1 auto;
}

/*
  Monaco 编辑器将通过 automaticLayout 填充父容器 .code-editor-container
  我们不再需要手动计算和设置它的高度。
*/
:deep(.monaco-editor) {
  /* 确保编辑器本身不会出现滚动条 */
  overflow: hidden;
}
</style>