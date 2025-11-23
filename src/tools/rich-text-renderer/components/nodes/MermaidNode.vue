<template>
  <div class="mermaid-node">
    <div class="mermaid-header">
      <div class="language-info">
        <span class="language-tag">Mermaid</span>
      </div>
      <div class="header-actions">
        <!-- 缩放控制 -->
        <el-tooltip content="缩小" :show-after="300">
          <button class="action-btn" :disabled="currentScale <= scaleMin" @click="decreaseScale">
            <Minus :size="14" />
          </button>
        </el-tooltip>
        <el-tooltip content="重置缩放" :show-after="300">
          <button class="action-btn" :disabled="currentScale === defaultScale" @click="resetScale">
            <RotateCcw :size="14" />
          </button>
        </el-tooltip>
        <el-tooltip content="放大" :show-after="300">
          <button class="action-btn" :disabled="currentScale >= scaleMax" @click="increaseScale">
            <Plus :size="14" />
          </button>
        </el-tooltip>

        <!-- 独立查看按钮 -->
        <el-tooltip content="在独立窗口中查看" :show-after="300">
          <button class="action-btn" @click="openViewer">
            <ExternalLink :size="14" />
          </button>
        </el-tooltip>

        <!-- 下载按钮 -->
        <el-tooltip content="下载 SVG" :show-after="300">
          <button class="action-btn" @click="downloadSvg" :disabled="!!error">
            <Download :size="14" />
          </button>
        </el-tooltip>

        <!-- 复制按钮 -->
        <el-tooltip :content="copied ? '已复制' : '复制代码'" :show-after="300">
          <button class="action-btn" :class="{ 'action-btn-active': copied }" @click="copyCode">
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
          </button>
        </el-tooltip>

        <!-- 展开/折叠按钮 -->
        <el-tooltip :content="isExpanded ? '折叠' : '展开'" :show-after="300">
          <button class="action-btn" @click="toggleExpand">
            <Minimize2 v-if="isExpanded" :size="14" />
            <Maximize2 v-else :size="14" />
          </button>
        </el-tooltip>
      </div>
    </div>
    <div class="mermaid-container" :class="{ expanded: isExpanded }" ref="containerRef">
      <!-- 错误状态：只有在稳定状态下的错误才显示 -->
      <div v-if="error && nodeStatus === 'stable'" class="mermaid-error">
        <div class="error-title">图表渲染失败</div>
        <div class="error-message">{{ error }}</div>
        <details class="error-details">
          <summary>查看源代码</summary>
          <pre class="error-code">{{ content }}</pre>
        </details>
      </div>
      
      <!-- 加载状态：只有在 pending 且从未渲染成功过时显示 -->
      <div v-else-if="nodeStatus === 'pending' && !hasRendered" class="mermaid-pending">
        <div class="pending-icon">
          <Loader2 class="animate-spin" :size="24" />
        </div>
        <div class="pending-text">正在接收图表数据...</div>
      </div>
      
      <!-- 图表显示区域：只要渲染成功过就显示，即使现在是 pending 状态 -->
      <div v-show="hasRendered" ref="mermaidRef" class="mermaid-svg"></div>
    </div>
  </div>

  <!-- 交互式查看器对话框 -->
  <BaseDialog
    v-model="showViewer"
    title="Mermaid 图表查看器"
    width="95%"
    height="85vh"
  >
    <MermaidInteractiveViewer :content="content" />
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, useAttrs, defineOptions } from "vue";

// 禁用属性继承以避免警告
defineOptions({
  inheritAttrs: false
});
import {
  Copy,
  Check,
  Plus,
  Minus,
  RotateCcw,
  Download,
  Maximize2,
  Minimize2,
  ExternalLink,
  Loader2,
} from "lucide-vue-next";
import { useTheme } from "@composables/useTheme";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import BaseDialog from "@/components/common/BaseDialog.vue";
import MermaidInteractiveViewer from "../MermaidInteractiveViewer.vue";
const logger = createModuleLogger("MermaidNode");

const props = defineProps<{
  nodeId: string;
  content: string;
}>();

// 获取 attrs 以访问 data-node-status
const attrs = useAttrs();

// 获取节点状态
const nodeStatus = computed(() => {
  const status = attrs['data-node-status'] as 'stable' | 'pending' | undefined;
  return status || 'stable';
});

const { isDark } = useTheme();
const containerRef = ref<HTMLElement | null>(null);
const mermaidRef = ref<HTMLElement | null>(null);
const copied = ref(false);
const error = ref<string>("");
const isExpanded = ref(false);
const showViewer = ref(false);
const isRendering = ref(false);
const hasRendered = ref(false); // 是否至少成功渲染过一次
const lastRenderId = ref(0); // 用于并发控制

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
    customMessage.success("代码已复制");
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    logger.error("复制失败", err);
    customMessage.error("复制失败");
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
  const svg = mermaidRef.value.querySelector("svg");
  if (svg) {
    svg.style.transform = `scale(${currentScale.value})`;
    svg.style.transformOrigin = "center center";
  }
};

// 下载 SVG
const downloadSvg = () => {
  try {
    if (!mermaidRef.value) return;

    const svg = mermaidRef.value.querySelector("svg");
    if (!svg) {
      customMessage.warning("没有可下载的图表");
      return;
    }

    // 克隆 SVG 以移除 transform
    const clonedSvg = svg.cloneNode(true) as SVGElement;
    clonedSvg.style.transform = "";

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `mermaid-diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    customMessage.success("SVG 已下载");
  } catch (err) {
    logger.error("下载失败", err);
    customMessage.error("下载失败");
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
  if (!mermaid) return;

  // 记录当前的渲染 ID，用于并发控制
  const currentRenderId = Date.now();
  lastRenderId.value = currentRenderId;

  try {
    isRendering.value = true;
    
    // 等待 DOM 更新，确保 mermaidRef 已经绑定到新的元素
    await nextTick();
    
    // 如果已经有新的渲染请求，取消当前的
    if (currentRenderId !== lastRenderId.value) return;

    if (!mermaidRef.value) {
      return;
    }

    // 生成唯一 ID
    const id = `mermaid-${props.nodeId}-${currentRenderId}`;

    // 尝试渲染图表
    // mermaid.render 会抛出异常如果语法无效
    const { svg } = await mermaid.render(id, props.content);

    // 再次检查并发
    if (currentRenderId !== lastRenderId.value) return;

    // 渲染成功，清理之前的状态
    if (renderCleanup) {
      renderCleanup();
      renderCleanup = null;
    }

    // 清空容器并插入新 SVG
    if (mermaidRef.value) {
      mermaidRef.value.innerHTML = svg;

      // 应用当前缩放
      await nextTick();
      applyScale();

      // 保存清理函数
      renderCleanup = () => {
        if (mermaidRef.value) {
          mermaidRef.value.innerHTML = "";
        }
      };
      
      // 标记渲染成功
      hasRendered.value = true;
      error.value = ""; // 只有成功了才清空错误
    }
  } catch (err: any) {
    // 检查并发
    if (currentRenderId !== lastRenderId.value) return;

    // 只有在 stable 状态下才显示错误
    // 在 pending 状态下，无论是否渲染过，都忽略错误（避免输入过程中的闪烁）
    if (nodeStatus.value === 'stable') {
      logger.error("Mermaid 渲染失败", err);
      error.value = err?.message || "未知错误";
    } else {
      // pending 状态，忽略错误
      // 如果还没渲染过，UI 会显示 loading
      // 如果已经渲染过，UI 会显示旧图表
      // logger.debug("Mermaid pending 状态渲染失败（已忽略）", err);
    }
  } finally {
    if (currentRenderId === lastRenderId.value) {
      isRendering.value = false;
    }
  }
};

// 初始化 Mermaid
const initMermaid = async () => {
  try {
    // 动态导入 Mermaid
    const mermaidModule = await import("mermaid");
    mermaid = mermaidModule.default;

    // 初始化配置
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark.value ? "dark" : "default",
      securityLevel: "loose",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      themeVariables: {
        fontSize: "14px",
      },
    });

    // 渲染图表
    await renderDiagram();
  } catch (err) {
    logger.error("Mermaid 初始化失败", err);
    error.value = "Mermaid 库加载失败";
  }
};

// 监听主题变化
watch(isDark, async (dark) => {
  if (!mermaid) return;

  try {
    // 更新主题配置
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? "dark" : "default",
      securityLevel: "loose",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      themeVariables: {
        fontSize: "14px",
      },
    });

    // 重新渲染
    await renderDiagram();
  } catch (err) {
    logger.error("主题切换失败", err);
  }
});

// 监听内容和状态变化
watch(
  [() => props.content, () => attrs['data-node-status']],
  async ([newContent, newStatus], [oldContent, oldStatus]) => {
    if (!mermaid) return;
    
    // 只要内容变化就尝试渲染，不再限制状态
    if (newContent !== oldContent || newStatus !== oldStatus) {
      await renderDiagram();
    }
  }
);

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
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  opacity: 0;
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-btn:hover:not(:disabled) {
  color: var(--el-text-color-primary);
  transform: translateY(-1px);
}

.action-btn:hover:not(:disabled)::before {
  opacity: 1;
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-active {
  background-color: var(--el-color-primary);
  color: white;
}

.action-btn-active::before {
  display: none;
}

.action-btn-active:hover:not(:disabled) {
  background-color: var(--el-color-primary-light-3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
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
  font-family: "Consolas", "Monaco", monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.mermaid-pending {
  width: 100%;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.pending-icon {
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.pending-icon .animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.pending-text {
  font-size: 13px;
}
</style>
