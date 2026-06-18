<script setup lang="ts">
/**
 * 消息截图分享弹窗 — V2 单弹窗合并版。
 *
 * 布局:
 *   顶部 (Top): 消息范围选择 + 精细列表
 *   下方两栏 (Left + Right):
 *     - 左 (320px): 效果开关 / 布局覆盖 / 折叠策略 / 元素开关
 *     - 右 (Flex 1): ScreenshotRenderer 实时预览 + 缩放拖拽
 *
 * 响应式: 宽度 < 900px 时, 下栏自动垂直堆叠 (左在上, 右在下)。
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  Camera,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-vue-next";
import {
  ElButton,
  ElCheckbox,
  ElIcon,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSlider,
  ElTooltip,
} from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ScreenshotRenderer, {
  type CollapseStrategy,
} from "./ScreenshotRenderer.vue";
import { useScreenshotGenerator } from "../../composables/features/useScreenshotGenerator";
import type { ChatMessageNode } from "../../types";
import type { ChatSessionIndex, ChatSessionDetail } from "../../types/session";
import type { StitchOptions } from "../../utils/screenshotCapture";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("ShareScreenshotDialog");

interface Props {
  visible: boolean;
  messages: ChatMessageNode[];
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  initialFocusMessageId?: string;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  userRichTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  isSending?: boolean;
  defaultFileName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isSending: false,
});

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
}>();

const localVisible = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

// 与 <ScreenshotRenderer :width> 保持一致, 同步穿透到截图捕获
const SCREENSHOT_RENDER_WIDTH = 720;

const generator = useScreenshotGenerator();

// ----- 消息选择 -----
const selectedIds = ref<Set<string>>(new Set());

function getInitialRange(): [number, number] {
  const total = props.messages.length;
  if (total === 0) return [0, -1];
  if (props.initialFocusMessageId) {
    const idx = props.messages.findIndex(
      (m) => m.id === props.initialFocusMessageId
    );
    if (idx >= 0) {
      const start = Math.max(0, idx - 1);
      return [start, idx];
    }
  }
  return [Math.max(0, total - 2), total - 1];
}

const range = ref<[number, number]>(getInitialRange());

watch(
  () => props.visible,
  (v) => {
    if (v) {
      range.value = getInitialRange();
      const [s, e] = range.value;
      selectedIds.value = new Set(
        props.messages.slice(s, e + 1).map((m) => m.id)
      );
    }
  }
);

watch(range, ([s, e]) => {
  selectedIds.value = new Set(props.messages.slice(s, e + 1).map((m) => m.id));
});

const selectedMessages = computed(() =>
  props.messages.filter((m) => selectedIds.value.has(m.id))
);

const total = computed(() => props.messages.length);
const maxRange = computed(() => Math.max(0, total.value - 1));

function setQuickFilter(predicate: (m: ChatMessageNode) => boolean) {
  selectedIds.value = new Set(
    props.messages.filter(predicate).map((m) => m.id)
  );
}

function selectAll() {
  selectedIds.value = new Set(props.messages.map((m) => m.id));
}
function clearAll() {
  selectedIds.value = new Set();
}
function selectOnlyUser() {
  setQuickFilter((m) => m.role === "user");
}
function selectOnlyAssistant() {
  setQuickFilter((m) => m.role === "assistant" || m.role === "tool");
}

const fineListExpanded = ref(false);

function toggleMessageSelection(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function getMessageSummary(msg: ChatMessageNode): string {
  const text = (msg.content ?? "").replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

// ----- 配置面板 -----
const effects = ref({
  blurBackground: true,
  outerBorder: true,
  dropShadow: true,
  watermark: true,
});

type Nullable<T> = T | undefined;
type LayoutModeChoice = "follow" | "card" | "bubble";
type AvatarChoice = "follow" | "show" | "hide";
const layoutOverrides = ref<{
  mode: LayoutModeChoice;
  borderRadius: Nullable<number>;
  fontSize: Nullable<number>;
}>({
  mode: "follow",
  borderRadius: undefined,
  fontSize: undefined,
});

const collapseStrategy = ref<CollapseStrategy>("override-expand");

const elementToggles = ref<{
  showAvatar: AvatarChoice;
  showModelName: boolean;
  showTimestamp: boolean;
  showTokenStats: boolean;
}>({
  showAvatar: "follow",
  showModelName: true,
  showTimestamp: true,
  showTokenStats: true,
});

// ----- 预览渲染器引用 -----
const rendererRef = ref<InstanceType<typeof ScreenshotRenderer> | null>(null);

function getMessageElements(): HTMLElement[] {
  return rendererRef.value?.getMessageElements() ?? [];
}

// 缩放控制
const previewScale = ref(0.7);
const previewWrapperRef = ref<HTMLElement | null>(null);

function onPreviewWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  previewScale.value = Math.min(2, Math.max(0.3, previewScale.value + delta));
}

// 拖拽查看
const dragState = ref({
  active: false,
  startX: 0,
  startY: 0,
  scrollLeft: 0,
  scrollTop: 0,
});
function onPreviewMouseDown(e: MouseEvent) {
  const el = previewWrapperRef.value;
  if (!el) return;
  dragState.value = {
    active: true,
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: el.scrollLeft,
    scrollTop: el.scrollTop,
  };
  document.addEventListener("mousemove", onPreviewMouseMove);
  document.addEventListener("mouseup", onPreviewMouseUp);
}
function onPreviewMouseMove(e: MouseEvent) {
  if (!dragState.value.active) return;
  const el = previewWrapperRef.value;
  if (!el) return;
  el.scrollLeft =
    dragState.value.scrollLeft - (e.clientX - dragState.value.startX);
  el.scrollTop =
    dragState.value.scrollTop - (e.clientY - dragState.value.startY);
}
function onPreviewMouseUp() {
  dragState.value.active = false;
  document.removeEventListener("mousemove", onPreviewMouseMove);
  document.removeEventListener("mouseup", onPreviewMouseUp);
}

// ----- 截图生成 -----
const generating = ref(false);
const progress = ref({ done: 0, total: 0, currentLabel: "" });
const lastCanvas = ref<HTMLCanvasElement | null>(null);
const activeTab = ref<"dom" | "image">("dom");
const lastImageUrl = ref("");

function buildStitchOptions(): StitchOptions {
  return {
    scale: 2,
    effects: { ...effects.value },
    concurrency: 6,
  };
}

async function generateScreenshotImage() {
  if (selectedMessages.value.length === 0) {
    lastCanvas.value = null;
    lastImageUrl.value = "";
    return;
  }
  generating.value = true;
  try {
    await nextTick();
    await new Promise((r) => setTimeout(r, 150));
    const elements = getMessageElements();
    if (elements.length === 0) {
      customMessage.warning("未检测到可截图的消息节点");
      return;
    }
    const result = await generator.generate({
      elements,
      width: SCREENSHOT_RENDER_WIDTH,
      options: buildStitchOptions(),
      onProgress: (done, total, label) => {
        progress.value = { done, total, currentLabel: label };
      },
    });
    lastCanvas.value = result.canvas;
    lastImageUrl.value = result.canvas.toDataURL("image/png");
    activeTab.value = "image";
  } catch (err) {
    logger.error("截图生成失败", { error: err });
  } finally {
    generating.value = false;
  }
}

async function switchToImageTab() {
  activeTab.value = "image";
  if (!lastImageUrl.value && selectedMessages.value.length > 0) {
    await generateScreenshotImage();
  }
}

async function handleCopy() {
  if (selectedMessages.value.length === 0) {
    customMessage.warning("请先选择消息");
    return;
  }
  let canvas = lastCanvas.value;
  if (!canvas) {
    await generateScreenshotImage();
    canvas = lastCanvas.value;
  }
  if (canvas) {
    await generator.copyToClipboard(canvas);
  }
}

async function handleSave() {
  if (selectedMessages.value.length === 0) {
    customMessage.warning("请先选择消息");
    return;
  }
  let canvas = lastCanvas.value;
  if (!canvas) {
    await generateScreenshotImage();
    canvas = lastCanvas.value;
  }
  if (canvas) {
    await generator.saveToFile(canvas, props.defaultFileName);
  }
}

// 监听所有可能影响截图效果的配置，一旦变化则清空已生成的截图并切回 DOM 视图
watch(
  [
    () => Array.from(selectedIds.value),
    effects,
    layoutOverrides,
    elementToggles,
    collapseStrategy,
  ],
  () => {
    if (!localVisible.value) return;
    lastCanvas.value = null;
    lastImageUrl.value = "";
    activeTab.value = "dom";
  },
  { deep: true }
);

watch(
  () => localVisible.value,
  (v) => {
    if (v) {
      activeTab.value = "dom";
      lastCanvas.value = null;
      lastImageUrl.value = "";
    }
  }
);

// ----- 响应式 -----
const layoutWide = ref(true);
function updateLayoutMode() {
  layoutWide.value = window.innerWidth >= 900;
}
onMounted(() => {
  updateLayoutMode();
  window.addEventListener("resize", updateLayoutMode);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateLayoutMode);
});
</script>

<template>
  <BaseDialog
    v-model="localVisible"
    title="创建消息截图"
    width="1200px"
    height="85vh"
    :close-on-backdrop-click="true"
    :show-close-button="true"
  >
    <div class="share-screenshot" :class="{ 'is-narrow': !layoutWide }">
      <!-- 顶部: 消息选择 -->
      <section class="top-panel">
        <div class="range-row">
          <div class="range-label">消息范围</div>
          <el-slider
            v-model="range"
            range
            :min="0"
            :max="maxRange"
            :step="1"
            class="range-slider"
            :show-tooltip="true"
          />
          <div class="range-inputs">
            <el-input-number
              v-model="range[0]"
              :min="0"
              :max="range[1]"
              size="small"
              controls-position="right"
            />
            <span class="range-separator">至</span>
            <el-input-number
              v-model="range[1]"
              :min="range[0]"
              :max="maxRange"
              size="small"
              controls-position="right"
            />
            <span class="range-total">/ 共 {{ total }} 条</span>
          </div>
        </div>

        <div class="filter-row">
          <el-button size="small" @click="selectAll">全选</el-button>
          <el-button size="small" @click="clearAll">清空</el-button>
          <el-button size="small" @click="selectOnlyUser">仅用户</el-button>
          <el-button size="small" @click="selectOnlyAssistant"
            >仅助手</el-button
          >
          <div class="filter-spacer" />
          <span class="filter-count">
            已选 <strong>{{ selectedIds.size }}</strong> / {{ total }} 条
          </span>
          <el-button
            size="small"
            text
            @click="fineListExpanded = !fineListExpanded"
          >
            <el-icon>
              <component :is="fineListExpanded ? ChevronDown : ChevronRight" />
            </el-icon>
            精细列表
          </el-button>
        </div>

        <transition name="el-fade-in">
          <div v-if="fineListExpanded" class="fine-list">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="fine-list-item"
              :class="{ 'is-selected': selectedIds.has(msg.id) }"
              @click="toggleMessageSelection(msg.id)"
            >
              <el-checkbox
                :model-value="selectedIds.has(msg.id)"
                @click.stop="toggleMessageSelection(msg.id)"
              />
              <span class="fine-role" :class="`role-${msg.role}`">
                {{
                  msg.role === "user"
                    ? "用户"
                    : msg.role === "assistant"
                      ? "助手"
                      : msg.role === "tool"
                        ? "工具"
                        : "系统"
                }}
              </span>
              <el-tooltip
                :content="msg.content"
                placement="top"
                :show-after="500"
              >
                <span class="fine-summary">{{ getMessageSummary(msg) }}</span>
              </el-tooltip>
            </div>
          </div>
        </transition>
      </section>

      <!-- 下方双栏 -->
      <div class="bottom-row">
        <!-- 左: 配置 -->
        <section class="left-panel">
          <div class="config-section">
            <div class="section-title">效果开关</div>
            <el-checkbox v-model="effects.blurBackground"
              >还原模糊背景</el-checkbox
            >
            <el-checkbox v-model="effects.outerBorder"
              >显示卡片外边框</el-checkbox
            >
            <el-checkbox v-model="effects.dropShadow">开启卡片投影</el-checkbox>
            <el-checkbox v-model="effects.watermark">附加极简水印</el-checkbox>
          </div>

          <div class="config-section">
            <div class="section-title">布局覆盖</div>
            <div class="config-row">
              <span class="config-label">布局模式</span>
              <el-select
                v-model="layoutOverrides.mode"
                placeholder="选择"
                size="small"
                style="width: 160px"
              >
                <el-option label="跟随系统" value="follow" />
                <el-option label="卡片模式" value="card" />
                <el-option label="气泡模式" value="bubble" />
              </el-select>
            </div>
            <div class="config-row">
              <span class="config-label">气泡圆角</span>
              <el-input-number
                v-model="layoutOverrides.borderRadius"
                placeholder="跟随系统"
                :min="0"
                :max="32"
                size="small"
                controls-position="right"
                style="width: 120px"
              />
              <span class="config-hint">px</span>
            </div>
            <div class="config-row">
              <span class="config-label">字体大小</span>
              <el-input-number
                v-model="layoutOverrides.fontSize"
                placeholder="跟随系统"
                :min="10"
                :max="24"
                size="small"
                controls-position="right"
                style="width: 120px"
              />
              <span class="config-hint">px</span>
            </div>
          </div>

          <div class="config-section">
            <div class="section-title">折叠策略</div>
            <el-select
              v-model="collapseStrategy"
              size="small"
              style="width: 100%"
            >
              <el-option label="强制展开" value="override-expand" />
              <el-option label="强制收起" value="override-collapse" />
              <el-option label="跟随配置" value="config" />
              <el-option label="维持现状" value="preserve" />
            </el-select>
            <p class="section-hint">决定工具调用节点在截图中是展开还是收起。</p>
          </div>

          <div class="config-section">
            <div class="section-title">卡片元素</div>
            <div class="config-row">
              <span class="config-label">显示头像</span>
              <el-select
                v-model="elementToggles.showAvatar"
                placeholder="选择"
                size="small"
                style="width: 120px"
              >
                <el-option label="跟随系统" value="follow" />
                <el-option label="显示" value="show" />
                <el-option label="隐藏" value="hide" />
              </el-select>
            </div>
            <el-checkbox v-model="elementToggles.showModelName"
              >显示模型名称</el-checkbox
            >
            <el-checkbox v-model="elementToggles.showTimestamp"
              >显示时间戳</el-checkbox
            >
            <el-checkbox v-model="elementToggles.showTokenStats"
              >显示 Token 统计</el-checkbox
            >
          </div>
        </section>

        <!-- 右: 预览 -->
        <section class="right-panel">
          <div class="preview-toolbar">
            <div class="preview-tabs">
              <button
                type="button"
                class="tab-btn"
                :class="{ active: activeTab === 'dom' }"
                @click="activeTab = 'dom'"
              >
                实时排版 (DOM)
              </button>
              <button
                type="button"
                class="tab-btn"
                :class="{ active: activeTab === 'image' }"
                @click="switchToImageTab"
              >
                截图效果 (图片)
              </button>
            </div>
            <span class="preview-stats">
              <Camera :size="14" />
              缩放 {{ Math.round(previewScale * 100) }}%
            </span>
            <div class="preview-toolbar-actions">
              <el-button
                size="small"
                @click="previewScale = Math.max(0.3, previewScale - 0.1)"
              >
                缩小
              </el-button>
              <el-button
                size="small"
                @click="previewScale = Math.min(2, previewScale + 0.1)"
              >
                放大
              </el-button>
              <el-button size="small" @click="previewScale = 1">100%</el-button>
              <el-button
                type="primary"
                size="small"
                @click="generateScreenshotImage"
                :loading="generating"
              >
                生成截图
              </el-button>
            </div>
          </div>
          <div
            ref="previewWrapperRef"
            class="preview-wrapper"
            @wheel="onPreviewWheel"
            @mousedown="onPreviewMouseDown"
          >
            <div class="preview-stage">
              <div
                class="preview-canvas-frame"
                :style="{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top center',
                }"
              >
                <!-- DOM 实时排版 -->
                <ScreenshotRenderer
                  v-show="activeTab === 'dom' && selectedMessages.length > 0"
                  ref="rendererRef"
                  :messages="selectedMessages"
                  :session-index="sessionIndex"
                  :session-detail="sessionDetail"
                  :is-sending="isSending"
                  :llm-think-rules="llmThinkRules"
                  :rich-text-style-options="richTextStyleOptions"
                  :user-rich-text-style-options="userRichTextStyleOptions"
                  :collapse-strategy="collapseStrategy"
                  :width="SCREENSHOT_RENDER_WIDTH"
                />

                <!-- 截图效果图片 -->
                <div
                  v-show="activeTab === 'image' && selectedMessages.length > 0"
                  class="image-preview-container"
                >
                  <img
                    v-if="lastImageUrl"
                    :src="lastImageUrl"
                    class="screenshot-img"
                    alt="截图预览"
                  />
                  <div v-else class="image-preview-placeholder">
                    <p>尚未生成截图效果，请点击“生成截图”</p>
                  </div>
                </div>

                <div v-if="selectedMessages.length === 0" class="preview-empty">
                  <Eye :size="32" />
                  <p>请选择至少一条消息以生成预览</p>
                </div>
              </div>
            </div>
          </div>
          <div class="preview-footer">
            <div class="preview-progress">
              <template v-if="generating">
                正在生成截图... {{ progress.done }} / {{ progress.total }}
              </template>
              <template v-else-if="lastCanvas">
                已生成截图 ({{ Math.round(lastCanvas.width / 2) }} ×
                {{ Math.round(lastCanvas.height / 2) }} px)
              </template>
              <template v-else>等待生成截图</template>
            </div>
            <div class="preview-actions">
              <el-button :icon="Copy" @click="handleCopy">
                复制到剪贴板
              </el-button>
              <el-button type="primary" :icon="Download" @click="handleSave">
                保存图片
              </el-button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.share-screenshot {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

/* 顶部 */
.top-panel {
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  background: var(--card-bg);
}
.range-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.range-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.range-slider {
  flex: 1;
  min-width: 200px;
}
.range-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}
.range-separator {
  color: var(--text-color-secondary);
  font-size: 12px;
}
.range-total {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-left: 4px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.filter-spacer {
  flex: 1;
}
.filter-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}
.filter-count strong {
  color: var(--primary-color);
  font-weight: 600;
  margin: 0 2px;
}

.fine-list {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
  padding-top: 8px;
}
.fine-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}
.fine-list-item:hover {
  background: var(--input-bg);
}
.fine-list-item.is-selected {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}
.fine-role {
  font-weight: 500;
  white-space: nowrap;
}
.fine-role.role-user {
  color: var(--primary-color);
}
.fine-role.role-assistant {
  color: var(--success-color);
}
.fine-role.role-tool {
  color: var(--warning-color);
}
.fine-role.role-system {
  color: var(--info-color);
}
.fine-summary {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color-secondary);
}

/* 下方双栏 */
.bottom-row {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}
.left-panel {
  width: 320px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  overflow: hidden;
  overflow-y: auto;
}
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  overflow: hidden;
  min-width: 0;
}

/* 响应式 */
.share-screenshot.is-narrow .bottom-row {
  flex-direction: column;
}
.share-screenshot.is-narrow .left-panel {
  width: 100%;
  max-height: 280px;
}

/* 配置区 */
.config-section {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}
.config-section:last-child {
  border-bottom: none;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-color-primary);
}
.section-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}
.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.config-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  min-width: 70px;
}
.config-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
}
:deep(.config-section .el-checkbox) {
  display: flex;
  margin-bottom: 6px;
  height: auto;
}
:deep(.config-section .el-checkbox + .el-checkbox) {
  margin-top: 2px;
}

/* 预览 */
.preview-tabs {
  display: flex;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 2px;
}
.tab-btn {
  background: transparent;
  border: none;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-btn:hover {
  color: var(--text-color-primary);
}
.tab-btn.active {
  background: var(--card-bg);
  color: var(--primary-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

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
}
.preview-toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.preview-wrapper {
  flex: 1;
  overflow: auto;
  padding: 16px;
  background: var(--container-bg);
  cursor: grab;
  user-select: none;
}
.preview-wrapper:active {
  cursor: grabbing;
}
.preview-stage {
  display: flex;
  justify-content: center;
  min-width: 100%;
}
.preview-canvas-frame {
  /* 实际宽度由 ScreenshotRenderer 内部 720px 决定, 这里只做 transform 缩放 */
  display: inline-block;
}
.image-preview-container {
  width: 720px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}
.screenshot-img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.image-preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--text-color-secondary);
  width: 100%;
  box-sizing: border-box;
}

.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--text-color-secondary);
  gap: 8px;
  width: 720px;
  box-sizing: border-box;
}
.preview-empty p {
  margin: 0;
  font-size: 13px;
}

.preview-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.preview-progress {
  font-size: 12px;
  color: var(--text-color-secondary);
}
.preview-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
</style>
