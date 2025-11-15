<template>
  <div class="mermaid-node">
    <div class="mermaid-header">
      <div class="language-info">
        <span class="language-tag">Mermaid</span>
      </div>
      <div class="header-actions">
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
      </div>
    </div>
    <div class="mermaid-container" ref="containerRef">
      <div v-if="error" class="mermaid-error">
        <div class="error-title">图表渲染失败</div>
        <div class="error-message">{{ error }}</div>
        <details class="error-details">
          <summary>查看源代码</summary>
          <pre class="error-code">{{ content }}</pre>
        </details>
      </div>
      <div v-else ref="mermaidRef" class="mermaid-svg"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { Copy, Check } from 'lucide-vue-next';
import { useTheme } from '@composables/useTheme';
import { customMessage } from '@/utils/customMessage';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('MermaidNode');

const props = defineProps<{
  nodeId: string;
  content: string;
}>();

const { isDark } = useTheme();
const containerRef = ref<HTMLElement | null>(null);
const mermaidRef = ref<HTMLElement | null>(null);
const copied = ref(false);
const error = ref<string>('');

let mermaid: any = null;
let renderCleanup: (() => void) | null = null;

// 复制代码
const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(props.content);
    copied.value = true;
    customMessage.success('代码已复制');
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    logger.error('复制失败', err);
    customMessage.error('复制失败');
  }
};

// 渲染图表
const renderDiagram = async () => {
  if (!mermaidRef.value || !mermaid) return;

  try {
    error.value = '';
    
    // 清理之前的渲染
    if (renderCleanup) {
      renderCleanup();
      renderCleanup = null;
    }
    
    // 清空容器
    mermaidRef.value.innerHTML = '';
    
    // 生成唯一 ID
    const id = `mermaid-${props.nodeId}-${Date.now()}`;
    
    // 渲染图表
    const { svg } = await mermaid.render(id, props.content);
    
    // 插入 SVG
    if (mermaidRef.value) {
      mermaidRef.value.innerHTML = svg;
      
      // 保存清理函数
      renderCleanup = () => {
        if (mermaidRef.value) {
          mermaidRef.value.innerHTML = '';
        }
      };
    }
  } catch (err: any) {
    logger.error('Mermaid 渲染失败', err);
    error.value = err?.message || '未知错误';
  }
};

// 初始化 Mermaid
const initMermaid = async () => {
  try {
    // 动态导入 Mermaid
    const mermaidModule = await import('mermaid');
    mermaid = mermaidModule.default;
    
    // 初始化配置
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark.value ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: {
        fontSize: '14px',
      },
    });
    
    // 渲染图表
    await renderDiagram();
  } catch (err) {
    logger.error('Mermaid 初始化失败', err);
    error.value = 'Mermaid 库加载失败';
  }
};

// 监听主题变化
watch(isDark, async (dark) => {
  if (!mermaid) return;
  
  try {
    // 更新主题配置
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: {
        fontSize: '14px',
      },
    });
    
    // 重新渲染
    await renderDiagram();
  } catch (err) {
    logger.error('主题切换失败', err);
  }
});

// 监听内容变化
watch(() => props.content, async () => {
  if (mermaid) {
    await renderDiagram();
  }
});

onMounted(() => {
  initMermaid();
});

onBeforeUnmount(() => {
  if (renderCleanup) {
    renderCleanup();
    renderCleanup = null;
  }
});
</script>

<style scoped>
.mermaid-node {
  margin: 12px 0;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mermaid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--code-block-bg, var(--card-bg));
  border-bottom: 1px solid var(--border-color);
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

.mermaid-container {
  padding: 16px;
  background-color: var(--code-block-bg, var(--card-bg));
  overflow: auto;
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mermaid-svg {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Mermaid SVG 样式适配 */
.mermaid-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}

.mermaid-error {
  width: 100%;
  padding: 16px;
  background-color: var(--el-color-error-light-9);
  border: 1px solid var(--el-color-error-light-7);
  border-radius: 6px;
  color: var(--el-color-error);
}

.error-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.error-message {
  font-size: 13px;
  margin-bottom: 12px;
  color: var(--el-text-color-regular);
}

.error-details {
  margin-top: 8px;
}

.error-details summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  user-select: none;
}

.error-details summary:hover {
  color: var(--el-text-color-primary);
}

.error-code {
  margin-top: 8px;
  padding: 12px;
  background-color: var(--el-fill-color);
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>