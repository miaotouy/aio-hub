<template>
  <div class="markdown-code-block">
    <div v-if="language" class="code-header">
      <div class="language-info">
        <span class="language-tag">{{ language }}</span>
      </div>
      <div class="header-actions">
        <!-- 字体大小调整按钮 -->
        <button
          class="action-btn"
          :disabled="codeFontSize <= codeFontMin"
          @click="decreaseCodeFont"
          title="减小字体"
        >
          <Minus :size="14" />
        </button>
        <button
          class="action-btn"
          :disabled="!fontBaselineReady || codeFontSize === defaultCodeFontSize"
          @click="resetCodeFont"
          title="重置字体大小"
        >
          <RotateCcw :size="14" />
        </button>
        <button
          class="action-btn"
          :disabled="codeFontSize >= codeFontMax"
          @click="increaseCodeFont"
          title="增大字体"
        >
          <Plus :size="14" />
        </button>
        
        <!-- 复制按钮 -->
        <button
          class="action-btn"
          :class="{ 'action-btn-active': copied }"
          @click="copyCode"
          :title="copied ? '已复制' : '复制代码'"
        >
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
        </button>
        
        <!-- 展开/折叠按钮 -->
        <button
          class="action-btn"
          @click="toggleExpand"
          :title="isExpanded ? '折叠' : '展开'"
        >
          <Minimize2 v-if="isExpanded" :size="14" />
          <Maximize2 v-else :size="14" />
        </button>
      </div>
    </div>
    <!-- 容器本身负责滚动，而不是 Monaco 编辑器 -->
    <div class="code-editor-container" :class="{ 'expanded': isExpanded }">
      <div ref="editorEl"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Copy, Check, Maximize2, Minimize2, Plus, Minus, RotateCcw } from 'lucide-vue-next';
import { useTheme } from '@composables/useTheme';
import { customMessage } from '@/utils/customMessage';
// 动态导入，避免类型检查时就报错
type StreamMonacoModule = typeof import('stream-monaco');

const props = defineProps<{
  nodeId: string;
  content: string;
  language?: string;
}>();

const editorEl = ref<HTMLElement | null>(null);
const { isDark } = useTheme();

// 复制状态
const copied = ref(false);

// 展开状态
const isExpanded = ref(false);

// 字体大小控制
const codeFontMin = 10;
const codeFontMax = 36;
const codeFontStep = 1;
const defaultCodeFontSize = ref<number>(14);
const codeFontSize = ref<number>(14);
const fontBaselineReady = computed(() => {
  const a = defaultCodeFontSize.value;
  const b = codeFontSize.value;
  return typeof a === 'number' && Number.isFinite(a) && a > 0 &&
         typeof b === 'number' && Number.isFinite(b) && b > 0;
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

// stream-monaco helpers - 提供默认空实现
let updateCode: (code: string, lang: string) => void = () => {};
let cleanupEditor: () => void = () => {};
let setTheme: (theme: any) => Promise<void> = async () => {};
let getEditorView: () => any = () => ({ updateOptions: () => {} });

// 复制代码
const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(props.content);
    copied.value = true;
    customMessage.success('代码已复制');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error('[CodeBlockNode] 复制失败:', error);
    customMessage.error('复制失败');
  }
};

// 获取内容高度
const computeContentHeight = (): number | null => {
  try {
    const editor = getEditorView();
    if (!editor) return null;
    
    // 优先使用 Monaco 的 contentHeight
    if (typeof editor.getContentHeight === 'function') {
      const h = editor.getContentHeight();
      if (h > 0) return Math.ceil(h);
    }
    
    // 后备方案：行数 * 行高
    const model = editor.getModel?.();
    const lineCount = model?.getLineCount?.() || 1;
    const lineHeight = 18; // 默认行高
    return Math.ceil(lineCount * lineHeight);
  } catch {
    return null;
  }
};

// 设置 automaticLayout
const setAutomaticLayout = (enabled: boolean) => {
  try {
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === 'function') {
      editor.updateOptions({ automaticLayout: enabled });
    }
  } catch (error) {
    console.error('[CodeBlockNode] 设置 automaticLayout 失败:', error);
  }
};

// 切换展开/折叠
const toggleExpand = async () => {
  isExpanded.value = !isExpanded.value;
  
  const editor = getEditorView();
  const container = editorEl.value;
  if (!editor || !container) return;
  
  await nextTick();
  
  try {
    if (isExpanded.value) {
      // 展开：启用自动布局，移除高度限制
      setAutomaticLayout(true);
      container.style.maxHeight = 'none';
      container.style.overflow = 'hidden'; // 保持 overflow hidden
      
      // 计算并设置内容高度
      const h = computeContentHeight();
      if (h && h > 0) {
        container.style.height = `${h}px`;
      } else {
        container.style.height = 'auto'; // Fallback
      }
    } else {
      // 收起：禁用自动布局，恢复高度限制
      setAutomaticLayout(false);
      container.style.maxHeight = '500px';
      container.style.height = '500px';
      container.style.overflow = 'hidden'; // 恢复默认值，而不是 'auto'
    }
    
    // 触发重新布局
    if (typeof editor.layout === 'function') {
      editor.layout();
    }
  } catch (error) {
    console.error('[CodeBlockNode] 切换展开状态失败:', error);
  }
};

// 字体大小调整
const increaseCodeFont = () => {
  const newSize = Math.min(codeFontMax, codeFontSize.value + codeFontStep);
  codeFontSize.value = newSize;
  updateEditorFontSize(newSize);
};

const decreaseCodeFont = () => {
  const newSize = Math.max(codeFontMin, codeFontSize.value - codeFontStep);
  codeFontSize.value = newSize;
  updateEditorFontSize(newSize);
};

const resetCodeFont = () => {
  codeFontSize.value = defaultCodeFontSize.value;
  updateEditorFontSize(defaultCodeFontSize.value);
};

const updateEditorFontSize = (size: number) => {
  try {
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === 'function') {
      editor.updateOptions({ fontSize: size });
    }
  } catch (error) {
    console.error('[CodeBlockNode] 更新字体大小失败:', error);
  }
};

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
        // 让 Monaco 自己处理滚动
        vertical: 'auto' as const,
        horizontal: 'auto' as const,
        handleMouseWheel: true,
      },
      wordWrap: 'on' as const,
      wrappingIndent: 'same' as const,
      folding: true,
      // 禁用自动布局，使用固定高度
      automaticLayout: false,
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
    getEditorView = helpers.getEditorView || getEditorView;
    
    // 设置初始字体大小
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === 'function') {
      const actualFontSize = editorOptions.fontSize || 13;
      defaultCodeFontSize.value = actualFontSize;
      codeFontSize.value = actualFontSize;
    }

    // Add scroll passthrough handler to fix nested scrolling issue
    const containerEl = editorEl.value?.parentElement;
    if (containerEl) {
      const handleWheel = (event: WheelEvent) => {
        const el = event.currentTarget as HTMLElement;
        const { scrollTop, scrollHeight, clientHeight } = el;

        const isAtTop = event.deltaY < 0 && scrollTop === 0;
        // Add a small tolerance for floating point inaccuracies
        const isAtBottom = event.deltaY > 0 && (scrollHeight - scrollTop - clientHeight) < 1;

        if (isAtTop || isAtBottom) {
          // At a scroll boundary, allow parent to scroll.
          // We prevent Monaco's handler from calling event.preventDefault()
          // by temporarily overriding it on the event object.
          const originalPreventDefault = event.preventDefault;
          event.preventDefault = () => {};
          // Restore the original method after this event has been processed.
          setTimeout(() => {
            event.preventDefault = originalPreventDefault;
          }, 0);
        }
      };

      // Listen in the capture phase to intercept before Monaco's listeners.
      containerEl.addEventListener('wheel', handleWheel, { capture: true });

      // Cleanup on unmount
      onUnmounted(() => {
        containerEl.removeEventListener('wheel', handleWheel, { capture: true });
      });
    }

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
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--el-fill-color);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.language-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.language-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover:not(:disabled) {
  background-color: var(--el-fill-color-darker);
  color: var(--el-text-color-primary);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-active {
  background-color: var(--el-color-primary);
  color: white;
}

.action-btn-active:hover {
  background-color: var(--el-color-primary-light-3);
}

.code-editor-container {
  /* Monaco 编辑器容器，固定高度让编辑器自己滚动 */
  height: 500px;
  min-height: 100px;
  position: relative;
  transition: height 0.3s ease;
  /* 容器不需要滚动，让内部 Monaco 处理 */
  overflow: hidden;
}

.code-editor-container.expanded {
  /* 展开时高度由JS根据内容计算，移除固定的视窗高度限制 */
  height: auto;
  max-height: none;
}

/* Monaco 编辑器需要填充整个容器 */
.code-editor-container > div {
  height: 100%;
  width: 100%;
}

:deep(.monaco-editor) {
  height: 100% !important;
}
</style>