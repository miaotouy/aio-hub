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
          {{ Math.round(lastCanvas.height / 2) }} px
          · {{ selectedCount }} 条
        </template>
        <template v-else>
          渲染 {{ width }} px · <span class="preview-toolbar-hint">预览缩放</span> {{ Math.round(previewScale * 100) }}%
        </template>
      </span>
      <div class="preview-toolbar-actions">
        <el-button size="small" @click="zoomOut" :disabled="previewScale <= 0.4">
          <el-icon><ZoomOut /></el-icon>
        </el-button>
        <el-button size="small" @click="resetZoom" title="重置预览缩放（仅影响预览显示, 不影响最终图片）">100%</el-button>
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
      <div
        class="preview-stage"
        :class="{ 'is-pannable': isPanning }"
      >
        <div
          class="preview-canvas-frame"
          :style="previewFrameStyle"
        >
          <!--
            关键: ScreenshotRenderer 必须始终挂载, 不能用 display:none
            也不能受 Tab 切换隐藏, 否则 getBoundingClientRect() 返回 0,
            截图高度坍缩为 0。
          -->
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
          />
          <div v-else class="preview-empty">
            <el-icon :size="32"><Eye /></el-icon>
            <p>请选择至少一条消息以查看预览</p>
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
import { computed, ref } from "vue";
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
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${previewScale.value})`,
  transformOrigin: "top center",
}));

function zoomIn() {
  previewScale.value = Math.min(2, Math.round((previewScale.value + 0.1) * 10) / 10);
}
function zoomOut() {
  previewScale.value = Math.max(0.4, Math.round((previewScale.value - 0.1) * 10) / 10);
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
  if (target.closest("button, input, .el-input, .el-select, .el-slider")) return;

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
}
.preview-wrapper:active,
.preview-stage.is-pannable {
  cursor: grabbing;
}

.preview-stage {
  /* 极小 padding 让缩放时不贴边 */
  padding: 24px 16px;
  min-height: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.preview-canvas-frame {
  /* 缩放原点: 顶部居中, 配合 translate 实现拖拽 */
  transition: transform 0.15s ease;
  flex-shrink: 0;
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
  transition: transform 0.15s, box-shadow 0.15s;
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