<template>
  <div class="mermaid-node">
    <div class="mermaid-header">
      <div class="language-info">
        <span class="language-tag">Mermaid</span>
      </div>
      <div class="header-actions">
        <!-- 缩放控制 -->
        <button
          class="action-btn"
          :disabled="currentScale <= scaleMin"
          @click="decreaseScale"
          title="缩小"
        >
          <Minus :size="14" />
        </button>
        <button
          class="action-btn"
          :disabled="currentScale === defaultScale"
          @click="resetScale"
          title="重置缩放"
        >
          <RotateCcw :size="14" />
        </button>
        <button
          class="action-btn"
          :disabled="currentScale >= scaleMax"
          @click="increaseScale"
          title="放大"
        >
          <Plus :size="14" />
        </button>
        
        <!-- 独立查看按钮 -->
        <button
          class="action-btn"
          @click="openViewer"
          title="在独立窗口中查看"
        >
          <ExternalLink :size="14" />
        </button>
        
        <!-- 下载按钮 -->
        <button
          class="action-btn"
          @click="downloadSvg"
          :disabled="!!error"
          title="下载 SVG"
        >
          <Download :size="14" />
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
    <div class="mermaid-container" :class="{ 'expanded': isExpanded }" ref="containerRef">
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
  
  <!-- 交互式查看器对话框 -->
  <BaseDialog
    v-model="showViewer"
    title="Mermaid 图表查看器"
    width="95%"
    height="85vh"
    :append-to-body="true"
  >
    <MermaidInteractiveViewer :content="content" />
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Copy, Check, Plus, Minus, RotateCcw, Download, Maximize2, Minimize2, ExternalLink } from 'lucide-vue-next';
import { useTheme } from '@composables/useTheme';
import { customMessage } from '@/utils/customMessage';
import { createModuleLogger } from '@/utils/logger';
import BaseDialog from '@/components/common/BaseDialog.vue';
import MermaidInteractiveViewer from '../MermaidInteractiveViewer.vue';
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
const isExpanded = ref(false);
const showViewer = ref(false);

// 缩放控制
const scaleMin = 0.5;
const scaleMax = 2.0;
const scaleStep = 0.1;
const defaultScale = 1.0;
const currentScale = ref(1.0);

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

// 缩放控制
const increaseScale = () => {
  const newScale = Math.min(scaleMax, currentScale.value + scaleStep);
  currentScale.value = Math.round(newScale * 10) / 10;
  applyScale();
};

const decreaseScale = () => {
  const newScale = Math.max(scaleMin, currentScale.value - scaleStep);
  currentScale.value = Math.round(newScale * 10) / 10;
  applyScale();
};

const resetScale = () => {
  currentScale.value = defaultScale;
  applyScale();
};

const applyScale = () => {
  if (!mermaidRef.value) return;
  const svg = mermaidRef.value.querySelector('svg');
  if (svg) {
    svg.style.transform = `scale(${currentScale.value})`;
    svg.style.transformOrigin = 'center center';
  }
};

// 下载 SVG
const downloadSvg = () => {
  try {
    if (!mermaidRef.value) return;
    
    const svg = mermaidRef.value.querySelector('svg');
    if (!svg) {
      customMessage.warning('没有可下载的图表');
      return;
    }
    
    // 克隆 SVG 以移除 transform
    const clonedSvg = svg.cloneNode(true) as SVGElement;
    clonedSvg.style.transform = '';
    
    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `mermaid-diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    customMessage.success('SVG 已下载');
  } catch (err) {
    logger.error('下载失败', err);
    customMessage.error('下载失败');
  }
};

// 展开/折叠
const toggleExpand = async () => {
  isExpanded.value = !isExpanded.value;
  await nextTick();
};

// 打开交互式查看器
const openViewer = () => {
  showViewer.value = true;
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
      
      // 应用当前缩放
      await nextTick();
      applyScale();
      
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
  max-height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: max-height 0.3s ease-in-out;
}

.mermaid-container.expanded {
  max-height: none;
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
  transition: transform 0.2s ease;
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