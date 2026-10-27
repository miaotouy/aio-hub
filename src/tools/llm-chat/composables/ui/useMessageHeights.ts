// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  computed,
  effectScope,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  provide,
  shallowRef,
  watch,
  type ObjectDirective,
  type Ref,
} from "vue";
import { clearCache } from "@chenglou/pretext";
import { createModuleLogger } from "@/utils/logger";
import type { ChatMessageNode } from "../../types";
import type { ChatSettings } from "../../types/settings";
import {
  DEFAULT_MESSAGE_HEIGHT,
  MessageHeightCache,
  type MessageHeightKey,
  type MessageTextMetrics,
  isPlainMessageText,
} from "../../utils/messageHeightCache";

import {
  messageHeightSourceKey,
  type MessageHeightSource,
} from "./useMessageHeightSource";

import type { RendererReadingArea } from "@/tools/rich-text-renderer/composables/useRendererDisplay";

interface SlotBinding {
  message: ChatMessageNode;
  eager: boolean;
}
interface Options {
  readingArea?: RendererReadingArea;
  container: Ref<HTMLElement | null>;
  preferences: () => Pick<
    ChatSettings["uiPreferences"],
    "fontSize" | "letterSpacing" | "showAvatar" | "bubbleLayout"
  >;
  appearance: () => unknown;
  sessionId: () => string | null | undefined;
  screenshotMode: () => boolean;
}
interface Slot {
  element: HTMLElement;
  binding: Ref<SlotBinding>;
  scope: ReturnType<typeof effectScope>;
  revision: string;
  skipped: boolean | undefined;
  nearby?: Ref<boolean>;
  placeholder: number;
  onVisibility: EventListener;
}

/** 消息整行占位与实测缓存；滚动行为继续由 useMessageScrollAnchor 维护。 */
export function useMessageHeights(options: Options) {
  const logger = createModuleLogger("message-heights");
  const cache = new MessageHeightCache();
  const layoutRevision = shallowRef("");
  const sources = new Map<
    string,
    { value: MessageHeightSource; owner: object }
  >();
  const slots = new Map<HTMLElement, Slot>();
  const pending = new Set<Slot>();
  const typography = new Map<
    string,
    Omit<MessageTextMetrics, "width" | "minHeight">
  >();
  let active = false;
  let disposed = false;
  let frame: number | null = null;
  let observer: ResizeObserver | undefined;
  let mutations: MutationObserver | undefined;
  let themeObserver: MutationObserver | undefined;
  let width = 0;
  let fontRevision = 0;
  let pixelRatio = devicePixelRatio;
  let font = { family: "sans-serif", weight: "400", style: "normal" };
  let appearance = "";
  let environmentDirty = true;
  let estimationFailed = false;

  const appearanceInput = computed(() => JSON.stringify(options.appearance()));
  const isLive = (slot: Slot) =>
    ["waiting", "generating"].includes(slot.binding.value.message.status);
  const isEager = (slot: Slot) =>
    slot.binding.value.eager || isLive(slot) || options.screenshotMode();
  const keyFor = (slot: Slot): MessageHeightKey => ({
    id: `${options.sessionId() ?? ""}\0${slot.binding.value.message.id}`,
    content: sourceFor(slot)?.text ?? slot.binding.value.message.content,
    revision: slot.revision + (sourceFor(slot)?.appearance ?? ""),
    appearance,
    width,
  });

  function schedule(slot?: Slot) {
    if (slot) pending.add(slot);
    if (active && frame === null) frame = requestAnimationFrame(flush);
  }

  function refreshAll() {
    environmentDirty = true;
    for (const slot of slots.values()) pending.add(slot);
    schedule();
  }

  const sourceFor = (slot: Slot) =>
    sources.get(slot.binding.value.message.id)?.value;

  provide(messageHeightSourceKey, (id, source, owner) => {
    if (source) sources.set(id, { value: source, owner });
    else if (sources.get(id)?.owner === owner) sources.delete(id);
    for (const slot of slots.values()) {
      if (slot.binding.value.message.id === id) {
        schedule(slot);
        if (active) observe(slot);
      }
    }
  });

  function cohort(slot: Slot): string {
    const message = slot.binding.value.message;
    const meta = message.metadata;
    return JSON.stringify([
      message.role,
      meta?.agentId,
      meta?.userProfileId,
      !!(meta?.usage || meta?.contentTokens !== undefined),
      sourceFor(slot)?.appearance,
    ]);
  }

  // 每种消息外观采样一个已显示的普通段落，复用实际字体与头尾占用高度。
  // 只读取正在排版的消息，避免为估高强制展开屏外内容。
  function sampleTypography(slot: Slot, height: number) {
    const id = cohort(slot);
    if (typography.has(id) || !metricsFor(slot)) return;
    const content = sourceFor(slot)?.text;
    if (!content || !isPlainMessageText(content)) return;
    const paragraphs = Array.from(
      slot.element.querySelectorAll<HTMLElement>(".markdown-paragraph")
    );
    if (
      !paragraphs.length ||
      paragraphs
        .map((p) => p.textContent)
        .join("")
        .replace(/\s/g, "") !== content.replace(/\s/g, "")
    )
      return;
    const paragraph = paragraphs[0];
    const span = paragraph.querySelector(".markdown-paragraph-content");
    if (!span) return;
    const style = getComputedStyle(span);
    const paragraphStyle = getComputedStyle(paragraph);
    const textHeight = paragraphs.reduce(
      (total, p) => total + parseFloat(getComputedStyle(p).height),
      0
    );
    const lineHeight = parseFloat(paragraphStyle.lineHeight);
    if (!Number.isFinite(textHeight) || !Number.isFinite(lineHeight)) return;
    typography.set(id, {
      font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      letterSpacing: parseFloat(style.letterSpacing) || 0,
      lineHeight,
      chromeHeight: height - textHeight,
      paragraphGap: 0,
    });
    for (const other of slots.values())
      if (cohort(other) === id) schedule(other);
  }

  function metricsFor(slot: Slot): MessageTextMetrics | undefined {
    const message = slot.binding.value.message;
    if (sourceFor(slot)?.text === undefined) return;
    if (
      !["user", "assistant"].includes(message.role) ||
      message.metadata?.isCompressionNode ||
      message.metadata?.isPresetDisplay ||
      message.metadata?.translation ||
      message.metadata?.reasoningContent ||
      message.metadata?.partialImagePreviews?.length ||
      message.metadata?.error ||
      message.attachments?.length ||
      message.presetAttachments?.length ||
      message.knowledgeReference
    )
      return;
    const prefs = options.preferences();
    const bubble = prefs.bubbleLayout;
    let textWidth = width;
    let chromeHeight = 32 + 16; // surface padding + message-content 上下 margin
    let minHeight = 0;
    if (bubble.mode === "bubble") {
      const outsideAvatar =
        prefs.showAvatar && bubble.avatarPlacement === "outside";
      const avatarColumn = outsideAvatar
        ? bubble.avatarSize + bubble.avatarGap
        : 0;
      textWidth = Math.min(
        (width * bubble.maxWidthPercent) / 100 - avatarColumn,
        bubble.maxWidthPx
      );
      minHeight = outsideAvatar ? bubble.avatarSize : 0;
      chromeHeight +=
        bubble.headerPlacement === "outside" ? 24 + bubble.headerGap : 32;
    } else {
      chromeHeight += (prefs.showAvatar ? 40 : 24) + 8 + 12;
    }
    // 普通段落内联 span 的左右 padding / border 同样占用行宽。
    textWidth -= 32 + 10;
    const fontSize = prefs.fontSize;
    return {
      font: `${font.style} ${font.weight} ${fontSize}px ${font.family}`,
      letterSpacing: prefs.letterSpacing,
      lineHeight: fontSize * 1.6, // ParagraphNode 的行高
      width: textWidth,
      chromeHeight,
      paragraphGap: 0,
      minHeight,
      ...typography.get(cohort(slot)),
    };
  }

  function apply(slot: Slot) {
    const eager = isEager(slot);
    slot.element.style.setProperty(
      "content-visibility",
      eager ? "visible" : slot.nearby?.value === false ? "hidden" : "auto",
      "important"
    );
    let height = eager ? undefined : cache.read(keyFor(slot));
    if (!eager && height === undefined && !estimationFailed && width > 0) {
      const metrics = metricsFor(slot);
      if (metrics) {
        try {
          height = cache.estimate(
            keyFor(slot).id,
            sourceFor(slot)!.text!,
            metrics
          );
        } catch (error) {
          estimationFailed = true;
          logger.warn("文本高度预估暂不可用，使用默认占位", error);
        }
      }
    }
    slot.placeholder = height ?? DEFAULT_MESSAGE_HEIGHT;
    // 显式维护实测高度，避免浏览器 auto 记忆在宽度 / 内容变化后继续使用旧尺寸。
    slot.element.style.setProperty(
      "contain-intrinsic-size",
      `none ${slot.placeholder}px`,
      "important"
    );
  }

  function flush() {
    frame = null;
    const container = options.container.value;
    if (!active || !container) return;
    if (environmentDirty) {
      typography.clear();
      if (pixelRatio !== devicePixelRatio) {
        pixelRatio = devicePixelRatio;
        fontRevision++;
        cache.clear();
        clearCache();
      }
      const style = getComputedStyle(container);
      font = {
        family: style.fontFamily,
        weight: style.fontWeight,
        style: style.fontStyle,
      };
      appearance = JSON.stringify([
        appearanceInput.value,
        font,
        fontRevision,
        devicePixelRatio,
      ]);
      layoutRevision.value = JSON.stringify([appearance, width]);
      environmentDirty = false;
      for (const slot of slots.values()) {
        if (isEager(slot) || slot.skipped === false) observe(slot);
      }
    }
    const start = performance.now();
    for (const slot of pending) {
      pending.delete(slot);
      if (slots.has(slot.element)) apply(slot);
      // 分帧准备历史文本，避免长会话集中测量占住一整帧。
      if (performance.now() - start >= 5) break;
    }
    if (pending.size) schedule();
  }

  function observe(slot: Slot) {
    observer?.unobserve(slot.element);
    observer?.observe(slot.element);
  }

  function mount(element: HTMLElement, binding: SlotBinding) {
    const scope = effectScope(true);
    const slot: Slot = {
      element,
      binding: shallowRef(binding),
      scope,
      revision: "",
      skipped: undefined,
      placeholder: DEFAULT_MESSAGE_HEIGHT,
      onVisibility: (event) => {
        slot.skipped = (event as Event & { skipped: boolean }).skipped;
        if (!slot.skipped) observe(slot);
      },
    };
    slots.set(element, slot);
    element.addEventListener(
      "contentvisibilityautostatechange",
      slot.onVisibility
    );
    scope.run(() => {
      if (options.readingArea) {
        slot.nearby = options.readingArea.register(shallowRef(element));
        watch(
          slot.nearby,
          () => {
            schedule(slot);
            if (active) observe(slot);
          },
          { immediate: true, flush: "post" }
        );
      }
      return watch(
        () => {
          const message = slot.binding.value.message;
          // 生成期间不监听 token 内容，也不准备文本或写实测缓存。
          if (isLive(slot)) return ["", "live"] as const;
          // 重放状态与请求参数等数据不参与可见排版，避免复制到高度缓存。
          const {
            requestParameters: _request,
            reasoningArtifacts: _replay,
            sessionVariableSnapshot: _variables,
            ...metadata
          } = message.metadata ?? {};
          return [
            message.content,
            {
              id: message.id,
              name: message.name,
              role: message.role,
              status: message.status,
              isEnabled: message.isEnabled,
              timestamp: message.timestamp,
              updatedAt: message.updatedAt,
              attachments: message.attachments,
              presetAttachments: message.presetAttachments,
              knowledgeReference: message.knowledgeReference,
              metadata,
            },
          ] as const;
        },
        ([, decoration]) => {
          slot.revision = JSON.stringify(decoration);
          schedule(slot);
          if (active) observe(slot);
        },
        { deep: true, immediate: true, flush: "post" }
      );
    });
    if (active) observe(slot);
  }

  function unmount(element: HTMLElement) {
    const slot = slots.get(element);
    if (!slot) return;
    observer?.unobserve(element);
    element.removeEventListener(
      "contentvisibilityautostatechange",
      slot.onVisibility
    );
    slot.scope.stop();
    pending.delete(slot);
    slots.delete(element);
  }

  const vMessageSize: ObjectDirective<HTMLElement, SlotBinding> = {
    mounted: (el, binding) => mount(el, binding.value),
    updated: (el, binding) => {
      const slot = slots.get(el);
      if (
        slot &&
        (slot.binding.value.message !== binding.value.message ||
          slot.binding.value.eager !== binding.value.eager)
      ) {
        slot.binding.value = binding.value;
        schedule(slot);
      }
    },
    beforeUnmount: unmount,
  };

  function connect() {
    observer?.disconnect();
    mutations?.disconnect();
    if (!active || !options.container.value) return;
    observer ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === options.container.value) {
          const nextWidth = entry.contentRect.width;
          if (nextWidth > 0 && nextWidth !== width) {
            width = nextWidth;
            refreshAll();
          }
          continue;
        }
        const slot = slots.get(entry.target as HTMLElement);
        if (
          !slot ||
          environmentDirty ||
          isLive(slot) ||
          options.screenshotMode() ||
          (!isEager(slot) && slot.skipped !== false)
        )
          continue;
        const height =
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (!Number.isFinite(height) || height <= 0 || width <= 0) continue;
        // 跳过占位自身的 ResizeObserver 回调，防止将预估值写成实测值。
        if (Math.abs(height - slot.placeholder) < 1 / 64 && !isEager(slot))
          continue;
        sampleTypography(slot, height);
        if (cache.read(keyFor(slot)) !== height) {
          cache.remember(keyFor(slot), height);
          schedule(slot);
        }
      }
    });
    observer.observe(options.container.value);
    for (const slot of slots.values()) observe(slot);
    mutations ??= new MutationObserver((records) => {
      const touched = new Set<Slot>();
      for (const record of records) {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const element = target?.closest<HTMLElement>(".message-slot");
        const slot = element && slots.get(element);
        if (slot && !isLive(slot)) touched.add(slot);
      }
      for (const slot of touched) {
        // DOM 回收、恢复及异步节点更新沿用上次实测高度，待有效的 ResizeObserver 校准。
        // 内容、外观和宽度变化由 keyFor 区分；仅子树变化时退回通用占位会破坏历史定位。
        schedule(slot);
        if (!slot.skipped || isEager(slot)) observe(slot);
      }
    });
    mutations.observe(options.container.value, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    refreshAll();
  }

  function activate() {
    active = true;
    connect();
  }

  function deactivate() {
    active = false;
    observer?.disconnect();
    mutations?.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function onFontsChanged() {
    if (disposed) return;
    fontRevision++;
    estimationFailed = false;
    cache.clear();
    clearCache();
    refreshAll();
    if (active) for (const slot of slots.values()) observe(slot);
  }

  watch(options.container, connect, { flush: "post" });
  watch(
    [appearanceInput, options.sessionId, options.screenshotMode],
    () => {
      refreshAll();
      if (active) for (const slot of slots.values()) observe(slot);
    },
    { flush: "post" }
  );
  onMounted(() => {
    activate();
    themeObserver = new MutationObserver(refreshAll);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    document.fonts?.addEventListener("loadingdone", onFontsChanged);
    void document.fonts?.ready.then(onFontsChanged);
    window.addEventListener("resize", refreshAll);
  });
  onActivated(activate);
  onDeactivated(deactivate);
  onBeforeUnmount(() => {
    disposed = true;
    deactivate();
    themeObserver?.disconnect();
    document.fonts?.removeEventListener("loadingdone", onFontsChanged);
    window.removeEventListener("resize", refreshAll);
    for (const element of slots.keys()) unmount(element);
    cache.clear();
    sources.clear();
  });

  return { vMessageSize, layoutRevision };
}
