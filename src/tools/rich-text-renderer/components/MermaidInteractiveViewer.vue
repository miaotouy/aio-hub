<template>
  <div class="mermaid-interactive-viewer">
    <!-- 工具栏 -->
    <div class="viewer-toolbar">
      <div class="toolbar-left">
        <!-- 视图模式切换 -->
        <div class="mode-switcher">
          <el-tooltip
            v-for="mode in viewModes"
            :key="mode.value"
            :content="mode.label"
            placement="bottom"
          >
            <button
              class="mode-btn"
              :class="{ active: viewMode === mode.value }"
              @click="viewMode = mode.value"
            >
              <component :is="mode.icon" :size="16" />
              <span>{{ mode.label }}</span>
            </button>
          </el-tooltip>
        </div>
      </div>

      <div class="toolbar-right">
        <!-- 缩放控制 -->
        <div class="scale-controls" v-if="viewMode !== 'source'">
          <el-tooltip content="缩小 (Ctrl -)" placement="bottom">
            <button class="tool-btn" :disabled="currentScale <= scaleMin" @click="decreaseScale">
              <Minus :size="16" />
            </button>
          </el-tooltip>
          <span class="scale-value">{{ Math.round(currentScale * 100) }}%</span>
          <el-tooltip content="放大 (Ctrl +)" placement="bottom">
            <button class="tool-btn" :disabled="currentScale >= scaleMax" @click="increaseScale">
              <Plus :size="16" />
            </button>
          </el-tooltip>
          <el-tooltip content="重置视图 (Ctrl 0)" placement="bottom">
            <button
              class="tool-btn"
              :disabled="currentScale === defaultScale && !hasPan"
              @click="resetTransform"
            >
              <RotateCcw :size="16" />
            </button>
          </el-tooltip>
          <el-tooltip content="适应窗口" placement="bottom">
            <button class="tool-btn" @click="fitToView">
              <Maximize2 :size="16" />
            </button>
          </el-tooltip>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <el-tooltip content="下载 SVG" placement="bottom">
            <button
              class="tool-btn"
              @click="downloadSvg"
              :disabled="!!error || viewMode === 'source'"
            >
              <Download :size="16" />
              <span>SVG</span>
            </button>
          </el-tooltip>
          <el-tooltip content="下载 PNG" placement="bottom">
            <button
              class="tool-btn"
              @click="downloadPng"
              :disabled="!!error || viewMode === 'source'"
            >
              <ImageIcon :size="16" />
              <span>PNG</span>
            </button>
          </el-tooltip>
          <el-tooltip :content="imageCopied ? '已复制图片' : '复制图片'" placement="bottom">
            <button
              class="tool-btn"
              :class="{ active: imageCopied }"
              @click="copyImage"
              :disabled="!!error || viewMode === 'source'"
            >
              <Check v-if="imageCopied" :size="16" />
              <ClipboardCopy v-else :size="16" />
              <span>{{ imageCopied ? "已复制" : "复制图片" }}</span>
            </button>
          </el-tooltip>
          <el-tooltip :content="copied ? '已复制源码' : '复制源码'" placement="bottom">
            <button class="tool-btn" :class="{ active: copied }" @click="copyCode">
              <Check v-if="copied" :size="16" />
              <Copy v-else :size="16" />
              <span>{{ copied ? "已复制源码" : "复制源码" }}</span>
            </button>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="viewer-content" :class="`view-mode-${viewMode}`">
      <!-- 图表视图 -->
      <div
        v-show="viewMode !== 'source'"
        class="diagram-panel"
        ref="diagramPanelRef"
        @wheel.prevent="handleWheel"
      >
        <div v-if="error" class="mermaid-error">
          <div class="error-icon">⚠️</div>
          <div class="error-title">图表渲染失败</div>
          <div class="error-message">{{ error }}</div>
          <details class="error-details">
            <summary>查看详细信息</summary>
            <pre class="error-stack">{{ errorDetails }}</pre>
          </details>
        </div>
        <div
          v-else
          ref="mermaidRef"
          class="mermaid-diagram"
          :class="{ dragging: isDragging }"
          @mousedown="handleMouseDown"
        ></div>

        <!-- 拖拽提示 -->
        <div v-if="!error && viewMode === 'diagram'" class="interaction-hint">
          按住拖动 • 滚轮缩放
        </div>
      </div>

      <!-- 源码视图 -->
      <div v-show="viewMode !== 'diagram'" class="source-panel">
        <div class="source-header">
          <span class="source-title">Mermaid 源码 (已自动修复)</span>
          <div class="source-info">
            <span>{{ lineCount }} 行</span>
            <span>{{ charCount }} 字符</span>
          </div>
        </div>
        <pre class="source-code" ref="sourceCodeRef">{{ fixedContent }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount, computed } from "vue";
import {
  Copy,
  Check,
  Plus,
  Minus,
  RotateCcw,
  Download,
  Image as ImageIcon,
  Eye,
  Code,
  Columns,
  Maximize2,
  ClipboardCopy,
} from "lucide-vue-next";
import { useTheme } from "@composables/useTheme";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { fixMermaidCode } from "@/utils/mermaidFixer";

const logger = createModuleLogger("MermaidInteractiveViewer");
const errorHandler = createModuleErrorHandler("MermaidInteractiveViewer");

const props = defineProps<{
  content: string;
}>();

// 自动修复 Mermaid 代码
const fixedContent = computed(() => fixMermaidCode(props.content));

const { isDark } = useTheme();

// 视图模式
const viewModes = [
  { value: "diagram", label: "图表", icon: Eye },
  { value: "source", label: "源码", icon: Code },
  { value: "split", label: "分屏", icon: Columns },
] as const;

const viewMode = ref<"diagram" | "source" | "split">("diagram");

// DOM 引用
const diagramPanelRef = ref<HTMLElement | null>(null);
const mermaidRef = ref<HTMLElement | null>(null);
const sourceCodeRef = ref<HTMLElement | null>(null);

// 状态
const copied = ref(false);
const imageCopied = ref(false);
const error = ref<string>("");
const errorDetails = ref<string>("");

// 缩放和平移
const scaleMin = 0.3;
const scaleMax = 5.0;
const scaleStep = 0.1;
const defaultScale = 1.0;
const currentScale = ref(1.0);
const panOffset = ref({ x: 0, y: 0 });
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

// Mermaid 实例
let mermaid: any = null;
let renderCleanup: (() => void) | null = null;

// 计算属性
const hasPan = computed(() => panOffset.value.x !== 0 || panOffset.value.y !== 0);
const lineCount = computed(() => fixedContent.value.split("\n").length);
const charCount = computed(() => fixedContent.value.length);

// 应用变换
const applyTransform = () => {
  if (!mermaidRef.value) return;
  const svg = mermaidRef.value.querySelector("svg");
  if (svg) {
    svg.style.transform = `translate(${panOffset.value.x}px, ${panOffset.value.y}px) scale(${currentScale.value})`;
    svg.style.transformOrigin = "center center";
  }
};

// 缩放控制
const increaseScale = () => {
  const newScale = Math.min(scaleMax, currentScale.value + scaleStep);
  currentScale.value = Math.round(newScale * 10) / 10;
  applyTransform();
};

const decreaseScale = () => {
  const newScale = Math.max(scaleMin, currentScale.value - scaleStep);
  currentScale.value = Math.round(newScale * 10) / 10;
  applyTransform();
};

const resetTransform = () => {
  currentScale.value = defaultScale;
  panOffset.value = { x: 0, y: 0 };
  applyTransform();
};

// 适应窗口
const fitToView = () => {
  if (!mermaidRef.value || !diagramPanelRef.value) return;
  const svg = mermaidRef.value.querySelector("svg");
  if (!svg) return;

  const svgRect = svg.getBoundingClientRect();
  const containerRect = diagramPanelRef.value.getBoundingClientRect();

  const scaleX = (containerRect.width * 0.9) / svgRect.width;
  const scaleY = (containerRect.height * 0.9) / svgRect.height;
  const scale = Math.min(scaleX, scaleY, scaleMax);

  currentScale.value = Math.round(scale * 10) / 10;
  panOffset.value = { x: 0, y: 0 };
  applyTransform();
};

// 鼠标拖拽
const handleMouseDown = (e: MouseEvent) => {
  if (e.button !== 0) return;
  isDragging.value = true;
  dragStart.value = {
    x: e.clientX - panOffset.value.x,
    y: e.clientY - panOffset.value.y,
  };
  e.preventDefault();
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  panOffset.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y,
  };
  applyTransform();
};

const handleMouseUp = () => {
  isDragging.value = false;
};

// 滚轮缩放
const handleWheel = (e: WheelEvent) => {
  const delta = e.deltaY > 0 ? -scaleStep : scaleStep;
  const newScale = Math.max(scaleMin, Math.min(scaleMax, currentScale.value + delta));
  currentScale.value = Math.round(newScale * 10) / 10;
  applyTransform();
};

// 键盘快捷键
const handleKeyDown = (e: KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey) return;

  switch (e.key) {
    case "=":
    case "+":
      e.preventDefault();
      increaseScale();
      break;
    case "-":
      e.preventDefault();
      decreaseScale();
      break;
    case "0":
      e.preventDefault();
      resetTransform();
      break;
  }
};

// 复制代码
const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(fixedContent.value);
    copied.value = true;
    customMessage.success("已复制修复后的源码");
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    errorHandler.error(err, "复制失败");
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

    const clonedSvg = svg.cloneNode(true) as SVGElement;
    clonedSvg.style.transform = "";
    clonedSvg.style.transition = "";

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
    customMessage.success("SVG 文件已下载");
  } catch (err) {
    errorHandler.error(err, "下载 SVG 失败");
  }
};

// 复制图片到剪贴板
const copyImage = async () => {
  try {
    if (!mermaidRef.value) return;

    const svg = mermaidRef.value.querySelector("svg");
    if (!svg) {
      customMessage.warning("没有可复制的图表");
      return;
    }

    const clonedSvg = svg.cloneNode(true) as SVGElement;
    clonedSvg.style.transform = "";
    clonedSvg.style.transition = "";

    if (!clonedSvg.getAttribute("viewBox")) {
      const widthAttr = clonedSvg.getAttribute("width");
      const heightAttr = clonedSvg.getAttribute("height");
      const width = widthAttr ? parseFloat(widthAttr) : undefined;
      const height = heightAttr ? parseFloat(heightAttr) : undefined;
      if (width && height) {
        clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    }

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas 上下文");

    const img = new Image();
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;

    img.onload = async () => {
      try {
        const imgWidth = img.naturalWidth || img.width;
        const imgHeight = img.naturalHeight || img.height;

        const scale = 16;
        const padding = 12;
        const paddedWidth = imgWidth + padding * 2;
        const paddedHeight = imgHeight + padding * 2;

        canvas.width = paddedWidth * scale;
        canvas.height = paddedHeight * scale;

        ctx.setTransform(scale, 0, 0, scale, 0, 0);

        ctx.fillStyle = isDark.value ? "#1e1e1e" : "#ffffff";
        ctx.fillRect(0, 0, paddedWidth, paddedHeight);

        ctx.drawImage(img, padding, padding, imgWidth, imgHeight);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            customMessage.error("生成图片失败");
            return;
          }

          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                "image/png": blob,
              }),
            ]);

            imageCopied.value = true;
            customMessage.success("图片已复制到剪贴板");
            setTimeout(() => {
              imageCopied.value = false;
            }, 2000);
          } catch (err) {
            errorHandler.error(err, "复制图片失败，请尝试下载 PNG");
          }
        }, "image/png");
      } catch (err) {
        if (err instanceof DOMException && err.name === "SecurityError") {
          logger.warn("Canvas 被污染，无法复制图片", err);
          customMessage.error("图表包含外部资源，无法复制图片，请尝试下载 PNG");
        } else {
          throw err;
        }
      }
    };

    img.onerror = (err) => {
      errorHandler.error(err, "生成图片失败");
    };

    img.crossOrigin = "anonymous";
    img.src = svgDataUrl;
  } catch (err) {
    errorHandler.error(err, "复制图片失败");
  }
};

// 下载 PNG
const downloadPng = async () => {
  try {
    if (!mermaidRef.value) return;

    const svg = mermaidRef.value.querySelector("svg");
    if (!svg) {
      customMessage.warning("没有可下载的图表");
      return;
    }

    const clonedSvg = svg.cloneNode(true) as SVGElement;
    // 清除交互产生的 transform，导出完整图表
    clonedSvg.style.transform = "";
    clonedSvg.style.transition = "";

    // 如果原始 SVG 没有 viewBox，但有宽高信息，补一个 viewBox，避免导出裁剪
    if (!clonedSvg.getAttribute("viewBox")) {
      const widthAttr = clonedSvg.getAttribute("width");
      const heightAttr = clonedSvg.getAttribute("height");
      const width = widthAttr ? parseFloat(widthAttr) : undefined;
      const height = heightAttr ? parseFloat(heightAttr) : undefined;
      if (width && height) {
        clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    }

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 Canvas 上下文");

    const img = new Image();
    // 使用 Data URL 代替 Blob URL 以避免跨域问题
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;

    img.onload = () => {
      try {
        // 使用 naturalWidth / naturalHeight，避免 width/height 为 0 或不准确导致的裁剪
        const imgWidth = img.naturalWidth || img.width;
        const imgHeight = img.naturalHeight || img.height;

        // 高分辨率导出：固定使用 16x 缩放以保证清晰度
        const scale = 16;

        // 外边距设置（按原始尺寸计算）
        const padding = 12;
        const paddedWidth = imgWidth + padding * 2;
        const paddedHeight = imgHeight + padding * 2;

        canvas.width = paddedWidth * scale;
        canvas.height = paddedHeight * scale;

        ctx.setTransform(scale, 0, 0, scale, 0, 0);

        // 填充背景
        ctx.fillStyle = isDark.value ? "#1e1e1e" : "#ffffff";
        ctx.fillRect(0, 0, paddedWidth, paddedHeight);

        // 在有边距的位置绘制图表
        ctx.drawImage(img, padding, padding, imgWidth, imgHeight);

        canvas.toBlob((blob) => {
          if (!blob) {
            customMessage.error("生成 PNG 失败");
            return;
          }

          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = pngUrl;
          link.download = `mermaid-diagram-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          URL.revokeObjectURL(pngUrl);
          customMessage.success("PNG 文件已下载");
        });
      } catch (err) {
        // 捕获 Canvas 污染错误
        if (err instanceof DOMException && err.name === "SecurityError") {
          logger.warn("Canvas 被污染，无法导出 PNG", err);
          customMessage.error("图表包含外部资源，无法导出为 PNG，请尝试下载 SVG 格式");
        } else {
          throw err;
        }
      }
    };

    img.onerror = (err) => {
      errorHandler.error(err, "生成 PNG 失败");
    };

    // 设置 crossOrigin 以允许跨域资源
    img.crossOrigin = "anonymous";
    img.src = svgDataUrl;
  } catch (err) {
    errorHandler.error(err, "下载失败");
  }
};
// 渲染图表
const renderDiagram = async () => {
  if (!mermaidRef.value || !mermaid) return;

  try {
    error.value = "";
    errorDetails.value = "";

    if (renderCleanup) {
      renderCleanup();
      renderCleanup = null;
    }

    mermaidRef.value.innerHTML = "";

    const id = `mermaid-viewer-${Date.now()}`;
    const { svg } = await mermaid.render(id, fixedContent.value);

    if (mermaidRef.value) {
      mermaidRef.value.innerHTML = svg;

      await nextTick();
      applyTransform();

      renderCleanup = () => {
        if (mermaidRef.value) {
          mermaidRef.value.innerHTML = "";
        }
      };
    }
  } catch (err: any) {
    errorHandler.handle(err, { userMessage: "Mermaid 渲染失败", showToUser: false });
    error.value = err?.message || "未知错误";
    errorDetails.value = err?.stack || JSON.stringify(err, null, 2);
  }
};

// 初始化 Mermaid
const initMermaid = async () => {
  try {
    const mermaidModule = await import("mermaid");
    mermaid = mermaidModule.default;

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark.value ? "dark" : "default",
      securityLevel: "loose",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      themeVariables: {
        fontSize: "14px",
      },
    });

    await renderDiagram();
  } catch (err) {
    errorHandler.handle(err, { userMessage: "Mermaid 初始化失败", showToUser: false });
    error.value = "Mermaid 库加载失败";
    errorDetails.value = String(err);
  }
};

// 监听主题变化
watch(isDark, async (dark) => {
  if (!mermaid) return;

  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? "dark" : "default",
      securityLevel: "loose",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      themeVariables: {
        fontSize: "14px",
      },
    });

    await renderDiagram();
  } catch (err) {
    errorHandler.handle(err, { userMessage: "主题切换失败", showToUser: false });
  }
});

// 监听内容变化
watch(
  () => props.content,
  async () => {
    if (mermaid) {
      await renderDiagram();
    }
  }
);

onMounted(() => {
  initMermaid();
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("keydown", handleKeyDown);
});

onBeforeUnmount(() => {
  if (renderCleanup) {
    renderCleanup();
    renderCleanup = null;
  }
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
  document.removeEventListener("keydown", handleKeyDown);
});
</script>

<style scoped>
.mermaid-interactive-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  border-radius: 8px;
  overflow: hidden;
}

/* 工具栏 */
.viewer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--code-block-bg, var(--card-bg));
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 模式切换器 */
.mode-switcher {
  display: flex;
  gap: 4px;
  padding: 2px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 6px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  color: var(--el-text-color-primary);
  background-color: var(--el-fill-color);
}

.mode-btn.active {
  background-color: var(--el-color-primary);
  color: white;
}

/* 缩放控制 */
.scale-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scale-value {
  min-width: 50px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

/* 工具按钮 */
.tool-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--card-bg);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover:not(:disabled) {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color);
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tool-btn.active {
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
  border-color: var(--el-color-success-light-7);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

/* 内容区域 */
.viewer-content {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.view-mode-diagram .diagram-panel,
.view-mode-source .source-panel {
  width: 100%;
}

.view-mode-split .diagram-panel,
.view-mode-split .source-panel {
  width: 50%;
}

/* 图表面板 */
.diagram-panel {
  position: relative;
  background-color: var(--code-block-bg, var(--card-bg));
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--border-color);
}

.view-mode-diagram .diagram-panel,
.view-mode-source .source-panel {
  border-right: none;
}

.mermaid-diagram {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}

.mermaid-diagram.dragging {
  cursor: grabbing;
}

.mermaid-diagram :deep(svg) {
  max-width: none;
  max-height: none;
  user-select: none;
}

/* 交互提示 */
.interaction-hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  background-color: var(--el-fill-color-dark);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  border-radius: 4px;
  pointer-events: none;
  opacity: 0.6;
  backdrop-filter: blur(var(--ui-blur));
}

/* 错误提示 */
.mermaid-error {
  max-width: 600px;
  padding: 24px;
  background-color: var(--el-color-error-light-9);
  border: 1px solid var(--el-color-error-light-7);
  border-radius: 8px;
  color: var(--el-color-error);
}

.error-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.error-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.error-message {
  font-size: 14px;
  margin-bottom: 16px;
  color: var(--el-text-color-regular);
}

.error-details {
  margin-top: 12px;
}

.error-details summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  user-select: none;
  padding: 4px 0;
}

.error-details summary:hover {
  color: var(--el-text-color-primary);
}

.error-stack {
  margin-top: 8px;
  padding: 12px;
  background-color: var(--el-fill-color);
  border-radius: 4px;
  font-size: 12px;
  font-family: "Consolas", "Monaco", monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

/* 源码面板 */
.source-panel {
  display: flex;
  flex-direction: column;
  background-color: var(--code-block-bg, var(--card-bg));
  overflow: hidden;
}

.source-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.source-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.source-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.source-code {
  flex: 1;
  margin: 0;
  padding: 16px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  overflow: auto;
  white-space: pre;
  tab-size: 2;
}

/* 滚动条样式 */
.source-code::-webkit-scrollbar,
.error-stack::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.source-code::-webkit-scrollbar-track,
.error-stack::-webkit-scrollbar-track {
  background: transparent;
}

.source-code::-webkit-scrollbar-thumb,
.error-stack::-webkit-scrollbar-thumb {
  background: var(--el-border-color-light);
  border-radius: 4px;
}

.source-code::-webkit-scrollbar-thumb:hover,
.error-stack::-webkit-scrollbar-thumb:hover {
  background: var(--el-border-color);
}
</style>
