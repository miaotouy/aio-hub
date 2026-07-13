<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <section class="right-panel">
    <!-- 1. 工具栏 -->
    <div class="preview-toolbar">
      <span class="preview-stats">
        <Camera :size="14" />
        <template v-if="activeItem">
          {{ Math.round(activeItem.width / 2) }} ×
          {{ Math.round(activeItem.height / 2) }} px ·
          {{ activeItem.messageCount }} 条
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
          <el-icon>
            <ZoomOut />
          </el-icon>
        </el-button>
        <el-button
          size="small"
          @click="resetZoom"
          title="重置预览缩放（仅影响预览显示, 不影响最终图片）"
          >100%</el-button
        >
        <el-button size="small" @click="zoomIn" :disabled="previewScale >= 2">
          <el-icon>
            <ZoomIn />
          </el-icon>
        </el-button>
        <el-button
          type="primary"
          size="small"
          :loading="generating"
          :disabled="selectedCount === 0"
          @click="emit('regenerate')"
        >
          <el-icon>
            <Camera />
          </el-icon>
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
              :watermark="watermark"
              :brand="brand"
            />
            <div v-else class="preview-empty">
              <el-icon :size="32">
                <Eye />
              </el-icon>
              <p>请选择至少一条消息以查看预览</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 缩略图条 — 横向滚动历史列表 -->
    <div class="thumbnail-bar">
      <div class="thumbnail-bar-header">
        <span class="thumbnail-bar-title">
          <ImageIcon :size="14" />
          截图历史
          <span v-if="history.length" class="thumbnail-bar-count"
            >({{ history.length }})</span
          >
        </span>
        <div class="thumbnail-bar-header-actions">
          <span v-if="activeItem" class="thumbnail-bar-dim">
            {{ Math.round(activeItem.width / 2) }} ×
            {{ Math.round(activeItem.height / 2) }} px
          </span>
          <el-button
            v-if="history.length > 0"
            size="small"
            text
            type="danger"
            @click="clearHistory"
          >
            <Trash2 :size="12" />
            <span style="margin-left: 2px">清空</span>
          </el-button>
        </div>
      </div>
      <div class="thumbnail-bar-body">
        <!-- 生成中指示器 -->
        <div v-if="generating" class="thumbnail-generating">
          <el-icon :size="20" class="is-spinning">
            <Loader2 />
          </el-icon>
          <span class="thumbnail-state-text">
            {{ progress.done }} / {{ progress.total }}
          </span>
        </div>
        <!-- 历史列表 -->
        <div
          v-if="history.length > 0"
          ref="historyScrollRef"
          class="thumbnail-list"
        >
          <div
            v-for="(item, idx) in history"
            :key="item.id"
            class="thumbnail-item"
            :class="{
              'is-active': activeIndex === idx,
              'is-stale': item.stale,
            }"
            @click="activeIndex = idx"
          >
            <img
              :src="item.url"
              class="thumbnail-item-img"
              :alt="`截图 #${idx + 1}`"
            />
            <span class="thumbnail-item-index">#{{ idx + 1 }}</span>
            <span v-if="item.stale" class="thumbnail-item-stale-badge"
              >已过时</span
            >
            <button
              class="thumbnail-item-remove"
              title="移除此项"
              @click.stop="removeHistoryItem(idx)"
            >
              <X :size="10" />
            </button>
          </div>
        </div>
        <!-- 空状态 -->
        <div
          v-if="!generating && history.length === 0"
          class="thumbnail-state thumbnail-state--placeholder"
        >
          <el-icon :size="24">
            <ImageIcon />
          </el-icon>
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
        <template v-else-if="activeItem">
          <span v-if="activeItem.stale" class="status-stale-hint"
            >⚠ 已过时</span
          >
          {{ Math.round(activeItem.width / 2) }} ×
          {{ Math.round(activeItem.height / 2) }} px ({{
            activeItem.messageCount
          }}
          条)
        </template>
        <template v-else>未生成 — 修改配置不会自动重新生成</template>
      </div>
      <div class="preview-actions">
        <el-button
          size="small"
          :disabled="!activeItem || generating"
          @click="handleViewFull"
        >
          <el-icon>
            <Eye />
          </el-icon>
          <span style="margin-left: 4px">查看大图</span>
        </el-button>
        <el-button
          :icon="Copy"
          size="small"
          :disabled="!activeItem || generating"
          @click="handleCopy"
        >
          复制到剪贴板
        </el-button>
        <el-button
          type="primary"
          size="small"
          :icon="Download"
          :disabled="!activeItem || generating"
          @click="handleSave"
        >
          保存图片
        </el-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  Camera,
  Copy,
  Download,
  Eye,
  Image as ImageIcon,
  Loader2,
  Trash2,
  X,
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
  ScreenshotBrandConfig,
  ScreenshotWatermarkConfig,
} from "./screenshotTypes";

/** 截图历史列表项 */
interface ScreenshotHistoryItem {
  id: number;
  url: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  messageCount: number;
  timestamp: number;
  stale: boolean;
}

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

  /** V5: 水印配置 */
  watermark?: ScreenshotWatermarkConfig;
  /** V5: 品牌标识 (头/脚) 配置 */
  brand?: ScreenshotBrandConfig;

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
  (e: "copy", canvas: HTMLCanvasElement): void;
  (e: "save", canvas: HTMLCanvasElement): void;
}>();

// 暴露给父组件: 获取可截图的消息元素
const rendererRef = ref<InstanceType<typeof ScreenshotRenderer> | null>(null);
function getMessageElements(): HTMLElement[] {
  return rendererRef.value?.getMessageElements() ?? [];
}
defineExpose({ getMessageElements, rendererRef });

// ----- 自然尺寸追踪 -----
const scalerRef = ref<HTMLElement | null>(null);
const measuredHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

watch(
  [scalerRef, () => props.selectedCount],
  ([newScaler, selectedCount]) => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (newScaler && selectedCount > 0) {
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
  width: `${naturalSize.value.width * previewScale.value}px`,
  height: `${naturalSize.value.height * previewScale.value}px`,
  transform: `translate(${panX.value}px, ${panY.value}px)`,
}));

const scalerStyle = computed(() => ({
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
  previewScale.value = 1.0;
  panX.value = 0;
  panY.value = 0;
}

function onPreviewWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }
}

function onPreviewMouseDown(e: MouseEvent) {
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

// ----- 截图历史列表 -----
const history = ref<ScreenshotHistoryItem[]>([]);
const activeIndex = ref(-1);
const historyScrollRef = ref<HTMLElement | null>(null);
let historyIdCounter = 0;

const activeItem = computed<ScreenshotHistoryItem | null>(() => {
  if (activeIndex.value < 0 || activeIndex.value >= history.value.length)
    return null;
  return history.value[activeIndex.value];
});

// 监听 lastImageUrl: 非空 = 新图生成完毕, 加入历史
watch(
  () => props.lastImageUrl,
  (newUrl, oldUrl) => {
    if (newUrl && newUrl !== oldUrl && props.lastCanvas) {
      const item: ScreenshotHistoryItem = {
        id: ++historyIdCounter,
        url: newUrl,
        canvas: props.lastCanvas,
        width: props.lastCanvas.width,
        height: props.lastCanvas.height,
        messageCount: props.selectedCount,
        timestamp: Date.now(),
        stale: false,
      };
      history.value.push(item);
      activeIndex.value = history.value.length - 1;
      // 滚动到最新项
      nextTick(() => {
        if (historyScrollRef.value) {
          historyScrollRef.value.scrollLeft =
            historyScrollRef.value.scrollWidth;
        }
      });
    } else if (!newUrl && oldUrl) {
      // 父组件清空了 = 配置变更, 标记所有现有项为过时
      markAllStale();
    }
  }
);

function markAllStale() {
  for (const item of history.value) {
    item.stale = true;
  }
}

function removeHistoryItem(idx: number) {
  history.value.splice(idx, 1);
  if (history.value.length === 0) {
    activeIndex.value = -1;
  } else if (activeIndex.value >= history.value.length) {
    activeIndex.value = history.value.length - 1;
  } else if (activeIndex.value > idx) {
    activeIndex.value--;
  }
}

function clearHistory() {
  history.value = [];
  activeIndex.value = -1;
}

// ----- 操作: 大图 / 复制 / 保存 -----
const imageViewer = useImageViewer();

function handleViewFull() {
  if (!activeItem.value) return;
  imageViewer.show(activeItem.value.url);
}

function handleCopy() {
  if (!activeItem.value) return;
  emit("copy", activeItem.value.canvas);
}

function handleSave() {
  if (!activeItem.value) return;
  emit("save", activeItem.value.canvas);
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
  min-height: 0;
  position: relative;
  cursor: grab;
  display: flex;
}

.preview-wrapper:active,
.preview-stage.is-pannable {
  cursor: grabbing;
}

.preview-stage {
  padding: 24px 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: auto;
}

.preview-canvas-frame {
  transition:
    transform 0.15s ease,
    width 0.15s ease,
    height 0.15s ease;
  flex-shrink: 0;
}

.preview-canvas-scaler {
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

/* ===== 3. 缩略图条 — 历史列表 ===== */
.thumbnail-bar {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
  height: 148px;
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

.thumbnail-bar-count {
  font-weight: 400;
  color: var(--text-color-placeholder);
  margin-left: 2px;
}

.thumbnail-bar-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.thumbnail-bar-dim {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}

.thumbnail-bar-body {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  overflow: hidden;
  min-height: 0;
  gap: 8px;
}

/* 生成中指示器 */
.thumbnail-generating {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0 8px;
  flex-shrink: 0;
  color: var(--el-color-primary);
}

/* 横向滚动列表 */
.thumbnail-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  scroll-behavior: smooth;
}

.thumbnail-list::-webkit-scrollbar {
  height: 4px;
}

.thumbnail-list::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 2px;
}

/* 单个缩略图项 */
.thumbnail-item {
  position: relative;
  flex-shrink: 0;
  height: 80px;
  min-width: 56px;
  max-width: 140px;
  border-radius: 6px;
  border: 2px solid transparent;
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    opacity 0.2s;
  background: var(--container-bg);
}

.thumbnail-item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.thumbnail-item.is-active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px rgba(var(--el-color-primary-rgb), 0.15);
}

.thumbnail-item.is-stale {
  opacity: 0.55;
}

.thumbnail-item.is-stale:hover {
  opacity: 0.8;
}

.thumbnail-item-img {
  height: 100%;
  width: 100%;
  display: block;
  object-fit: cover;
  object-position: top center;
}

.thumbnail-item-index {
  position: absolute;
  bottom: 2px;
  left: 4px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.2;
}

.thumbnail-item-stale-badge {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 9px;
  color: #fff;
  background: var(--el-color-warning);
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.2;
  white-space: nowrap;
}

.thumbnail-item-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0;
}

.thumbnail-item:hover .thumbnail-item-remove {
  opacity: 1;
}

.thumbnail-item-remove:hover {
  background: var(--el-color-danger);
}

.thumbnail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-color-secondary);
  text-align: center;
  width: 100%;
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

.status-stale-hint {
  color: var(--el-color-warning);
  margin-right: 4px;
}

.preview-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
</style>
