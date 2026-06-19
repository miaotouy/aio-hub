<!--
  消息截图分享弹窗 — 编排器 (V3 重构版)

  V3 设计变化:
  - 移除 Teleport 离屏渲染: ScreenshotRenderer 现在直接挂在 ScreenshotPreviewPanel 里
    既是实时预览源, 也是截图源, 100% 一致
  - 移除自动重新生成:
    * 不再在打开时自动 regenerateScreenshot()
    * 不再有 useDebounceFn 配置变化监听
  - 配置 / 选区变化时, 只清空已生成的 lastCanvas / lastImageUrl,
    让"复制/保存"按钮自动禁用, 提示用户"配置已更改, 请重新生成"

  UI 拆分:
  - MessageRangePanel: 顶部 (范围 + 筛选 + 精细列表)
  - ScreenshotConfigPanel: 左下 (布局 + 渲染尺寸 + 折叠 + 元素开关)
  - ScreenshotPreviewPanel: 右下 (DOM 实时预览 + 缩略图小容器 + 操作按钮)
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
          v-model:render-options="renderOptions"
        />
        <ScreenshotPreviewPanel
          ref="previewPanelRef"
          :messages="selectedMessages"
          :session-index="sessionIndex"
          :session-detail="sessionDetail"
          :is-sending="isSending"
          :llm-think-rules="llmThinkRules"
          :rich-text-style-options="richTextStyleOptions"
          :user-rich-text-style-options="userRichTextStyleOptions"
          :collapse-strategy="collapseStrategy"
          :width="renderOptions.width"
          :element-toggles="elementTogglesSnapshot"
          :layout-overrides="layoutOverrides"
          :bg-config="renderOptions.bgConfig"
          :gap="renderOptions.gap"
          :padding="renderOptions.padding"
          :enable-decoration="renderOptions.enableDecoration"
          :last-image-url="lastImageUrl"
          :last-canvas="lastCanvas"
          :generating="generating"
          :progress="progress"
          :selected-count="selectedMessages.length"
          @regenerate="regenerateScreenshot"
          @copy="handleCopy"
          @save="handleSave"
        />
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ScreenshotPreviewPanel from "./ScreenshotPreviewPanel.vue";
import MessageRangePanel from "./MessageRangePanel.vue";
import ScreenshotConfigPanel from "./ScreenshotConfigPanel.vue";
import {
  CAPTURE_SCALE_DEFAULT,
  RENDER_WIDTH_DEFAULT,
  RENDER_WIDTH_MAX,
  RENDER_WIDTH_MIN,
  RENDER_WIDTH_MODE_DEFAULT,
  SCREENSHOT_BG_CONFIG_DEFAULT,
  SCREENSHOT_DECORATION_DEFAULT,
  SCREENSHOT_GAP_DEFAULT,
  SCREENSHOT_PADDING_DEFAULT,
  type CollapseStrategy,
  type ElementToggles,
  type LayoutOverrides,
  type ScreenshotRenderOptions,
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
  /** 实时获取消息区当前宽度 (CSS px), 用于 auto 模式快照。空时回退到 RENDER_WIDTH_DEFAULT。 */
  getMessageAreaWidth?: () => number;
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
const collapseStrategy = ref<CollapseStrategy>("preserve");
const elementToggles = ref<ElementToggles>({
  showAvatar: true,
  showTimestamp: true,
  showTokenCount: true,
  showTokenCountForBlocks: true,
  showCharCount: true,
  showModelInfo: true,
  showPerformanceMetrics: true,
});
// 渲染尺寸 + 输出精度 + 背景与间距, 真正影响最终 PNG 的尺寸与外观
const renderOptions = ref<ScreenshotRenderOptions>({
  width: RENDER_WIDTH_DEFAULT,
  widthMode: RENDER_WIDTH_MODE_DEFAULT,
  scale: CAPTURE_SCALE_DEFAULT,
  bgConfig: { ...SCREENSHOT_BG_CONFIG_DEFAULT },
  gap: SCREENSHOT_GAP_DEFAULT,
  padding: SCREENSHOT_PADDING_DEFAULT,
  enableDecoration: SCREENSHOT_DECORATION_DEFAULT,
});

// 关键: elementToggles 是对象 ref, Vue prop 比较是浅比较 (===)。
// 直接修改 .value.xxx 不会改变对象引用, 导致子组件收不到更新。
// 用 computed 返回浅拷贝, 确保每次属性变化都产生新引用, 强制子组件更新。
const elementTogglesSnapshot = computed<ElementToggles>(() => ({
  ...elementToggles.value,
}));

// ----- 预览面板引用 (从子组件拿消息元素) -----
const previewPanelRef = ref<InstanceType<typeof ScreenshotPreviewPanel> | null>(
  null
);

function getMessageElements(): HTMLElement[] {
  return previewPanelRef.value?.getMessageElements() ?? [];
}

// ----- 截图生成 -----
const generating = ref(false);
const progress = ref({ done: 0, total: 0, currentLabel: "" });
const lastCanvas = ref<HTMLCanvasElement | null>(null);
const lastImageUrl = ref("");

// generationToken 用于在快速连续触发时丢弃过期结果,
// 防止旧 capture 完成时覆盖新 capture 的状态。
let generationToken = 0;

/**
 * 手动触发生成截图。只有用户点击"生成截图"按钮时才调用此函数。
 *
 * 配置 / 选区 / 渲染尺寸变化时, watch 会清空 lastCanvas / lastImageUrl,
 * 让复制/保存按钮自动禁用, 提示用户"配置已更改, 请重新生成"。
 */
async function regenerateScreenshot() {
  if (selectedMessages.value.length === 0) {
    lastCanvas.value = null;
    lastImageUrl.value = "";
    return;
  }

  // 等待预览面板中的 ScreenshotRenderer 挂载并完成一帧布局
  await new Promise((r) => setTimeout(r, 100));

  const elements = getMessageElements();
  if (elements.length === 0) {
    customMessage.warning("未检测到可截图的消息节点");
    return;
  }

  const token = ++generationToken;
  generating.value = true;
  try {
    // 解析自动 gap: undefined 时按布局模式取默认值 (卡片 8px, 气泡 12px)
    const resolvedGap =
      renderOptions.value.gap ??
      (layoutOverrides.value.mode === "bubble" ? 12 : 8);

    const result = await generator.generate({
      elements,
      width: renderOptions.value.width,
      options: {
        scale: renderOptions.value.scale,
        concurrency: 6,
        bgConfig: renderOptions.value.bgConfig,
        gap: resolvedGap,
        padding: renderOptions.value.padding,
        enableDecoration: renderOptions.value.enableDecoration,
      },
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

/**
 * 关键: 配置 / 选区 / 渲染尺寸变化时, 仅清空已生成结果, 不触发生成。
 *
 * 用户在右侧预览面板已经看到实时 DOM 预览, 调整后视觉立即生效;
 * 想保存图片时, 手动点击"生成截图"即可。
 */
watch(
  [
    () => Array.from(selectedIds.value),
    layoutOverrides,
    elementToggles,
    collapseStrategy,
    renderOptions,
  ],
  () => {
    lastCanvas.value = null;
    lastImageUrl.value = "";
  },
  { deep: true }
);

// 打开/关闭对话框: 不再自动 regenerate, 只重置选区与生成 token。
watch(
  () => localVisible.value,
  (v) => {
    if (v) {
      range.value = getInitialRange();
      const [s, e] = range.value;
      selectedIds.value = new Set(
        props.messages.slice(s, e + 1).map((m) => m.id)
      );
      // 清空生成结果, 一切从"未生成"开始
      lastCanvas.value = null;
      lastImageUrl.value = "";
      // auto 模式: 按当前消息区宽度快照 (向下取整, clamp 到 [MIN, MAX])
      if (renderOptions.value.widthMode === "auto") {
        const raw = props.getMessageAreaWidth?.() ?? 0;
        if (raw > 0) {
          const sampled = Math.min(
            RENDER_WIDTH_MAX,
            Math.max(RENDER_WIDTH_MIN, Math.floor(raw))
          );
          if (sampled !== renderOptions.value.width) {
            renderOptions.value = { ...renderOptions.value, width: sampled };
          }
        }
      }
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
</style>

