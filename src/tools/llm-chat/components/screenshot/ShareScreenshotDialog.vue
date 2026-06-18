<!--
  消息截图分享弹窗 — 编排器 (V3 离屏渲染 + 缩略图版)。

  职责:
  - BaseDialog 外壳
  - 状态管理 (range / selectedIds / 布局覆盖 / 折叠 / 元素开关)
  - 防抖重新生成 + generator 编排
  - 离屏 <ScreenshotRenderer> 挂载 (Teleport 到 body)
  - 响应式布局 (宽窄屏切换)

  UI 拆分:
  - MessageRangePanel: 顶部 (范围 + 筛选 + 精细列表)
  - ScreenshotConfigPanel: 左下 (布局 + 折叠 + 元素开关)
  - ScreenshotPreviewPanel: 右下 (缩略图 + 工具栏 + 操作按钮)
-->
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
      <MessageRangePanel
        v-if="localVisible"
        :messages="messages"
        v-model:range="range"
        v-model:selected-ids="selectedIds"
      />

      <div class="bottom-row">
        <ScreenshotConfigPanel
          v-model:layout-overrides="layoutOverrides"
          v-model:collapse-strategy="collapseStrategy"
          v-model:element-toggles="elementToggles"
        />
        <ScreenshotPreviewPanel
          :last-image-url="lastImageUrl"
          :last-canvas="lastCanvas"
          :generating="generating"
          :progress="progress"
          :selected-count="selectedMessages.length"
          :width="SCREENSHOT_RENDER_WIDTH"
          @regenerate="regenerateScreenshot"
          @copy="handleCopy"
          @save="handleSave"
        />
      </div>
    </div>
  </BaseDialog>

  <!--
    离屏渲染区: ScreenshotRenderer 视觉上完全不可见,
    仅供 modern-screenshot 读取。
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
        :layout-overrides="layoutOverrides"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ScreenshotRenderer from "./ScreenshotRenderer.vue";
import MessageRangePanel from "./MessageRangePanel.vue";
import ScreenshotConfigPanel from "./ScreenshotConfigPanel.vue";
import ScreenshotPreviewPanel from "./ScreenshotPreviewPanel.vue";
import {
  type CollapseStrategy,
  type ElementToggles,
  type LayoutOverrides,
} from "./screenshotTypes";
import { useScreenshotGenerator } from "../../composables/features/useScreenshotGenerator";
import type { ChatMessageNode } from "../../types";
import type { ChatSessionIndex, ChatSessionDetail } from "../../types/session";
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

// 与 <ScreenshotRenderer :width> 保持一致, 同步贯通到截图捕获
const SCREENSHOT_RENDER_WIDTH = 720;

const generator = useScreenshotGenerator();

// ----- 状态: 选区 -----
const selectedIds = ref<Set<string>>(new Set());
const range = ref<[number, number]>([0, -1]);

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

const selectedMessages = computed(() =>
  props.messages.filter((m) => selectedIds.value.has(m.id))
);

// ----- 状态: 配置 -----
const layoutOverrides = ref<LayoutOverrides>({
  mode: "follow",
  borderRadius: undefined,
  fontSize: undefined,
});
const collapseStrategy = ref<CollapseStrategy>("override-expand");
const elementToggles = ref<ElementToggles>({
  showAvatar: true,
  showTimestamp: true,
  showTokenCount: true,
  showTokenCountForBlocks: true,
  showCharCount: true,
  showModelInfo: true,
  showPerformanceMetrics: true,
});

// 关键: elementToggles 是对象 ref, Vue prop 比较是浅比较 (===)。
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
      // 重置范围, 同步到 selectedIds
      range.value = getInitialRange();
      const [s, e] = range.value;
      selectedIds.value = new Set(
        props.messages.slice(s, e + 1).map((m) => m.id)
      );
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

<style scoped>
/* 上下结构 + 响应式双栏 */
.share-screenshot {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}
.bottom-row {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}
.share-screenshot.is-narrow .bottom-row {
  flex-direction: column;
}
/* 窄屏时, 面板组件内的 .left-panel 也要变 100% 宽 */
.share-screenshot.is-narrow :deep(.left-panel) {
  width: 100%;
  max-height: 280px;
}

/* 离屏 stage (Teleport 到 body) */
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
</style>
