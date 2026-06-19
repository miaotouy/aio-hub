<!--
  截图预览面板 (右下) — V3 重构版

  设计目标:
  - 主视觉 = 实时排版预览 (DOM 镜像), 用户修改配置时**瞬间**看到效果
  - 缩略图小容器 = 仅在手动点击"生成截图"后才出现, 提供最直观的图片反馈
  - 完全手动: 不防抖、不监听配置变化、不在打开时自动渲染

  结构 (从上到下):
    1. 工具栏: 缩放控制 + "生成截图"按钮
    2. DOM 预览区: ScreenshotRenderer 永久挂载, 支持滚轮缩放 + 拖拽平移
    3. 缩略图条: 固定高度小容器, 仅在生成后展示图片
    4. 状态栏 + 复制/保存按钮
-->
<template>
  <section class="right-panel">
    <!-- 1. 工具栏 -->
    <div class="preview-toolbar">
      <span class="preview-stats">
        <Camera :size="14" />
        <template v-if="lastCanvas">
          {{ Math.round(lastCanvas.width / 2) }} ×
          {{ Math.round(lastCanvas.height / 2) }} px · {{ selectedCount }} 条
        </template>
        <template v-else>
          渲染 {{ width }} px ·
          <span class="preview-toolbar-hint">预览缩放</span>
          {{ Math.round(previewScale * 100) }}%
        </template>
      </span>
      <div class="preview-toolbar-actions">
        <el-button
          size="small"
          @click="zoomOut"
          :disabled="previewScale <= 0.4"
        >
          <el-icon><ZoomOut /></el-icon>
        </el-button>
        <el-button
          size="small"
          @click="resetZoom"
          title="重置预览缩放（仅影响预览显示, 不影响最终图片）"
          >100%</el-button
        >
        <el-button size="small" @click="zoomIn" :disabled="previewScale >= 2">
          <el-icon><ZoomIn /></el-icon>
        </el-button>
        <el-button
          type="primary"
          size="small"
          :loading="generating"
          :disabled="selectedCount === 0"
          @click="emit('regenerate')"
        >
          <el-icon><Camera /></el-icon>
          <span style="margin-left: 4px">生成截图</span>
        </el-button>
      </div>
    </div>

    <!-- 2. DOM 实时预览区 -->
    <div
      ref="previewWrapperRef"
      class="preview-wrapper"
      @wheel="onPreviewWheel"
      @mousedown="onPreviewMouseDown"
    >
      <div class="preview-stage" :class="{ 'is-pannable': isPanning }">
        <div class="preview-canvas-frame" :style="previewFrameStyle">
          <!--
            关键: 缩放由内层 .preview-canvas-scaler 的 transform: scale 承担,
            外层 .preview-canvas-frame 用显式 width/height (= 自然尺寸 * scale)
            撑出与可视内容等大的布局盒, 这样 overflow:auto 才能拿到正确的滚动范围。
            之前把 scale 写在 frame 上, 布局盒始终是原始尺寸, 导致
            - 放大时可视内容超出布局盒, 横向滚动范围不够, 部分内容跑到容器外
            - 缩小时布局盒大于可视内容, 下方/右侧留出额外空白
            ScreenshotRenderer 也必须始终挂载, 不能用 display:none,
            否则 getBoundingClientRect() 返回 0, 截图高度坍缩为 0。
          -->
          <div
            ref="scalerRef"
            class="preview-canvas-scaler"
            :style="scalerStyle"
          >
            <ScreenshotRenderer
              v-if="selectedCount > 0"
              ref="rendererRef"
              :messages="messages"
              :session-index="sessionIndex"
              :session-detail="sessionDetail"
              :is-sending="isSending"
              :llm-think-rules="llmThinkRules"
              :rich-text-style-options="richTextStyleOptions"
              :user-rich-text-style-options="userRichTextStyleOptions"
              :collapse-strategy="collapseStrategy"
              :width="width"
              :element-toggles="elementToggles"
              :layout-overrides="layoutOverrides"
              :bg-config="bgConfig"
              :gap="gap"
              :padding="padding"
              :enable-decoration="enableDecoration"
            />
            <div v-else class="preview-empty">
              <el-icon :size="32"><Eye /></el-icon>
              <p>请选择至少一条消息以查看预览</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 缩略图条 -->
    <div class="thumbnail-bar">
      <div class="thumbnail-bar-header">
        <span class="thumbnail-bar-title">
          <ImageIcon :size="14" />
          截图效果
        </span>
        <span v-if="lastCanvas" class="thumbnail-bar-dim">
          {{ Math.round(lastCanvas.width / 2) }} ×
          {{ Math.round(lastCanvas.height / 2) }} px
        </span>
      </div>
      <div class="thumbnail-bar-body">
        <div v-if="generating" class="thumbnail-state">
          <el-icon :size="24" class="is-spinning"><Loader2 /></el-icon>
          <span class="thumbnail-state-text">
            正在生成 {{ progress.done }} / {{ progress.total }}
          </span>
        </div>
        <img
          v-else-if="lastImageUrl"
          :src="lastImageUrl"
          class="screenshot-thumbnail"
          alt="截图缩略图，点击查看大图"
          @click="openImageViewer"
        />
        <div v-else class="thumbnail-state thumbnail-state--placeholder">
          <el-icon :size="24"><ImageIcon /></el-icon>
          <span class="thumbnail-state-text">尚未生成截图</span>
          <span class="thumbnail-state-hint">点击右上角"生成截图"按钮</span>
        </div>
      </div>
    </div>

    <!-- 4. 底部状态栏 + 操作按钮 -->
    <div class="preview-footer">
      <div class="preview-status">
        <template v-if="generating">
          正在生成… {{ progress.done }} / {{ progress.total }}
        </template>
        <template v-else-if="lastCanvas">
          已生成 {{ Math.round(lastCanvas.width / 2) }} ×
          {{ Math.round(lastCanvas.height / 2) }} px ({{ selectedCount }} 条)
        </template>
        <template v-else>未生成 — 修改配置不会自动重新生成</template>
      </div>
      <div class="preview-actions">
        <el-button
          :icon="Copy"
          size="small"
          :disabled="!lastCanvas || generating"
          @click="emit('copy')"
        >
          复制到剪贴板
        </el-button>
        <el-button
          type="primary"
          size="small"
          :icon="Download"
          :disabled="!lastCanvas || generating"
          @click="emit('save')"
        >
          保存图片
        </el-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  Camera,
  Copy,
  Download,
  Eye,
  Image as ImageIcon,
  Loader2,
  ZoomIn,
  ZoomOut,
} from "lucide-vue-next";
import { ElButton, ElIcon } from "element-plus";
import ScreenshotRenderer from "./ScreenshotRenderer.vue";
import { useImageViewer } from "@/composables/useImageViewer";
import type { ChatMessageNode } from "../../types";
import type { ChatSessionIndex, ChatSessionDetail } from "../../types/session";
import type {
  CollapseStrategy,
  ElementToggles,
  LayoutOverrides,
  ScreenshotBgConfig,
} from "./screenshotTypes";
interface Props {
  /** ScreenshotRenderer props */
  messages: ChatMessageNode[];
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  isSending?: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  userRichTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  collapseStrategy: CollapseStrategy;
  /** 截图容器宽度 (CSS px), 默认 720 */
  width: number;
  elementToggles: ElementToggles;
  layoutOverrides: LayoutOverrides;

  /** V4: 背景配置 */
  bgConfig?: ScreenshotBgConfig;
  /** V4: 消息间距 */
  gap?: number;
  /** V4: 四周留白 */
  padding?: number;
  /** V4: 卡片装饰 */
  enableDecoration?: boolean;

  /** 生成结果 */
  lastImageUrl: string;
  lastCanvas: HTMLCanvasElement | null;
  generating: boolean;
  progress: { done: number; total: number; currentLabel: string };
  selectedCount: number;
}

const props = withDefaults(defineProps<Props>(), {
  isSending: false,
  width: 720,
  padding: 0,
  enableDecoration: false,
});

const emit = defineEmits<{
  (e: "regenerate"): void;
  (e: "copy"): void;
  (e: "save"): void;
}>();

// 暴露给父组件: 获取可截图的消息元素
const rendererRef = ref<InstanceType<typeof ScreenshotRenderer> | null>(null);
function getMessageElements(): HTMLElement[] {
  return rendererRef.value?.getMessageElements() ?? [];
}
defineExpose({ getMessageElements, rendererRef });

// ----- 自然尺寸追踪 -----
// 用 ResizeObserver 跟踪内层 .preview-canvas-scaler 的 layout 高度,
// 宽度直接使用 props.width (因为渲染器宽度是固定的, 测量宽度会导致 ResizeObserver 测量死循环)。
// 拿到 scale = 1 时的真实高度, 据此把外层 frame 的 width/height 显式设成
// 自然尺寸 * scale, 让 overflow:auto 容器给出的滚动范围与可视内容等大。
const scalerRef = ref<HTMLElement | null>(null);
const measuredHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

watch(
  [scalerRef, () => props.selectedCount],
  ([newScaler, selectedCount]) => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (newScaler && selectedCount > 0) {
      // 同步读取一次 layout, 避免首帧 frame 高度坍缩为 0 导致内容溢出
      measuredHeight.value = newScaler.clientHeight || 0;
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          measuredHeight.value = entry.contentRect.height;
        }
      });
      resizeObserver.observe(newScaler);
    } else {
      measuredHeight.value = 0;
    }
  },
  { immediate: true, flush: "post" }
);

const naturalSize = computed(() => ({
  width: props.width,
  height: measuredHeight.value,
}));

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

// ----- 缩放 / 拖拽 -----
const previewScale = ref(0.8);
const panX = ref(0);
const panY = ref(0);
const isPanning = ref(false);
let panStartX = 0;
let panStartY = 0;
let panStartOffsetX = 0;
let panStartOffsetY = 0;

const previewFrameStyle = computed(() => ({
  // 关键: 显式 width/height = 自然尺寸 * 缩放, 让布局盒与可视内容等大,
  // 这样外层 overflow:auto 才能给出与可视内容匹配的滚动范围。
  width: `${naturalSize.value.width * previewScale.value}px`,
  height: `${naturalSize.value.height * previewScale.value}px`,
  // 拖拽用 translate, 缩放交给内层 .preview-canvas-scaler。
  transform: `translate(${panX.value}px, ${panY.value}px)`,
}));

const scalerStyle = computed(() => ({
  // 锚定左上角, 配合 frame 的等大布局盒, 可视内容正好填满 frame。
  transform: `scale(${previewScale.value})`,
  transformOrigin: "top left",
}));

function zoomIn() {
  previewScale.value = Math.min(
    2,
    Math.round((previewScale.value + 0.1) * 10) / 10
  );
}
function zoomOut() {
  previewScale.value = Math.max(
    0.4,
    Math.round((previewScale.value - 0.1) * 10) / 10
  );
}
function resetZoom() {
  // 100% 按钮 = 1:1 像素映射, 让用户看清渲染尺寸原貌
  previewScale.value = 1.0;
  panX.value = 0;
  panY.value = 0;
}

function onPreviewWheel(e: WheelEvent) {
  // Ctrl/Cmd + 滚轮: 缩放; 普通滚轮: 滚动容器
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }
}

function onPreviewMouseDown(e: MouseEvent) {
  // 简化: 鼠标左键直接拖拽空白处, 排除按钮/输入控件
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, input, .el-input, .el-select, .el-slider"))
    return;

  isPanning.value = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartOffsetX = panX.value;
  panStartOffsetY = panY.value;

  const onMove = (ev: MouseEvent) => {
    panX.value = panStartOffsetX + (ev.clientX - panStartX);
    panY.value = panStartOffsetY + (ev.clientY - panStartY);
  };
  const onUp = () => {
    isPanning.value = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

// ----- 大图查看 -----
const imageViewer = useImageViewer();
function openImageViewer() {
  if (!props.lastImageUrl) return;
  imageViewer.show(props.lastImageUrl);
}
</script>

<style scoped>
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

/* ===== 1. 工具栏 ===== */
.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.preview-stats {
  font-size: 12px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}
.preview-toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
  align-items: center;
}
.preview-toolbar-hint {
  color: var(--text-color-placeholder);
  font-size: 11px;
  margin: 0 2px;
}

/* ===== 2. DOM 预览区 ===== */
.preview-wrapper {
  flex: 1;
  overflow: auto;
  background: var(--container-bg);
  /* 与消息列表同色背景, 让预览贴近真实聊天界面 */
  min-height: 0;
  position: relative;
  cursor: grab;
  /* 让 .preview-stage 可以 margin:auto 居中:
     - 内容小时 stage 居中, 四周留白对称, 不再下方留额外空白
     - 内容大时 margin 退化为 0, stage 贴左上, 用户自然滚动 */
  display: flex;
}
.preview-wrapper:active,
.preview-stage.is-pannable {
  cursor: grabbing;
}

.preview-stage {
  /* 极小 padding 让缩放时不贴边 */
  padding: 24px 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  /* wrapper 是 flex 容器, 用 margin:auto 双向居中;
     内容超出 wrapper 时 margin 退化为 0, 自然贴左上滚动 */
  margin: auto;
  /* 关键: 不再写 min-height: 100%。
     之前写 min-height: 100% 会让 stage 在缩小时仍撑满 wrapper,
     frame 居顶后下方留出一大块空白。*/
}

.preview-canvas-frame {
  /* 关键: width/height 由 previewFrameStyle 显式设为 自然尺寸 * scale,
     布局盒与可视内容等大, overflow:auto 才能给出与可视内容匹配的滚动范围。
     transition 覆盖 width/height, 让缩放有平滑动画。*/
  transition:
    transform 0.15s ease,
    width 0.15s ease,
    height 0.15s ease;
  flex-shrink: 0;
}

.preview-canvas-scaler {
  /* 缩放锚定左上, 配合 frame 的等大布局盒, 可视内容正好填满 frame */
  transform-origin: top left;
  display: block;
}

.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 80px 0;
  color: var(--text-color-secondary);
  font-size: 13px;
}

/* ===== 3. 缩略图条 ===== */
.thumbnail-bar {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
  height: 138px;
  display: flex;
  flex-direction: column;
}
.thumbnail-bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-color-secondary);
}
.thumbnail-bar-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
.thumbnail-bar-dim {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}
.thumbnail-bar-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  overflow: hidden;
  min-height: 0;
}

.screenshot-thumbnail {
  /* 缩略图最大高度受 body 高度限制, 宽度按比例自动 */
  max-height: 100%;
  max-width: 100%;
  height: auto;
  width: auto;
  display: block;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  cursor: zoom-in;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}
.screenshot-thumbnail:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.thumbnail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-color-secondary);
  text-align: center;
}
.thumbnail-state-text {
  font-size: 12px;
}
.thumbnail-state-hint {
  font-size: 11px;
  color: var(--text-color-placeholder);
}
.thumbnail-state--placeholder {
  opacity: 0.7;
}
.is-spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== 4. 底部状态栏 + 操作按钮 ===== */
.preview-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.preview-status {
  font-size: 12px;
  color: var(--text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.preview-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
</style>

