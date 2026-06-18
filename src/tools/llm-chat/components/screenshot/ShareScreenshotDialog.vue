<script setup lang="ts">
/**
 * 消息截图分享弹窗 — V3 离屏渲染 + 缩略图版。
 *
 * 布局:
 *   顶部 (Top): 消息范围选择 + 精细列表
 *   下方两栏 (Left + Right):
 *     - 左 (320px): 效果开关 / 布局覆盖 / 折叠策略 / 元素开关
 *     - 右 (Flex 1): 截图缩略图 + 操作按钮
 *
 * 关键设计 (V3 修复):
 *   - ScreenshotRenderer 不再以"可见 DOM 预览"形式挂在右栏,
 *     而是通过 <Teleport to="body"> 挂到 body 上, 用
 *     `position: fixed; left: -99999px` 推到视口之外 (真正离屏)。
 *     这样:
 *       a) 用户视觉上完全看不到 ScreenshotRenderer, 不会再出现
 *          "图片与 DOM 叠加显示" 的 bug;
 *       b) 不再有 v-show / v-if 切换的纠结, 离屏 renderer 由
 *          `v-if="localVisible && selectedMessages.length > 0"`
 *          直接控制挂载 / 卸载, 简洁干净;
 *       c) modern-screenshot 在离屏状态下照常工作 (已验证)。
 *   - 右栏只放一个**缩略图** (最大 360px 宽), 点击缩略图
 *     调用全局 useImageViewer 打开图片查看器放大预览,
 *     与 RichTextRendererTester / ScreenshotTester 行为一致。
 *   - 配置变化 (选择 / 布局 / 元素开关 / 折叠) 通过 useDebounceFn
 *     自动重新生成缩略图, 无需手动点击。
 *   - 主动重新生成按钮保留, 兜底 / 即时刷新用。
 *
 * 响应式: 宽度 < 900px 时下方栏自动垂直堆叠 (左在上, 右在下)。
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useDebounceFn } from "@vueuse/core";
import {
  Camera,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
} from "lucide-vue-next";
import {
  ElButton,
  ElCheckbox,
  ElIcon,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTooltip,
} from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ScreenshotRenderer from "./ScreenshotRenderer.vue";
import { type CollapseStrategy } from "./screenshotTypes";
import { useScreenshotGenerator } from "../../composables/features/useScreenshotGenerator";
import { useImageViewer } from "@/composables/useImageViewer";
import type { ChatMessageNode } from "../../types";
import type { ChatSessionIndex, ChatSessionDetail } from "../../types/session";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("ShareScreenshotDialog");
const imageViewer = useImageViewer();

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

// 与 <ScreenshotRenderer :width> 保持一致, 同步贯通到截图捕获
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
  return text.length > 60 ? `${text.slice(0, 60)}\u2026` : text;
}

// ----- 配置面板 -----
type LayoutModeChoice = "follow" | "card" | "bubble";
const layoutOverrides = ref<{
  mode: LayoutModeChoice;
  borderRadius: number | undefined;
  fontSize: number | undefined;
}>({
  mode: "follow",
  borderRadius: undefined,
  fontSize: undefined,
});

const collapseStrategy = ref<CollapseStrategy>("override-expand");

interface ElementToggles {
  showAvatar: boolean;
  showTimestamp: boolean;
  showTokenCount: boolean;
  showTokenCountForBlocks: boolean;
  showCharCount: boolean;
  showModelInfo: boolean;
  showPerformanceMetrics: boolean;
}

const elementToggles = ref<ElementToggles>({
  showAvatar: true,
  showTimestamp: true,
  showTokenCount: true,
  showTokenCountForBlocks: true,
  showCharCount: true,
  showModelInfo: true,
  showPerformanceMetrics: true,
});

// 关键: elementToggles 是对象 ref, Vue prop 比较是浅比较(===)。
// 直接修改 .value.xxx 不会改变对象引用, 导致 ScreenshotRenderer 收不到更新。
// 用 computed 返回浅拷贝, 确保每次属性变化都产生新引用, 强制子组件更新。
const elementTogglesSnapshot = computed<ElementToggles>(() => ({
  ...elementToggles.value,
}));

// ----- 离屏渲染器引用 -----
const rendererRef = ref<InstanceType<typeof ScreenshotRenderer> | null>(null);

function getMessageElements(): HTMLElement[] {
  return rendererRef.value?.getMessageElements() ?? [];
}

// ----- 截图生成 -----
const generating = ref(false);
const progress = ref({ done: 0, total: 0, currentLabel: "" });
const lastCanvas = ref<HTMLCanvasElement | null>(null);
const lastImageUrl = ref("");

// generationToken 用于在快速连续触发时丢弃过期结果,
// 防止旧 capture 完成时覆盖新 capture 的状态。
let generationToken = 0;

async function regenerateScreenshot() {
  if (selectedMessages.value.length === 0) {
    lastCanvas.value = null;
    lastImageUrl.value = "";
    return;
  }
  // 等待离屏 renderer 挂载并完成一帧布局
  await nextTick();
  await new Promise((r) => setTimeout(r, 100));

  const elements = getMessageElements();
  if (elements.length === 0) {
    customMessage.warning("未检测到可截图的消息节点");
    return;
  }

  const token = ++generationToken;
  generating.value = true;
  try {
    const result = await generator.generate({
      elements,
      width: SCREENSHOT_RENDER_WIDTH,
      options: { scale: 2, concurrency: 6 },
      onProgress: (done, total, label) => {
        if (token !== generationToken) return;
        progress.value = { done, total, currentLabel: label };
      },
    });
    if (token !== generationToken) {
      // 有更新的 capture 触发, 丢弃本次结果
      return;
    }
    lastCanvas.value = result.canvas;
    lastImageUrl.value = result.canvas.toDataURL("image/png");
  } catch (err) {
    if (token === generationToken) {
      logger.error("截图生成失败", { error: err });
    }
  } finally {
    if (token === generationToken) {
      generating.value = false;
    }
  }
}

// 防抖: 配置变化时延迟 500ms 再重生成, 避免滑动选择时疯狂触发
const debouncedRegenerate = useDebounceFn(regenerateScreenshot, 500);

function openImageViewer() {
  if (!lastImageUrl.value) return;
  imageViewer.show(lastImageUrl.value);
}

async function handleCopy() {
  if (!lastCanvas.value) {
    customMessage.warning("请先生成截图");
    return;
  }
  await generator.copyToClipboard(lastCanvas.value);
}

async function handleSave() {
  if (!lastCanvas.value) {
    customMessage.warning("请先生成截图");
    return;
  }
  await generator.saveToFile(lastCanvas.value, props.defaultFileName);
}

// 监听所有可能影响截图效果的配置, debounced 自动重新生成
watch(
  [
    () => Array.from(selectedIds.value),
    layoutOverrides,
    elementToggles,
    collapseStrategy,
  ],
  () => {
    if (!localVisible.value) return;
    debouncedRegenerate();
  },
  { deep: true }
);

// 打开对话框时立即生成一次, 关闭时清理大体积 data URL
watch(
  () => localVisible.value,
  (v) => {
    if (v) {
      regenerateScreenshot();
    } else {
      generationToken++; // 取消进行中的 capture
      generating.value = false;
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
            <div class="section-title">显示元素</div>
            <div class="switch-row">
              <el-switch v-model="elementToggles.showAvatar" />
              <span class="switch-label">显示头像</span>
            </div>
            <div class="switch-row">
              <el-switch v-model="elementToggles.showModelInfo" />
              <span class="switch-label">显示模型信息</span>
            </div>
            <div class="switch-row">
              <el-switch v-model="elementToggles.showTimestamp" />
              <span class="switch-label">显示时间戳</span>
            </div>
            <div class="switch-row">
              <el-switch v-model="elementToggles.showTokenCount" />
              <span class="switch-label">显示消息 Token 统计</span>
            </div>
            <div class="switch-row">
              <el-switch v-model="elementToggles.showTokenCountForBlocks" />
              <span class="switch-label">显示块级 Token 统计</span>
            </div>
            <div class="switch-row">
              <el-switch v-model="elementToggles.showCharCount" />
              <span class="switch-label">显示消息字数</span>
            </div>
            <div class="switch-row">
              <el-switch v-model="elementToggles.showPerformanceMetrics" />
              <span class="switch-label">显示性能指标</span>
            </div>
            <p class="section-hint">
              默认开启即跟随系统设置，关闭后对应元素在截图中隐藏。
            </p>
          </div>
        </section>

        <!-- 右: 缩略图 + 状态 -->
        <section class="right-panel">
          <div class="preview-toolbar">
            <span class="preview-stats">
              <Camera :size="14" />
              <template v-if="lastCanvas">
                {{ Math.round(lastCanvas.width / 2) }} ×
                {{ Math.round(lastCanvas.height / 2) }} px
              </template>
              <template v-else>{{ SCREENSHOT_RENDER_WIDTH }} × ? px</template>
            </span>
            <div class="preview-toolbar-actions">
              <el-button
                type="primary"
                size="small"
                :loading="generating"
                :disabled="selectedMessages.length === 0"
                @click="regenerateScreenshot"
              >
                重新生成
              </el-button>
            </div>
          </div>

          <div class="preview-thumbnail-area">
            <div v-if="generating" class="thumbnail-state">
              <el-icon :size="32" class="is-spinning">
                <Loader2 />
              </el-icon>
              <p class="thumbnail-state-title">正在生成截图…</p>
              <p class="thumbnail-state-progress">
                {{ progress.done }} / {{ progress.total }}
              </p>
            </div>
            <img
              v-else-if="lastImageUrl"
              :src="lastImageUrl"
              class="screenshot-thumbnail"
              alt="截图缩略图，点击查看大图"
              @click="openImageViewer"
            />
            <div v-else-if="selectedMessages.length === 0" class="thumbnail-state">
              <el-icon :size="32"><Eye /></el-icon>
              <p class="thumbnail-state-title">请选择至少一条消息</p>
            </div>
            <div v-else class="thumbnail-state">
              <el-icon :size="32"><Camera /></el-icon>
              <p class="thumbnail-state-title">等待生成截图</p>
              <p class="thumbnail-state-hint">点击右上角"重新生成"或修改左侧配置</p>
            </div>
          </div>

          <div class="preview-footer">
            <div class="preview-status">
              <template v-if="generating">
                正在生成… {{ progress.done }} / {{ progress.total }}
              </template>
              <template v-else-if="lastCanvas">
                已生成 ({{ Math.round(lastCanvas.width / 2) }} ×
                {{ Math.round(lastCanvas.height / 2) }} px,
                {{ selectedMessages.length }} 条消息)
              </template>
              <template v-else>等待生成截图</template>
            </div>
            <div class="preview-actions">
              <el-button
                :icon="Copy"
                size="small"
                :disabled="!lastCanvas"
                @click="handleCopy"
              >
                复制到剪贴板
              </el-button>
              <el-button
                type="primary"
                size="small"
                :icon="Download"
                :disabled="!lastCanvas"
                @click="handleSave"
              >
                保存图片
              </el-button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </BaseDialog>

  <!--
    离屏渲染区 (V3): ScreenshotRenderer 视觉上完全不可见,
    仅供 modern-screenshot 读取。
    关键点:
      - <Teleport to="body"> 把它从 BaseDialog 的变换容器中抽出来,
        避免 .base-dialog-container 的 transform: scale(...) 创建
        包含块, 让 position: fixed 真的相对视口。
      - position: fixed + 极大负 left/top, 推到视口外 99999px。
      - z-index: -1 + pointer-events: none, 双保险。
      - v-if 控制挂载: 仅在对话框打开且有选中消息时挂载, 节省资源。
      - aria-hidden="true" 避免屏幕阅读器误读。
  -->
  <Teleport to="body">
    <div
      v-if="localVisible && selectedMessages.length > 0"
      class="screenshot-offscreen-stage"
      aria-hidden="true"
    >
      <ScreenshotRenderer
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
        :element-toggles="elementTogglesSnapshot"
      />
    </div>
  </Teleport>
</template>
<style scoped>
.share-screenshot {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

/* ===== 顶部 ===== */
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

/* ===== 下方双栏 ===== */
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

/* ===== 左: 配置 ===== */
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
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  height: 28px;
}
.switch-label {
  font-size: 12px;
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

/* ===== 右: 缩略图 + 状态 ===== */
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
}

/* 缩略图容器: 居中显示截图缩略图, 背景与对比明显 */
.preview-thumbnail-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--container-bg);
  overflow: auto;
  min-height: 0;
}

.screenshot-thumbnail {
  /* 缩略图最大 360px 宽, 高度按比例自动缩放 */
  max-width: 360px;
  width: auto;
  height: auto;
  max-height: 100%;
  display: block;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  cursor: zoom-in;
  transition: transform 0.15s, box-shadow 0.15s;
}
.screenshot-thumbnail:hover {
  transform: scale(1.02);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

/* 占位 / 加载态 */
.thumbnail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-color-secondary);
  text-align: center;
}
.thumbnail-state-title {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary);
}
.thumbnail-state-progress {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-placeholder);
  font-variant-numeric: tabular-nums;
}
.thumbnail-state-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-color-placeholder);
}
.is-spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

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

/* ===== 离屏渲染 stage (Teleport 到 body) ===== */
/* 关键: 推到视口外 99999px, 用户完全看不到。
   * Teleport 把元素从 BaseDialog 的 transform 容器中抽出来,
   * position: fixed 才能真的相对视口定位。
   * 必须 display: block (不能用 display: none), 否则
   * getBoundingClientRect 返回 0, modern-screenshot 会截到 0 高度。
   */
.screenshot-offscreen-stage {
  position: fixed;
  top: 0;
  left: -99999px;
  width: 720px;
  z-index: -1;
  pointer-events: none;
  /* 不加 visibility/opacity, 避免子组件被浏览器跳过渲染或合成 */
}
.preview-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
</style>