<template>
  <div class="pdf-viewer">
    <!-- 工具栏 -->
    <div class="pdf-toolbar">
      <div class="toolbar-group">
        <el-tooltip content="目录" v-if="hasOutline">
          <el-button
            :icon="List"
            :type="showOutline ? 'primary' : 'default'"
            circle
            size="small"
            @click="showOutline = !showOutline"
          />
        </el-tooltip>
        <div class="toolbar-divider" v-if="hasOutline"></div>

        <el-tooltip content="上一页">
          <el-button
            :icon="ChevronLeft"
            :disabled="currentPage <= 1 || viewMode === 'scroll'"
            circle
            size="small"
            @click="currentPage--"
          />
        </el-tooltip>
        <span class="page-info">
          <el-input-number
            v-model="currentPage"
            :min="1"
            :max="pageCount || 1"
            size="small"
            :controls="false"
            class="page-input"
            :disabled="viewMode === 'scroll' || pageCount === 0"
            @change="handlePageChange"
          />
          <span class="page-separator">/</span>
          <span class="page-total">{{ pageCount }}</span>
        </span>
        <el-tooltip content="下一页">
          <el-button
            :icon="ChevronRight"
            :disabled="currentPage >= pageCount || viewMode === 'scroll'"
            circle
            size="small"
            @click="currentPage++"
          />
        </el-tooltip>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <el-tooltip content="缩小">
          <el-button :icon="ZoomOut" circle size="small" @click="zoomOut" />
        </el-tooltip>
        <span class="zoom-info">{{ Math.round(scale * 100) }}%</span>
        <el-tooltip content="放大">
          <el-button :icon="ZoomIn" circle size="small" @click="zoomIn" />
        </el-tooltip>
        <el-tooltip content="适应宽度">
          <el-button :icon="Maximize" circle size="small" @click="fitWidth" />
        </el-tooltip>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <el-tooltip :content="viewMode === 'single' ? '切换到滚动模式' : '切换到单页模式'">
          <el-button
            :icon="viewMode === 'single' ? Rows3 : FileText"
            circle
            size="small"
            @click="toggleViewMode"
          />
        </el-tooltip>
        <el-tooltip content="旋转">
          <el-button :icon="RotateCw" circle size="small" @click="rotate" />
        </el-tooltip>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <el-tooltip content="下载 PDF">
          <el-button :icon="Download" circle size="small" @click="downloadPdf" />
        </el-tooltip>
        <el-tooltip content="打印">
          <el-button :icon="Printer" circle size="small" @click="printPdf" />
        </el-tooltip>
      </div>
    </div>

    <!-- 主体区域 (包含侧边栏和内容) -->
    <div class="pdf-main-content">
      <!-- 目录侧边栏 -->
      <div class="outline-sidebar" v-show="showOutline && hasOutline">
        <el-scrollbar>
          <el-tree
            :data="outline"
            :props="{ label: 'label', children: 'children' }"
            @node-click="handleOutlineClick"
            :highlight-current="true"
            :expand-on-click-node="false"
            class="outline-tree"
          >
            <template #default="{ node, data }">
              <div class="outline-node">
                <span class="outline-label" :title="node.label">{{ node.label }}</span>
                <span v-if="data.page" class="outline-page">{{ data.page }}</span>
              </div>
            </template>
          </el-tree>
        </el-scrollbar>
      </div>

      <!-- PDF 内容区域 -->
      <div class="pdf-container" ref="containerRef" @scroll="handleContainerScroll">
        <div class="pdf-wrapper" :style="{ transform: `rotate(${rotation}deg)` }">
          <template v-if="source">
            <!-- 单页模式 (始终渲染以保持文档状态，使用 v-show 控制显示) -->
            <div v-show="viewMode === 'single'" class="single-view-container">
              <VuePdfEmbed
                ref="pdfRef"
                :source="source"
                :page="currentPage"
                :width="pdfWidth"
                @loaded="handleLoaded"
                @rendered="handleRendered"
                class="vue-pdf-embed"
              />
            </div>

            <!-- 滚动模式 (使用 v-show 控制显示，配合 v-if 延迟渲染) -->
            <div v-show="viewMode === 'scroll'" class="scroll-view-container">
              <template v-if="hasEnteredScrollMode">
                <!-- 直接渲染所有页面，避免 v-for 创建多个实例导致的并发解析问题 -->
                <VuePdfEmbed
                  ref="scrollPdfRef"
                  v-if="pageCount > 0"
                  :source="source"
                  :width="pdfWidth"
                  @rendered="handleScrollModeRendered"
                  class="vue-pdf-embed scroll-mode-embed"
                />
                <!-- 加载中状态 (页数未知时显示) -->
                <div v-else class="loading-state">
                  <el-skeleton :rows="5" animated />
                </div>
              </template>
            </div>
          </template>

          <!-- 无内容时的加载状态 -->
          <div v-else class="loading-state">
            <el-skeleton :rows="5" animated />
          </div>
        </div>
      </div>
    </div>

    <!-- 隐藏的 iframe 用于打印 -->
    <iframe ref="printIframe" style="display: none"></iframe>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, shallowRef, onMounted, onUnmounted } from "vue";
import { useResizeObserver, useDebounceFn } from "@vueuse/core";
import VuePdfEmbed from "vue-pdf-embed";
import { GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCw,
  Download,
  Printer,
  Rows3,
  FileText,
  List,
} from "lucide-vue-next";
import { ElButton, ElTooltip, ElInputNumber, ElSkeleton, ElTree, ElScrollbar } from "element-plus";
import { createModuleLogger } from "@/utils/logger";
import customMessage from "@/utils/customMessage";

const logger = createModuleLogger("components/common/PdfViewer");

// 设置 PDF.js worker
GlobalWorkerOptions.workerSrc = pdfWorker;

// --- Props ---
interface PdfViewerProps {
  content?: Uint8Array | string; // 二进制数据或 URL
  fileName?: string;
}

const props = defineProps<PdfViewerProps>();

// --- State ---
const currentPage = ref(1);
const pageCount = ref(0);
const scale = ref(1.0);
const rotation = ref(0);
const baseWidth = ref<number>(0);
const pdfWidth = ref<number | undefined>(undefined);
const containerRef = ref<HTMLElement | null>(null);
const pdfRef = ref<InstanceType<typeof VuePdfEmbed> | null>(null);
const scrollPdfRef = ref<InstanceType<typeof VuePdfEmbed> | null>(null);
const printIframe = ref<HTMLIFrameElement | null>(null);
const pageRefs = ref<Map<number, HTMLElement>>(new Map()); // 用于滚动模式下跟踪每页元素
const isScrolling = ref(false); // 防止滚动事件与页码更新互相干扰

// 目录相关
interface OutlineNode {
  label: string;
  page?: number;
  children?: OutlineNode[];
}
const outline = ref<OutlineNode[]>([]);
const showOutline = ref(false);
const hasOutline = computed(() => outline.value.length > 0);

// 暴露内部 PDF 实例，方便父组件调用
defineExpose({
  pdfRef,
});
const viewMode = ref<"single" | "scroll">("single");
const pdfDocument = shallowRef<any>(null); // 存储 PDF 文档对象，使用 shallowRef 避免 Proxy 导致私有字段访问错误
const autoFit = ref(true); // 是否自动适应宽度
const hasEnteredScrollMode = ref(false); // 标记是否进入过滚动模式，用于延迟渲染

// --- Computed ---
const source = computed(() => {
  // 优先使用已加载的 pdfDocument 对象，避免重复解析
  // 注意：vue-pdf-embed 内部支持 PDFDocumentProxy
  if (pdfDocument.value) return pdfDocument.value;

  if (!props.content) return null;
  // vue-pdf-embed 支持 Uint8Array, ArrayBuffer, string (URL)
  return props.content;
});

// --- Methods ---

async function handleLoaded(doc: any) {
  pdfDocument.value = doc;
  pageCount.value = doc.numPages;
  // 获取第1页自然宽度
  const page = await pdfDocument.value.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  baseWidth.value = viewport.width;
  // 初始加载时适应容器宽度
  await fitWidth();
  logger.info("PDF 文档加载完成", { pageCount: doc.numPages, fileName: props.fileName });

  // 获取并解析目录
  loadOutline(doc);
}

async function loadOutline(doc: any) {
  try {
    const rawOutline = await doc.getOutline();
    if (rawOutline && rawOutline.length > 0) {
      outline.value = await parseOutline(rawOutline, doc);
      logger.info("PDF 目录解析成功", { items: outline.value.length });
    } else {
      outline.value = [];
    }
  } catch (error) {
    logger.warn("PDF 目录解析失败", error);
    outline.value = [];
  }
}

async function parseOutline(items: any[], doc: any): Promise<OutlineNode[]> {
  const result: OutlineNode[] = [];
  for (const item of items) {
    let pageNumber: number | undefined = undefined;
    try {
      let dest = item.dest;
      // 如果 dest 是字符串（命名目标），先获取实际的 dest 数组
      if (typeof dest === "string") {
        dest = await doc.getDestination(dest);
      }

      // dest 数组的第一个元素通常是页面引用 (Ref)
      if (Array.isArray(dest) && dest.length > 0) {
        const ref = dest; // 获取页面引用对象
        // getPageIndex 返回的是 0-based 索引
        const pageIndex = await doc.getPageIndex(ref);
        if (pageIndex !== -1) {
          pageNumber = pageIndex + 1;
        }
      }
    } catch (e) {
      logger.debug("解析单个目录项的页码失败", e);
    }

    const node: OutlineNode = {
      label: item.title,
      page: pageNumber,
      children:
        item.items && item.items.length > 0 ? await parseOutline(item.items, doc) : undefined,
    };
    result.push(node);
  }
  return result;
}

function handleOutlineClick(data: OutlineNode) {
  if (data.page) {
    currentPage.value = data.page;
  }
}

function handleRendered() {
  // 渲染完成后的回调
  logger.debug("PDF 页面渲染完成", { currentPage: currentPage.value });
}

/**
 * 滚动模式渲染完成回调
 * 获取每一页的 DOM 元素以便进行滚动定位
 */
function handleScrollModeRendered() {
  logger.debug("PDF 滚动模式渲染完成");

  // 尝试获取每一页的 DOM 元素
  // vue-pdf-embed 渲染所有页面时，通常会生成一系列 div 或 canvas
  // 我们通过 scrollPdfRef 获取根元素，然后遍历子元素
  if (scrollPdfRef.value?.$el) {
    const pages = scrollPdfRef.value.$el.children;
    pageRefs.value.clear();

    // 遍历子元素，建立页码到元素的映射
    // 注意：具体结构取决于 vue-pdf-embed 版本，通常子元素就是页面容器
    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i] as HTMLElement;
      // 过滤掉非页面元素（如果有的话）
      if (pageEl.tagName === "DIV" || pageEl.tagName === "CANVAS") {
        pageRefs.value.set(i + 1, pageEl);
      }
    }
  }
}

/**
 * 处理容器滚动事件，在滚动模式下更新当前页码
 */
function handleContainerScroll() {
  if (viewMode.value !== "scroll" || isScrolling.value) {
    return;
  }

  const container = containerRef.value;
  if (!container) return;

  // 如果没有获取到页面元素引用，尝试重新获取
  if (pageRefs.value.size === 0 && scrollPdfRef.value) {
    handleScrollModeRendered();
  }

  // 如果还是没有，使用简单的百分比估算
  if (pageRefs.value.size === 0) {
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    if (scrollHeight > clientHeight) {
      const progress = scrollTop / (scrollHeight - clientHeight);
      const estimatedPage = Math.min(
        Math.max(1, Math.ceil(progress * pageCount.value)),
        pageCount.value
      );
      if (currentPage.value !== estimatedPage) {
        currentPage.value = estimatedPage;
      }
    }
    return;
  }

  const containerTop = container.scrollTop;
  const containerHeight = container.clientHeight;
  const containerCenter = containerTop + containerHeight / 2;

  let closestPage = 1;
  let closestDistance = Infinity;

  pageRefs.value.forEach((el, page) => {
    const rect = el.getBoundingClientRect();
    // 简单的可见性检查
    if (rect.height === 0) return;

    const containerRect = container.getBoundingClientRect();
    // 计算元素中心相对于容器顶部的距离
    const elTop = rect.top - containerRect.top + containerTop;
    const elCenter = elTop + rect.height / 2;
    const distance = Math.abs(elCenter - containerCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestPage = page;
    }
  });

  if (currentPage.value !== closestPage) {
    currentPage.value = closestPage;
  }
}

function handlePageChange(val: number | undefined) {
  if (val && val >= 1 && val <= pageCount.value) {
    currentPage.value = val;
  } else {
    // 如果输入无效，重置为当前页
    // 需要 nextTick 或者强制更新来回退 UI
    // 这里简单处理，依赖 v-model 的自动修正
  }
}

function zoomIn() {
  autoFit.value = false;
  scale.value = Math.min(scale.value + 0.1, 3.0);
  updatePdfWidth();
}

function zoomOut() {
  autoFit.value = false;
  scale.value = Math.max(scale.value - 0.1, 0.5);
  updatePdfWidth();
}

function updatePdfWidth() {
  if (baseWidth.value > 0) {
    pdfWidth.value = baseWidth.value * scale.value;
  }
}

async function fitWidth() {
  if (!containerRef.value || !pdfDocument.value || baseWidth.value === 0) return;

  // 标记为自动适应模式
  autoFit.value = true;

  try {
    // 获取当前页面的视口信息（默认获取第1页或当前页）
    const page = await pdfDocument.value.getPage(currentPage.value || 1);
    const viewport = page.getViewport({ scale: 1 });

    // 考虑旋转因素 (CSS transform)
    // 如果旋转了 90 或 270 度，视觉上的宽度其实是页面的高度
    const isVertical = rotation.value % 180 === 0;
    const contentWidth = isVertical ? viewport.width : viewport.height;

    if (contentWidth > 0) {
      // 获取容器宽度，减去一些 padding (20px * 2)
      const containerWidth = containerRef.value.clientWidth - 40;
      // 计算目标缩放比例
      const newScale = containerWidth / contentWidth;

      // 设置缩放比例（保留2位小数，防止精度问题）
      scale.value = Number(newScale.toFixed(2));
      pdfWidth.value = containerWidth;
    }
  } catch (error) {
    logger.error("计算自适应宽度失败", error as Error);
  }
}

function rotate() {
  rotation.value = (rotation.value + 90) % 360;
}

/**
 * 滚动到指定页面 (滚动模式下)
 */
function scrollToPage(page: number) {
  if (viewMode.value !== "scroll" || !containerRef.value) return;

  const el = pageRefs.value.get(page);
  if (el) {
    isScrolling.value = true; // 锁定防止循环触发
    const container = containerRef.value;
    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetTop =
      rect.top -
      containerRect.top +
      container.scrollTop -
      (container.clientHeight / 2 - rect.height / 2);
    container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    setTimeout(() => {
      isScrolling.value = false;
    }, 300); // 解锁
  }
}

function toggleViewMode() {
  const newMode = viewMode.value === "single" ? "scroll" : "single";

  // 如果切换到滚动模式，标记为已进入过
  if (newMode === "scroll") {
    hasEnteredScrollMode.value = true;
  }

  // 切换前清理滚动模式的页面引用
  if (viewMode.value === "scroll") {
    pageRefs.value.clear();
  }

  viewMode.value = newMode;

  // 切换模式后重新适应宽度，并滚动到当前页
  nextTick(async () => {
    await fitWidth();
    if (newMode === "scroll") {
      // 滚动模式：等待页面渲染完成后滚动到当前页
      setTimeout(() => {
        scrollToPage(currentPage.value);
      }, 100);
    }
  });
}

/**
 * 下载 PDF 文件
 */
async function downloadPdf() {
  if (!props.content) {
    customMessage.warning("没有可下载的 PDF 内容");
    return;
  }

  try {
    let blob: Blob;

    if (typeof props.content === "string") {
      // 如果是 URL，需要先获取数据
      const response = await fetch(props.content);
      blob = await response.blob();
    } else {
      // 如果是 Uint8Array
      blob = new Blob([props.content], { type: "application/pdf" });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = props.fileName || "document.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    customMessage.success("PDF 下载已开始");
    logger.info("PDF 下载成功", { fileName: props.fileName });
  } catch (error) {
    logger.error("PDF 下载失败", error as Error);
    customMessage.error("下载失败，请重试");
  }
}

/**
 * 打印 PDF 文件
 */
async function printPdf() {
  if (!props.content) {
    customMessage.warning("没有可打印的 PDF 内容");
    return;
  }

  try {
    let blob: Blob;

    if (typeof props.content === "string") {
      const response = await fetch(props.content);
      blob = await response.blob();
    } else {
      blob = new Blob([props.content], { type: "application/pdf" });
    }

    const url = URL.createObjectURL(blob);

    if (printIframe.value) {
      printIframe.value.src = url;
      printIframe.value.onload = () => {
        try {
          printIframe.value?.contentWindow?.print();
        } catch (e) {
          // 如果 iframe 打印失败，尝试新窗口打印
          const printWindow = window.open(url, "_blank");
          if (printWindow) {
            printWindow.onload = () => {
              printWindow.print();
            };
          }
        }
        // 延迟清理 URL
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }

    logger.info("PDF 打印请求已发送", { fileName: props.fileName });
  } catch (error) {
    logger.error("PDF 打印失败", error as Error);
    customMessage.error("打印失败，请重试");
  }
}

// 监听容器大小变化，自动调整宽度
const debouncedFitWidth = useDebounceFn(() => {
  if (autoFit.value) {
    fitWidth();
  }
}, 200);

useResizeObserver(containerRef, debouncedFitWidth);

// 监听 content 变化，重置状态
watch(
  () => props.content,
  () => {
    currentPage.value = 1;
    pageCount.value = 0;
    scale.value = 1.0;
    rotation.value = 0;
    autoFit.value = true;
    pdfDocument.value = null;
    pageRefs.value.clear();
    hasEnteredScrollMode.value = false; // 重置滚动模式状态

    // 预设宽度为容器宽度，防止初始渲染时尺寸闪烁
    if (containerRef.value) {
      pdfWidth.value = containerRef.value.clientWidth - 40;
    }
  }
);

/**
 * 处理键盘快捷键
 */
function handleKeydown(e: KeyboardEvent) {
  // 如果焦点在输入框内，不触发快捷键
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
    return;
  }

  // 组合键支持 (Ctrl/Meta)
  const isCtrl = e.ctrlKey || e.metaKey;

  switch (e.key) {
    // 翻页
    case "ArrowLeft":
    case "PageUp":
      if (currentPage.value > 1) {
        currentPage.value--;
      }
      break;
    case "ArrowRight":
    case "PageDown":
      if (currentPage.value < pageCount.value) {
        currentPage.value++;
      }
      break;

    // 缩放
    case "=":
    case "+":
      if (isCtrl) e.preventDefault(); // 防止浏览器默认缩放
      zoomIn();
      break;
    case "-":
      if (isCtrl) e.preventDefault();
      zoomOut();
      break;
    case "0":
      if (isCtrl) {
        e.preventDefault();
        fitWidth();
      }
      break;

    // 旋转
    case "r":
    case "R":
      rotate();
      break;

    // 切换视图模式
    case "m": // Mode
    case "M":
      toggleViewMode();
      break;

    // 下载 (Ctrl + S)
    case "s":
    case "S":
      if (isCtrl) {
        e.preventDefault(); // 防止浏览器保存网页
        downloadPdf();
      }
      break;

    // 打印 (Ctrl + P)
    case "p":
    case "P":
      if (isCtrl) {
        e.preventDefault(); // 防止浏览器打印网页
        printPdf();
      }
      break;
  }
}

onMounted(() => {
  // 组件挂载时预设宽度
  if (containerRef.value) {
    pdfWidth.value = containerRef.value.clientWidth - 40;
  }
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

// 监听 currentPage 变化，在滚动模式下滚动到对应页
watch(currentPage, (newPage) => {
  if (viewMode.value === "scroll" && !isScrolling.value) {
    scrollToPage(newPage);
  }
});
</script>

<style scoped lang="scss">
.pdf-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--vscode-editor-background);
  overflow: hidden;
}

.pdf-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  gap: 16px;
  flex-shrink: 0;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background-color: var(--border-color);
}

.page-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.page-input {
  width: 60px;

  :deep(.el-input__wrapper) {
    padding-left: 8px;
    padding-right: 8px;
  }

  :deep(.el-input__inner) {
    text-align: center;
  }
}

.zoom-info {
  font-size: 13px;
  color: var(--el-text-color-regular);
  min-width: 40px;
  text-align: center;
}

.pdf-container {
  flex-grow: 1;
  overflow: auto;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background-color: var(--vscode-editor-background);

  /* 滚动条样式优化 */
  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-bg-color, rgba(121, 121, 121, 0.4));
    border-radius: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.pdf-wrapper {
  transition: transform 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  background-color: white; /* PDF 背景通常是白色 */
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
}

/* 覆盖 vue-pdf-embed 的一些默认样式 */
.vue-pdf-embed {
  display: block;
}

.single-view-container,
.scroll-view-container {
  width: 100%;
}

/* 滚动模式样式优化 */
.scroll-mode-embed {
  :deep(> div) {
    margin-bottom: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    background-color: white;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(canvas) {
    display: block; /* 消除 canvas底部的默认间距 */
  }
}
</style>
