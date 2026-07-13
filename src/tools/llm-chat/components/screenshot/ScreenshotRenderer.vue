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

<script setup lang="ts">
import { computed, provide, ref } from "vue";
import type { ChatMessageNode } from "../../types";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types/session";
import { useMessageLayout } from "../../composables/ui/useMessageLayout";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import ChatMessage from "../message/ChatMessage.vue";
import CompressionMessage from "../message/CompressionMessage.vue";
import ToolCallMessage from "../message/ToolCallMessage.vue";
import MessageExternalAvatar from "../message/MessageExternalAvatar.vue";
import MessageHeader from "../message/MessageHeader.vue";
import {
  type CollapseStrategy,
  type LayoutOverrides,
  type ScreenshotBgConfig,
  type ScreenshotBrandConfig,
  type ScreenshotElementOverrides,
  type ScreenshotWatermarkConfig,
  type WallpaperMode,
  SCREENSHOT_BRAND_DEFAULT,
  SCREENSHOT_OVERRIDES_KEY,
} from "./screenshotTypes";
import ScreenshotBrandStrip from "./ScreenshotBrandStrip.vue";

const DEFAULT_OVERRIDES: ScreenshotElementOverrides = {
  showAvatar: true,
  showTimestamp: true,
  showTokenCount: true,
  showTokenCountForBlocks: true,
  showCharCount: true,
  showModelInfo: true,
  showPerformanceMetrics: true,
};
interface Props {
  messages: ChatMessageNode[];
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  isSending?: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  userRichTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  /** 折叠策略, 默认 preserve (维持当前状态, 由主列表提供) */
  collapseStrategy?: CollapseStrategy;
  /** 渲染宽度 (CSS px), 默认 720 */
  width?: number;
  /** 元素显示覆盖, 控制截图中各元素的可见性 */
  elementToggles?: ScreenshotElementOverrides;
  /** 临时布局覆盖 (与系统设置合并, 不修改系统设置) */
  layoutOverrides?: LayoutOverrides;
  /** V4: 背景配置 */
  bgConfig?: ScreenshotBgConfig;
  /** V4: 消息间距 (px), undefined = 跟随模式自动 */
  gap?: number;
  /** V4: 四周留白 (px) */
  padding?: number;
  /** V4: 是否启用卡片装饰 */
  enableDecoration?: boolean;
  /** V5: 水印配置 */
  watermark?: ScreenshotWatermarkConfig;
  /** V5: 品牌标识 (头/脚) 配置 */
  brand?: ScreenshotBrandConfig;
}

const props = withDefaults(defineProps<Props>(), {
  isSending: false,
  collapseStrategy: "config",
  width: 720,
  padding: 0,
  enableDecoration: false,
});

const store = useLlmChatStore();
const { settings } = useChatSettings();

const screenshotMode = ref(true);
provide("screenshotMode", screenshotMode);
provide(
  "screenshotCollapseStrategy",
  computed(() => props.collapseStrategy)
);

// ----- 元素覆盖: 将 elementToggles provide 给子组件 -----
const elementOverrides = computed<ScreenshotElementOverrides>(
  () => props.elementToggles ?? DEFAULT_OVERRIDES
);
provide(SCREENSHOT_OVERRIDES_KEY, elementOverrides);

const {
  compressedNodeIds,
  getMessageLayout,
  getMessageSiblings,
  bubbleLayout,
  bubbleLayoutVars,
  isBubbleMode,
  avatarPlacement,
  headerPlacement,
  showAvatar: layoutShowAvatar,
  shouldHideHeaderAvatar,
  shouldUseOutsideHeader,
} = useMessageLayout({
  messages: computed(() => props.messages),
  settings,
  getSiblings: (id) => store.getSiblings(id),
  isNodeInActivePath: (id) => store.isNodeInActivePath(id),
  layoutOverrides: () => props.layoutOverrides,
});

// 覆盖 showAvatar: 当 elementToggles.showAvatar 为 false 时强制隐藏头像
const showAvatar = computed(
  () => elementOverrides.value.showAvatar && layoutShowAvatar.value
);

// 覆盖 shouldHideHeaderAvatar: 当 elementToggles.showAvatar 为 false 时强制隐藏 header 内头像
const screenshotHideHeaderAvatar = computed(() => {
  if (!elementOverrides.value.showAvatar) return true;
  return shouldHideHeaderAvatar.value;
});

// ----- CSS 类: 根据 elementToggles 生成隐藏类 -----
const elementHideClasses = computed(() => {
  const o = elementOverrides.value;
  const classes: string[] = [];
  if (!o.showTimestamp) classes.push("hide-timestamp");
  if (!o.showModelInfo) classes.push("hide-model-info");
  if (!o.showPerformanceMetrics) classes.push("hide-performance");
  if (!o.showTokenCount) classes.push("hide-token-count");
  if (!o.showCharCount) classes.push("hide-char-count");
  if (!o.showAvatar) classes.push("hide-avatar");
  return classes;
});

// ----- 字体大小覆盖: 转为 CSS 变量 --message-font-size -----
// 仅当 layoutOverrides.fontSize 是有效数字时设置, 否则不输出 (回退到子组件 v-bind 读取系统设置)
const messageFontSizeStyle = computed<Record<string, string>>(() => {
  const fs = props.layoutOverrides?.fontSize;
  if (typeof fs !== "number" || !Number.isFinite(fs) || fs <= 0)
    return {} as Record<string, string>;
  return { "--message-font-size": `${fs}px` };
});

// 获取当前主题的不透明背景色
function getThemeBgColor(): string {
  const themeBg = getComputedStyle(document.documentElement)
    .getPropertyValue("--container-bg")
    .trim();
  if (!themeBg) return "#ffffff";
  const match = themeBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
  }
  return themeBg;
}

// ----- V5: 壁纸平铺方式 → CSS 变量 -----
// cover / contain / tile / stretch 四种模式在预览端的实现:
// - cover / contain: background-size: cover / contain
// - tile: background-size: auto (浏览器使用图像自然尺寸) + background-repeat: repeat
// - stretch: background-size: 100% 100% + background-repeat: no-repeat
function wallpaperStyleVars(mode: WallpaperMode | undefined): {
  size: string;
  repeat: string;
} {
  switch (mode) {
    case "contain":
      return { size: "contain", repeat: "no-repeat" };
    case "tile":
      return { size: "auto", repeat: "repeat" };
    case "stretch":
      return { size: "100% 100%", repeat: "no-repeat" };
    case "cover":
    default:
      return { size: "cover", repeat: "no-repeat" };
  }
}

// ----- V4: 背景 / 间距 / 留白 / 装饰 CSS 变量 -----
const v4StyleVars = computed<Record<string, string>>(() => {
  const vars: Record<string, string> = {};

  // 截图模式下，放宽气泡最大宽度百分比限制，避免在窄容器（如 720px）中气泡被无故压缩导致换行
  // 默认放宽到 85%，如果系统设置比 85% 更宽松则沿用系统设置
  const sysPercent =
    parseFloat(bubbleLayoutVars.value["--bubble-max-width-percent"]) || 75;
  vars["--bubble-max-width-percent"] = `${Math.max(85, sysPercent)}%`;

  // 间距: 如果 gap 是数字则使用, 否则不设 (让 CSS 默认值生效)
  if (typeof props.gap === "number" && Number.isFinite(props.gap)) {
    vars["--screenshot-gap"] = `${props.gap}px`;
  }

  // 留白
  if (typeof props.padding === "number" && props.padding > 0) {
    vars["--screenshot-padding"] = `${props.padding}px`;
  } else {
    vars["--screenshot-padding"] = "0px";
  }

  // 背景
  if (props.bgConfig) {
    const themeBgColor = getThemeBgColor();
    const themeBgRaw = getComputedStyle(document.documentElement)
      .getPropertyValue("--container-bg")
      .trim();

    switch (props.bgConfig.type) {
      case "solid":
        vars["--screenshot-bg"] = props.bgConfig.color || themeBgColor;
        vars["--screenshot-mask"] = "transparent";
        break;
      case "theme": {
        // 跟随主题模式：
        // 1. 底色设为当前主题不透明背景色
        vars["--screenshot-bg"] = themeBgColor;

        // 2. 如果系统当前有壁纸，也需要跟随壁纸！
        const wallpaperUrl = getComputedStyle(document.documentElement)
          .getPropertyValue("--wallpaper-url")
          .trim();
        const wallpaperOpacity = getComputedStyle(document.documentElement)
          .getPropertyValue("--wallpaper-opacity")
          .trim();

        if (wallpaperUrl && wallpaperUrl !== "none") {
          vars["--screenshot-wallpaper"] = wallpaperUrl;
          vars["--screenshot-wallpaper-opacity"] = wallpaperOpacity || "1";
          // 3. 叠加半透明主题色蒙层，保证文字可读性
          vars["--screenshot-mask"] = themeBgRaw || "transparent";
        } else {
          vars["--screenshot-mask"] = "transparent";
        }
        break;
      }
      case "wallpaper": {
        // 应用壁纸模式：
        // 1. 底色使用当前主题的不透明背景色，而不是硬编码的白色！
        vars["--screenshot-bg"] = themeBgColor;

        // 2. 读取系统壁纸 URL，并应用用户设置的不透明度
        const wallpaperUrl = getComputedStyle(document.documentElement)
          .getPropertyValue("--wallpaper-url")
          .trim();
        if (wallpaperUrl && wallpaperUrl !== "none") {
          vars["--screenshot-wallpaper"] = wallpaperUrl;
          vars["--screenshot-wallpaper-opacity"] = String(
            props.bgConfig.wallpaperOpacity ?? 0.6
          );
          // 3. 叠加半透明主题色蒙层，保证文字可读性
          vars["--screenshot-mask"] = themeBgRaw || "transparent";
        } else {
          vars["--screenshot-mask"] = "transparent";
        }
        break;
      }
    }

    // V5: 壁纸平铺方式 (cover/contain/tile/stretch) — 作用于 ::before 伪元素
    const { size, repeat } = wallpaperStyleVars(props.bgConfig.wallpaperMode);
    vars["--screenshot-wallpaper-size"] = size;
    vars["--screenshot-wallpaper-repeat"] = repeat;
  }

  return vars;
});

// ----- V5: 水印层 (实时预览用) -----
// 在前端用微型 Canvas 绘制单个水印 tile, 转成 data URL 作为背景, 配合 background-repeat 平铺。
// 这样既避免在每个 .message-slot 节点上重复创建 <canvas>, 又能与 export 端 createPattern
// 算法共享同一组参数, 达到所见即所得。
const watermarkStyle = computed<Record<string, string>>(() => {
  const wm = props.watermark;
  if (!wm || !wm.enable || !wm.text) {
    return { display: "none" } as Record<string, string>;
  }

  const tile = makeWatermarkTile(wm);
  if (!tile) return { display: "none" } as Record<string, string>;

  return {
    display: "block",
    "background-image": `url("${tile}")`,
    "background-repeat": "repeat",
  } as Record<string, string>;
});

/**
 * 在一个略大于单字宽度的小画布上绘制单个水印文字 (按角度旋转),
 * 返回 data URL。后续配合 background-repeat 即可在 .screenshot-watermark-layer 上平铺。
 */
function makeWatermarkTile(wm: ScreenshotWatermarkConfig): string | null {
  if (typeof document === "undefined") return null;
  try {
    // 估算一个安全的画布尺寸: 文字宽度 + 上下 padding, 再加上 gap 的视觉余量
    const padding = 16;
    const textW = Math.max(80, wm.text.length * wm.fontSize * 0.7);
    const tileW = Math.ceil(textW + padding * 2 + wm.gap);
    const tileH = Math.ceil(wm.fontSize * 2 + padding * 2 + wm.gap);

    const canvas = document.createElement("canvas");
    canvas.width = tileW;
    canvas.height = tileH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, tileW, tileH);
    ctx.fillStyle = wm.color;
    ctx.font = `${wm.fontSize}px var(--app-font-family, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif)`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 旋转绘制, 中心点放在画布中心 (留出 gap, 让相邻 tile 之间有空隙)
    ctx.translate(tileW / 2, tileH / 2);
    ctx.rotate((wm.angle * Math.PI) / 180);
    ctx.fillText(wm.text, 0, 0);

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// ----- V5: 品牌标识 (头/脚) 可见性 -----
const showBrandHeader = computed(
  () => props.brand?.show === "top" || props.brand?.show === "both"
);
const showBrandFooter = computed(
  () => props.brand?.show === "bottom" || props.brand?.show === "both"
);

const resolvedBrand = computed(() => props.brand ?? SCREENSHOT_BRAND_DEFAULT);

const rootRef = ref<HTMLElement | null>(null);
const brandHeaderRef = ref<HTMLElement | null>(null);
const brandFooterRef = ref<HTMLElement | null>(null);

/**
 * 暴露给外部截图工具: 收集所有可截图的消息节点 + 品牌头/脚节点。
 *
 * 品牌节点本身不在 .messages-container 内 (以免污染消息流布局),
 * 因此不会出现在 querySelectorAll(".message-slot") 结果中,
 * 需要手动 prepend / append。captureMessagesAndStitch 会按顺序拼接到长图两端。
 */
function getMessageElements(): HTMLElement[] {
  const root = rootRef.value;
  if (!root) return [];
  const slots = Array.from(root.querySelectorAll<HTMLElement>(".message-slot"));
  const out: HTMLElement[] = [];
  if (showBrandHeader.value && brandHeaderRef.value) {
    out.push(brandHeaderRef.value);
  }
  out.push(...slots);
  if (showBrandFooter.value && brandFooterRef.value) {
    out.push(brandFooterRef.value);
  }
  return out;
}

defineExpose({
  getMessageElements,
  rootRef,
});
</script>

<template>
  <div
    ref="rootRef"
    class="screenshot-renderer"
    :class="[
      'screenshot-mode',
      `mode-${bubbleLayout.mode}`,
      { 'has-decoration': props.enableDecoration },
      ...elementHideClasses,
    ]"
    :style="{
      ...bubbleLayoutVars,
      ...messageFontSizeStyle,
      ...v4StyleVars,
      '--screenshot-width': `${props.width}px`,
    }"
  >
    <!-- V5: 顶部品牌标识 -->
    <ScreenshotBrandStrip
      v-if="showBrandHeader"
      ref="brandHeaderRef"
      :brand="resolvedBrand"
      :session-index="sessionIndex"
      :session-detail="sessionDetail"
      :messages="messages"
      position="top"
      class="screenshot-brand-header"
    />

    <div
      class="messages-container"
      :class="[
        `mode-${bubbleLayout.mode}`,
        {
          'avatar-outside':
            isBubbleMode && showAvatar && avatarPlacement === 'outside',
          'header-outside': isBubbleMode && headerPlacement === 'outside',
        },
      ]"
    >
      <template v-for="(msg, index) in messages" :key="msg.id">
        <div
          class="message-slot"
          :data-role="getMessageLayout(index).role"
          :data-align="getMessageLayout(index).align"
          :data-avatar-placement="avatarPlacement"
          :data-message-id="msg.id"
          :data-header-outside="
            shouldUseOutsideHeader(msg, getMessageLayout(index))
              ? 'true'
              : 'false'
          "
        >
          <MessageExternalAvatar
            v-if="
              isBubbleMode &&
              showAvatar &&
              avatarPlacement === 'outside' &&
              getMessageLayout(index).align !== 'center'
            "
            :message="msg"
            :size="bubbleLayout.avatarSize"
          />

          <div
            v-if="shouldUseOutsideHeader(msg, getMessageLayout(index))"
            class="message-body"
          >
            <MessageHeader
              class="external-header"
              :message="msg"
              :hide-avatar="screenshotHideHeaderAvatar"
              :screenshot-mode="true"
            />
            <ChatMessage
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :is-compressed="compressedNodeIds.has(msg.id)"
              :message-depth="messages.length - 1 - index"
              :is-sending="isSending"
              :screenshot-mode="true"
              :siblings="getMessageSiblings(msg.id).siblings"
              :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
              :llm-think-rules="llmThinkRules"
              :hide-header="true"
              :rich-text-style-options="
                msg.role === 'user'
                  ? userRichTextStyleOptions || richTextStyleOptions
                  : richTextStyleOptions
              "
            />
          </div>

          <template v-else>
            <CompressionMessage
              v-if="msg.metadata?.isCompressionNode"
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :message-depth="messages.length - 1 - index"
              :screenshot-mode="true"
            />

            <ToolCallMessage
              v-else-if="msg.role === 'tool'"
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :message-depth="messages.length - 1 - index"
              :is-sending="isSending"
              :screenshot-mode="true"
              :siblings="getMessageSiblings(msg.id).siblings"
              :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
            />

            <ChatMessage
              v-else
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :is-compressed="compressedNodeIds.has(msg.id)"
              :message-depth="messages.length - 1 - index"
              :is-sending="isSending"
              :screenshot-mode="true"
              :siblings="getMessageSiblings(msg.id).siblings"
              :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
              :llm-think-rules="llmThinkRules"
              :hide-header-avatar="screenshotHideHeaderAvatar"
              :rich-text-style-options="
                msg.role === 'user'
                  ? userRichTextStyleOptions || richTextStyleOptions
                  : richTextStyleOptions
              "
            />
          </template>
        </div>
      </template>
    </div>

    <!-- V5: 底部品牌标识 -->
    <ScreenshotBrandStrip
      v-if="showBrandFooter"
      ref="brandFooterRef"
      :brand="resolvedBrand"
      :session-index="sessionIndex"
      :session-detail="sessionDetail"
      :messages="messages"
      position="bottom"
      class="screenshot-brand-footer"
    />

    <!-- V5: 水印层 (平铺于整张长图, 实时预览 + 导出后由 drawWatermark 重新绘制以保证高保真) -->
    <div
      v-show="props.watermark?.enable"
      class="screenshot-watermark-layer"
      :style="watermarkStyle"
    ></div>
  </div>
</template>

<style scoped>
.screenshot-renderer {
  /* 固定宽度, 排版稳定 (由父容器负责定位与缩放) */
  width: var(--screenshot-width, 720px);
  min-width: var(--screenshot-width, 720px);
  max-width: var(--screenshot-width, 720px);
  box-sizing: border-box;
  overflow: visible !important;
  /* V4: 背景与留白 */
  background: var(--screenshot-bg, transparent);
  padding: var(--screenshot-padding, 0px);
  position: relative;
}

/* V4: 壁纸背景层 (通过 ::before 伪元素实现, 不影响内容层) */
.screenshot-renderer::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--screenshot-wallpaper, none);
  /* V5: 平铺方式由 CSS 变量控制 (cover / contain / tile / stretch) */
  background-size: var(--screenshot-wallpaper-size, cover);
  background-position: center;
  background-repeat: var(--screenshot-wallpaper-repeat, no-repeat);
  opacity: var(--screenshot-wallpaper-opacity, 0);
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
}

/* V5: 水印层 (绝对定位, 平铺于 renderer 内部, 在壁纸之上, 内容之下) */
.screenshot-watermark-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* z-index: 2 — 必须位于 messages-container / brand-strip (z:1) 之上,
   * 否则会被消息容器的不透明背景完全遮住, 预览看不到水印。
   * 这与导出端 drawWatermark 在所有消息 drawImage 之后 fillRect 整张图保持一致 (所见即所得)。 */
  z-index: 2;
}

/* 确保内容在壁纸层之上 */
.screenshot-renderer > .messages-container {
  position: relative;
  z-index: 1;
}

/* 头/脚外间距控制 */
.screenshot-brand-header {
  position: relative;
  z-index: 1;
  margin-top: 0;
  margin-bottom: 12px;
}
.screenshot-brand-footer {
  position: relative;
  z-index: 1;
  margin-top: 12px;
  margin-bottom: 0;
}

/* V4: 卡片装饰 */
.screenshot-renderer.has-decoration {
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* 强制全量展开, 否则视口外消息渲染不出来 */
:deep(.chat-message),
:deep(.tool-call-message),
:deep(.compression-message) {
  content-visibility: visible !important;
  contain-intrinsic-size: auto 0px !important;
}

/* 容器不需要滚动 */
.messages-container {
  display: flex;
  flex-direction: column;
  /* V4: 间距由 CSS 变量控制, 回退到模式默认值 */
  gap: var(--screenshot-gap, 8px);
  padding: 0;
  width: 100%;
  box-sizing: border-box;
}

/* Bubble 模式: 消息间距比卡片模式更大, 与 MessageList 保持一致 */
.messages-container.mode-bubble {
  gap: var(--screenshot-gap, 12px);
}

/*
 * 卡片模式：message-slot 仅作为透明 wrapper（不改变现有视觉）
 * 必须显式声明，因为 MessageList.vue 的对应样式是 scoped，
 * 不会作用到本组件渲染出来的元素上。
*/
.messages-container.mode-card .message-slot {
  display: block;
  width: 100%;
  min-width: 0;
}

/*
 * 气泡模式：message-slot 作为对齐容器
 * 完整复刻 MessageList.vue 中的 bubble 布局规则，
 * 否则 bubble 模式下的对齐、限宽、外置头像/header 全部失效，
 * 进而导致 .message-slot 收缩到气泡自然宽度，截出来变成窄条。
*/
.messages-container.mode-bubble .message-slot {
  display: flex;
  width: 100%;
  align-items: flex-start;
  /* min-width: 0 防止 flex item 内容溢出造成横向滚动 */
  min-width: 0;
  box-sizing: border-box;
}

/* 对齐方向 */
.messages-container.mode-bubble .message-slot[data-align="left"] {
  justify-content: flex-start;
}

.messages-container.mode-bubble .message-slot[data-align="right"] {
  justify-content: flex-end;
}

.messages-container.mode-bubble .message-slot[data-align="center"] {
  justify-content: center;
}

/* 气泡子元素的宽度限制（避免气泡被父容器撑满成全宽） */
.messages-container.mode-bubble .message-slot > .chat-message,
.messages-container.mode-bubble .message-slot > .tool-call-message,
.messages-container.mode-bubble .message-slot > .compression-message,
.messages-container.mode-bubble .message-slot > .message-body,
.messages-container.mode-bubble :deep(.message-slot > .chat-message),
.messages-container.mode-bubble :deep(.message-slot > .tool-call-message),
.messages-container.mode-bubble :deep(.message-slot > .compression-message) {
  max-width: min(
    var(--bubble-max-width-percent, 75%),
    var(--bubble-max-width-px, 720px)
  );
  flex: 0 1 auto;
  min-width: 0;
}

/* 外置头像: 气泡宽度需要扣掉头像列, 否则右对齐气泡会被推到边缘
 * :not([data-align="center"]) 居中消息不挂头像, 无需扣减 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
  > .chat-message,
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
  > .tool-call-message,
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
  > .compression-message,
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
  > .message-body,
.messages-container.mode-bubble.avatar-outside
  :deep(
    .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
      > .chat-message
  ),
.messages-container.mode-bubble.avatar-outside
  :deep(
    .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
      > .tool-call-message
  ),
.messages-container.mode-bubble.avatar-outside
  :deep(
    .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
      > .compression-message
  ) {
  max-width: min(
    max(
      0px,
      calc(
        var(--bubble-max-width-percent, 75%) -
          var(--avatar-outside-size, 36px) - var(--avatar-outside-gap, 8px)
      )
    ),
    var(--bubble-max-width-px, 720px)
  );
}

/* System / Compression 消息使用独立的居中宽度 */
.messages-container.mode-bubble .message-slot[data-role="system"] > * {
  max-width: var(--system-max-width-percent, 60%);
}

/* 圆角同步: 覆写消息组件内部的 8px 圆角为可配置值 (含背景容器与 ::after)
 * 缺少这条, 气泡模式截图出来的圆角会保持组件默认的 8px, 与系统设置不符 */
.messages-container.mode-bubble :deep(.chat-message),
.messages-container.mode-bubble :deep(.tool-call-message),
.messages-container.mode-bubble :deep(.compression-message) {
  border-radius: var(--bubble-radius, 12px);
}

.messages-container.mode-bubble :deep(.message-background-container) {
  border-radius: var(--bubble-radius, 12px);
}

.messages-container.mode-bubble :deep(.chat-message::after),
.messages-container.mode-bubble :deep(.tool-call-message::after),
.messages-container.mode-bubble :deep(.compression-message::after) {
  border-radius: var(--bubble-radius, 12px);
}

/* 外置头像：与气泡顶部对齐，flex-direction row-reverse 让头像贴在气泡外侧 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"] {
  align-items: flex-start;
  gap: var(--avatar-outside-gap, 8px);
}

.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"][data-align="right"] {
  flex-direction: row-reverse;
  /* row-reverse 下, flex-start 才是右对齐, 覆盖默认的 flex-end */
  justify-content: flex-start;
}

/* 外置头像的透明占位 (tool/system 行) 保持气泡缩进对齐, 但不响应交互 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]
  > .message-external-avatar {
  pointer-events: none;
}

/* 外置 Header 容器：让 header 紧贴气泡上方 */
.messages-container.mode-bubble .message-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--header-outside-gap, 4px);
  min-width: 0;
  width: fit-content;
}

.messages-container.mode-bubble
  .message-slot[data-align="right"]
  .message-body {
  align-items: flex-end;
}

.messages-container.mode-bubble .message-body > .chat-message {
  max-width: 100%;
  width: fit-content;
}

/* 右对齐通用镜像：保证 header / 工具头 / 底部信息的视觉镜像 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header:not(.external-header)) {
  flex-direction: row-reverse;
}

.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header .header-left) {
  flex-direction: row-reverse;
}

/* header-right 原 margin-left: auto 与 row-reverse 冲突, 镜像 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header:not(.external-header) .header-right) {
  margin-left: 0;
  margin-right: auto;
}

.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header .message-info) {
  align-items: flex-end;
  text-align: right;
}

.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.tool-call-message) {
  flex-direction: row-reverse;
}

.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.tool-call-message .tool-header) {
  flex-direction: row-reverse;
}

.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.tool-call-message .tool-header .header-left) {
  flex-direction: row-reverse;
}

/* ----------------------------------------------------------
 * 气泡模式: 底部信息 (.message-meta) 与消息方向对齐
 * 截图模式下 menubar 整体被隐藏, 但 meta (token/字数/性能) 仍需正确对齐
 * ---------------------------------------------------------- */
.messages-container.mode-bubble
  .message-slot[data-align="left"]
  :deep(.message-meta) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-meta) {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-meta .error-info) {
  flex-direction: row-reverse;
  text-align: right;
}

/* 隐藏滚动条 */
:deep(*) {
  scrollbar-width: none !important;
}

:deep(*::-webkit-scrollbar) {
  display: none !important;
}

/* ===== 元素覆盖: 根据 elementToggles 隐藏对应元素 ===== */

/* 隐藏头像: 外置头像 */
.hide-avatar :deep(.message-external-avatar) {
  display: none !important;
}

/* 隐藏头像: header 内头像 (卡片模式或气泡模式内嵌头像) */
.hide-avatar :deep(.message-header .header-left .avatar),
.hide-avatar :deep(.message-header .header-left .tool-avatar) {
  display: none !important;
}

/* 隐藏模型信息/副标题 */
.hide-model-info :deep(.message-subtitle) {
  display: none !important;
}

/* 隐藏时间戳 */
.hide-timestamp :deep(.message-time) {
  display: none !important;
}

/* 隐藏性能指标 */
.hide-performance :deep(.performance-stats) {
  display: none !important;
}

/* 隐藏 Token 统计 (按 data-meta-type 精确匹配) */
.hide-token-count :deep(.usage-info[data-meta-type="token"]) {
  display: none !important;
}

/* 隐藏字数统计 (按 data-meta-type 精确匹配) */
.hide-char-count :deep(.usage-info[data-meta-type="char"]) {
  display: none !important;
}

/* Token + 字数都隐藏时, 隐藏整个 meta 区域 */
.hide-token-count.hide-char-count :deep(.message-meta) {
  display: none !important;
}

/* 只有字数统计开启时, 隐藏 token 统计后 meta 区域仍然需要显示 */
.hide-token-count:not(.hide-char-count) :deep(.message-meta) {
  display: block !important;
}

/* 只有 token 统计开启时 */
.hide-char-count:not(.hide-token-count) :deep(.message-meta) {
  display: block !important;
}
</style>
