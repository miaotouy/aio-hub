<template>
  <div
    class="mermaid-node"
    :class="{ 'seamless-mode': seamless, hovered: isHovered }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="mermaid-header" :class="{ floating: seamless }">
      <div class="language-info">
        <span class="language-tag">Mermaid</span>
      </div>
      <div class="header-actions">
        <!-- 修复状态指示器 -->
        <el-tooltip
          v-if="wasFixed"
          :content="
            showOriginal
              ? '当前显示原始代码'
              : error
              ? '代码已尝试自动修复（仍有错误）'
              : '代码已自动修复'
          "
          :show-after="300"
        >
          <button
            class="fix-indicator"
            :class="{ 'showing-original': showOriginal }"
            @click="toggleOriginal"
          >
            <Wrench :size="12" />
            <span class="fix-text">{{ showOriginal ? "原始" : "已修复" }}</span>
          </button>
        </el-tooltip>

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
          <summary>查看源代码{{ showOriginal ? "" : wasFixed ? " (已尝试自动修复)" : "" }}</summary>
          <pre class="error-code">{{ activeContent }}</pre>
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
  <BaseDialog v-model="showViewer" title="Mermaid 图表查看器" width="95%" height="85vh">
    <MermaidInteractiveViewer :content="activeContent" />
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, useAttrs, inject } from "vue";

// 禁用属性继承以避免警告
defineOptions({
  inheritAttrs: false,
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
  Wrench,
} from "lucide-vue-next";
import { useTheme } from "@composables/useTheme";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";
import { fixMermaidCode } from "@/utils/mermaidFixer";
import BaseDialog from "@/components/common/BaseDialog.vue";
import MermaidInteractiveViewer from "../MermaidInteractiveViewer.vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";

const errorHandler = createModuleErrorHandler("MermaidNode");

const props = withDefaults(
  defineProps<{
    nodeId: string;
    content: string;
    seamless?: boolean;
  }>(),
  {
    seamless: undefined,
  }
);

// 注入上下文以获取全局设置
const context = inject<RichTextContext>(RICH_TEXT_CONTEXT_KEY);
const seamlessMode = context?.seamlessMode;

// 无边框模式：优先使用 prop，其次使用上下文
const seamless = computed(() => {
  if (props.seamless !== undefined) {
    return props.seamless;
  }
  return seamlessMode?.value ?? false;
});

// 悬停状态管理
const isHovered = ref(false);
let hoverTimer: any = null;

const handleMouseEnter = () => {
  if (hoverTimer) clearTimeout(hoverTimer);
  isHovered.value = true;
};

const handleMouseLeave = () => {
  // 延迟隐藏，给用户一点移动鼠标的时间
  hoverTimer = setTimeout(() => {
    isHovered.value = false;
  }, 100);
};

// 修复后的代码（只有在渲染失败后才会被设置）
const fixedContent = ref<string | null>(null);

// 判断当前渲染是否使用了修复后的代码
const wasFixed = computed(
  () => fixedContent.value !== null && fixedContent.value !== props.content
);

// 是否强制显示原始内容（用户手动切换）
const showOriginal = ref(false);

// 当前实际使用的内容（用于显示和复制）
const activeContent = computed(() => {
  if (showOriginal.value) {
    return props.content;
  }
  return fixedContent.value ?? props.content;
});

// 切换显示原始/修复后内容
const toggleOriginal = async () => {
  showOriginal.value = !showOriginal.value;
  // 切换后重新渲染
  if (mermaid) {
    await renderDiagramWithContent(activeContent.value);
  }
};

// 获取 attrs 以访问 data-node-status
const attrs = useAttrs();

// 获取节点状态
const nodeStatus = computed(() => {
  const status = attrs["data-node-status"] as "stable" | "pending" | undefined;
  return status || "stable";
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
    // 复制当前显示的代码
    await navigator.clipboard.writeText(activeContent.value);
    copied.value = true;
    customMessage.success(showOriginal.value ? "已复制原始代码" : "已复制修复后的代码");
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    errorHandler.error(err, "复制失败");
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
    errorHandler.error(err, "下载失败");
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

/**
 * 尝试用指定内容渲染图表（不进行修复尝试）
 * @returns 渲染是否成功
 */
const renderDiagramWithContent = async (content: string): Promise<boolean> => {
  if (!mermaid || !mermaidRef.value) return false;

  const currentRenderId = lastRenderId.value;
  const id = `mermaid-${props.nodeId}-${currentRenderId}`;

  try {
    const { svg } = await mermaid.render(id, content);

    // 检查并发
    if (currentRenderId !== lastRenderId.value) return false;

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

    return true;
  } catch {
    return false;
  }
};

// 渲染图表（带自动修复机制）
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

    // 如果用户选择显示原始内容，直接用原始内容渲染
    if (showOriginal.value) {
      const success = await renderDiagramWithContent(props.content);
      if (!success && nodeStatus.value === "stable") {
        error.value = "原始代码渲染失败";
      }
      return;
    }

    // 步骤 1: 先尝试用原始代码渲染
    const originalSuccess = await renderDiagramWithContent(props.content);

    // 检查并发
    if (currentRenderId !== lastRenderId.value) return;

    if (originalSuccess) {
      // 原始代码渲染成功，清除之前可能存在的修复记录
      fixedContent.value = null;
      return;
    }

    // 如果处于 pending 状态（流式输出中），不尝试修复
    // 因为代码尚未完整，修复通常无意义且可能导致闪烁
    if (nodeStatus.value !== "stable") {
      return;
    }

    // 步骤 2: 原始代码渲染失败，尝试修复
    const fixed = fixMermaidCode(props.content);

    // 如果修复后的代码和原始代码相同，说明修复器没有做任何改动
    // 这种情况下不需要再次尝试渲染
    if (fixed === props.content) {
      // 修复器无法修复，在 stable 状态下显示错误
      if (nodeStatus.value === "stable") {
        error.value = "Mermaid 语法错误，自动修复无效";
      }
      return;
    }

    // 步骤 3: 尝试用修复后的代码渲染
    const fixedSuccess = await renderDiagramWithContent(fixed);

    // 检查并发
    if (currentRenderId !== lastRenderId.value) return;

    // 无论成功与否，只要尝试了修复且代码不同，就记录下来
    // 这样用户在修复失败时也能切换查看修复前后的差异
    fixedContent.value = fixed;

    if (fixedSuccess) {
      return;
    }

    // 步骤 4: 修复后仍然失败
    if (nodeStatus.value === "stable") {
      error.value = "Mermaid 语法错误，自动修复后仍无法渲染";
    }
  } catch (err: any) {
    // 检查并发
    if (currentRenderId !== lastRenderId.value) return;

    // 只有在 stable 状态下才显示错误
    if (nodeStatus.value === "stable") {
      errorHandler.handle(err, {
        userMessage: "Mermaid 渲染失败",
        showToUser: false,
        level: ErrorLevel.WARNING,
        context: { diagramContent: props.content },
      });
      error.value = err?.message || "未知错误";
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
    errorHandler.handle(err, { userMessage: "Mermaid 初始化失败", showToUser: false });
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
    errorHandler.handle(err, { userMessage: "主题切换失败", showToUser: false });
  }
});

// 监听内容和状态变化
watch(
  [() => props.content, () => attrs["data-node-status"]],
  async ([newContent, newStatus], [oldContent, oldStatus]) => {
    if (!mermaid) return;

    // 内容变化时，重置修复状态和显示原始状态
    if (newContent !== oldContent) {
      fixedContent.value = null;
      showOriginal.value = false;
    }

    // 只要内容变化就尝试渲染，不再限制状态
    if (newContent !== oldContent || newStatus !== oldStatus) {
      await renderDiagram();
    }
  }
);

onMounted(() => {
  initMermaid();
  // 消除 containerRef 未使用的警告
  if (containerRef.value) {
    // no-op
  }
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
  position: relative;
}

/* 无边框模式样式 */
.mermaid-node.seamless-mode {
  border: none;
  background-color: transparent;
  margin: 8px 0;
  overflow: visible; /* 允许 Header 溢出 */
}

.mermaid-node.seamless-mode .mermaid-container {
  border-radius: 6px;
  border: 1px solid var(--border-color);
  max-height: none;
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

/* 悬浮 Header 模式 */
.mermaid-header.floating {
  position: absolute;
  top: -40px; /* 移到上方 */
  height: 40px;
  left: 0;
  right: 0;
  padding: 0 8px 4px 8px; /* 底部留一点空隙 */
  background-color: transparent;
  border-bottom: none;
  pointer-events: none; /* 让鼠标穿透空白区域 */
  z-index: 10;
  justify-content: flex-end; /* 靠右对齐 */
  align-items: flex-end; /* 底部对齐 */
}

.mermaid-header.floating .language-info {
  display: none; /* 隐藏语言标签 */
}

.mermaid-header.floating .header-actions {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px;
  box-shadow: var(--el-box-shadow-light);
  pointer-events: auto; /* 恢复按钮点击 */
  opacity: 0;
  transform: translateY(5px);
  transition: all 0.2s ease-in-out;
  position: relative; /* 用于伪元素定位 */
}

/* 桥接层：增加一个透明的伪元素，填补 Header 和内容之间的缝隙，防止鼠标移出时状态丢失 */
.mermaid-header.floating .header-actions::after {
  content: "";
  position: absolute;
  bottom: -15px; /* 向下延伸 */
  left: 0;
  right: 0;
  height: 20px;
  background: transparent;
  z-index: -1;
}

.mermaid-node.hovered .mermaid-header.floating .header-actions {
  opacity: 1;
  transform: translateY(0);
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
.fix-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-right: 4px;
}

.fix-indicator:hover {
  background-color: var(--el-color-success-light-8);
  transform: translateY(-1px);
}

.fix-indicator.showing-original {
  background-color: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.fix-indicator.showing-original:hover {
  background-color: var(--el-color-warning-light-8);
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
