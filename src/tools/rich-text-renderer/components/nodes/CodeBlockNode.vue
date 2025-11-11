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
        
        <!-- 换行切换按钮 -->
        <button
          class="action-btn"
          :class="{ 'action-btn-active': wordWrapEnabled }"
          @click="toggleWordWrap"
          :title="wordWrapEnabled ? '禁用换行' : '启用换行'"
        >
          <WrapText :size="14" />
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
import { Copy, Check, Maximize2, Minimize2, Plus, Minus, RotateCcw, WrapText } from 'lucide-vue-next';
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

// 换行状态
const wordWrapEnabled = ref(true);

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

// 滚动事件处理器清理函数
let cleanupScrollHandler: (() => void) | null = null;

// ResizeObserver 清理函数
let cleanupResizeObserver: (() => void) | null = null;

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
  // 我们要操作的是 .code-editor-container，它是 editorEl 的父元素
  const container = editorEl.value?.parentElement;
  if (!editor || !container) return;

  // 等待 Vue 更新 DOM，应用/移除 .expanded 类
  await nextTick();

  try {
    if (isExpanded.value) {
      // 展开：启用自动布局，计算内容高度并设置为 max-height 以实现动画
      setAutomaticLayout(true);
      const h = computeContentHeight();
      if (h && h > 0) {
        container.style.maxHeight = `${h}px`;
      }
    } else {
      // 收起：禁用自动布局，并移除内联的 max-height，让 CSS 类生效
      setAutomaticLayout(false);
      container.style.maxHeight = ''; // 恢复由 CSS 控制
    }

    // 触发重新布局
    if (typeof editor.layout === 'function') {
      // 延迟一小段时间，确保 CSS transition 开始
      setTimeout(() => editor.layout(), 50);
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

// 切换换行
const toggleWordWrap = () => {
  wordWrapEnabled.value = !wordWrapEnabled.value;
  try {
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === 'function') {
      editor.updateOptions({
        wordWrap: wordWrapEnabled.value ? 'off' : 'on'
      });
      // 换行状态改变后需要重新计算高度和布局
      nextTick(() => {
        const h = computeContentHeight();
        if (h && h > 0 && editorEl.value) {
          editorEl.value.style.height = `${h}px`;
          
          // 如果是展开状态，同步更新容器的 max-height
          const container = editorEl.value.parentElement;
          if (isExpanded.value && container) {
            container.style.maxHeight = `${h}px`;
          }
        }
        
        // 触发重新布局
        if (typeof editor.layout === 'function') {
          editor.layout();
        }
      });
    }
  } catch (error) {
    console.error('[CodeBlockNode] 切换换行失败:', error);
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
    
    // 创建空编辑器，然后通过 updateCode 填充内容，
    // 以此统一初始加载和流式更新的逻辑，规避初始渲染空白的问题。
    await helpers.createEditor(
      editorEl.value,
      '', // Start with an empty editor
      monacoLanguage.value
    );
    
    updateCode = helpers.updateCode;
    cleanupEditor = helpers.cleanupEditor;
    setTheme = helpers.setTheme;
    getEditorView = helpers.getEditorView || getEditorView;
    
    // Use updateCode to load the initial content, mimicking the streaming path
    if (props.content) {
      updateCode(props.content, monacoLanguage.value);
    }
    
    // 设置初始字体大小
    const editor = getEditorView();
    if (editor && typeof editor.updateOptions === 'function') {
      const actualFontSize = editorOptions.fontSize || 13;
      defaultCodeFontSize.value = actualFontSize;
      codeFontSize.value = actualFontSize;
    }

    // 等待 Monaco 渲染完成后再计算高度
    // 使用 setTimeout 确保 Monaco 有足够时间渲染内容
    await new Promise(resolve => setTimeout(resolve, 100));
    await nextTick();
    
    if (editorEl.value) {
      const h = computeContentHeight();
      if (h && h > 0) {
        // 由 JS 精准设置高度，打破 CSS `height: auto` 和 `child-height: 100%` 的循环依赖
        editorEl.value.style.height = `${h}px`;
      } else {
        // 如果计算失败，设置一个合理的默认高度
        editorEl.value.style.height = '100px';
      }
      editorEl.value.style.width = '100%';
      editorEl.value.style.overflow = 'hidden';
      editorEl.value.style.maxHeight = 'none';
    }

    // 添加滚动穿透处理器以修复嵌套滚动问题
    const monacoContainer = editorEl.value?.querySelector('.monaco-editor') as HTMLElement;
    if (monacoContainer) {
      const handleWheel = (event: WheelEvent) => {
        const monacoScrollable = monacoContainer.querySelector('.overflow-guard') as HTMLElement;
        if (!monacoScrollable) return;

        const { scrollTop, scrollHeight, clientHeight } = monacoScrollable;
        const isAtTop = event.deltaY < 0 && scrollTop === 0;
        const isAtBottom = event.deltaY > 0 && (scrollHeight - scrollTop - clientHeight) < 1;

        if (isAtTop || isAtBottom) {
          // 在滚动边界时，允许父容器滚动
          // 不阻止默认行为，让事件冒泡
          return;
        } else {
          // 在内容区域内，阻止事件冒泡防止父容器滚动
          event.stopPropagation();
        }
      };

      // 在捕获阶段监听，优先于 Monaco 的处理
      monacoContainer.addEventListener('wheel', handleWheel, { capture: true, passive: true });

      // 保存清理函数
      cleanupScrollHandler = () => {
        monacoContainer.removeEventListener('wheel', handleWheel, { capture: true });
      };
    }

    // 强制重新布局以确保尺寸正确
    if (typeof editor.layout === 'function') {
      editor.layout();
    }

    // 添加 ResizeObserver 监听容器宽度变化
    const container = editorEl.value?.parentElement;
    if (container) {
      const resizeObserver = new ResizeObserver(() => {
        const editor = getEditorView();
        if (editor && typeof editor.layout === 'function') {
          // 使用 requestAnimationFrame 避免频繁触发
          requestAnimationFrame(() => {
            editor.layout();
          });
        }
      });
      
      resizeObserver.observe(container);
      
      cleanupResizeObserver = () => {
        resizeObserver.disconnect();
      };
    }

  } catch (error) {
    console.error('[CodeBlockNode] Failed to initialize Monaco editor via stream-monaco:', error);
  }
});

watch(isDark, async (dark) => {
  await setTheme(dark ? 'github-dark' : 'github-light');
});

onUnmounted(() => {
  // 清理编辑器
  cleanupEditor();
  // 清理滚动事件监听器
  if (cleanupScrollHandler) {
    cleanupScrollHandler();
    cleanupScrollHandler = null;
  }
  // 清理 ResizeObserver
  if (cleanupResizeObserver) {
    cleanupResizeObserver();
    cleanupResizeObserver = null;
  }
});

// 内容更新时，需要同步更新编辑器内容和高度
watch(() => props.content, (newContent, oldContent) => {
  // 避免在组件初始化时重复执行
  if (newContent === oldContent) return;

  updateCode(newContent, monacoLanguage.value);

  // 使用 nextTick 等待 Monaco 更新 DOM
  nextTick(() => {
    const editor = getEditorView();
    const container = editorEl.value?.parentElement;
    if (!editor || !container) return;

    const h = computeContentHeight();
    if (h && h > 0) {
      // 始终更新 editorEl 的高度以反映最新内容
      if (editorEl.value) {
        editorEl.value.style.height = `${h}px`;
      }
      // 如果是展开状态，需要同步更新容器的 max-height
      if (isExpanded.value) {
        container.style.maxHeight = `${h}px`;
      }
    }
  });
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
  /* 容器高度自适应，但最大不超过500px */
  height: auto;
  max-height: 500px;
  min-height: 50px;
  position: relative;
  /* 过渡效果应用在 max-height 上 */
  transition: max-height 0.3s ease-in-out;
  /* 容器不需要滚动，让内部 Monaco 处理 */
  overflow: hidden;
}

/* Monaco 编辑器容器的 div 高度由 JS 动态设置 */
.code-editor-container > div {
  width: 100%;
}

:deep(.monaco-editor) {
  height: 100% !important;
}
</style>