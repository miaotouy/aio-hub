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
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Copy,
  Info,
  X,
  XCircle,
} from "lucide-vue-next";
import {
  closeFloatingMessage,
  DEFAULT_MESSAGE_OFFSET,
  floatingMessages,
} from "@/utils/customMessage";
import type {
  CustomMessageContent,
  CustomMessageType,
  FloatingMessage,
} from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("components/common/TopMessageHost");
const TIMER_INTERVAL = 16;

const copiedMessageId = ref<string | null>(null);
const copyFailedMessageId = ref<string | null>(null);
const timers = new Map<string, number>();
let copiedStateTimer: number | undefined;

const MessageBody = defineComponent({
  name: "TopMessageBody",
  props: {
    content: {
      type: [String, Object, Function],
      required: true,
    },
    dangerouslyUseHTMLString: Boolean,
  },
  setup(props) {
    return () => {
      const content = props.content as CustomMessageContent;
      const attributes = { class: "top-message__content" };

      if (typeof content === "string") {
        return props.dangerouslyUseHTMLString
          ? h("p", { ...attributes, innerHTML: content })
          : h("p", attributes, content);
      }

      return h(
        "div",
        attributes,
        typeof content === "function" ? content() : content
      );
    };
  },
});

const containerStyle = computed(() => ({
  top: `${Math.max(
    DEFAULT_MESSAGE_OFFSET,
    floatingMessages[0]?.offset ?? DEFAULT_MESSAGE_OFFSET
  )}px`,
}));

function getTypeIcon(type: CustomMessageType) {
  switch (type) {
    case "success":
      return CheckCircle;
    case "warning":
      return AlertTriangle;
    case "error":
      return XCircle;
    default:
      return Info;
  }
}

function getCopyText(message: FloatingMessage) {
  if (message.copyText !== undefined) return message.copyText;
  if (typeof message.message !== "string") return "";
  if (!message.dangerouslyUseHTMLString) return message.message;

  const container = document.createElement("div");
  container.innerHTML = message.message;
  return container.textContent || "";
}

function canCopy(message: FloatingMessage) {
  return getCopyText(message).trim().length > 0;
}

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(id);
  }
}

function updateRemaining(message: FloatingMessage) {
  if (message.startedAt === null || message.duration === 0) return;

  const elapsed = Date.now() - message.startedAt;
  if (elapsed <= 0) return;

  message.remainingMs = Math.max(0, message.remainingMs - elapsed);
  message.progress = message.remainingMs / message.duration;
  message.startedAt = Date.now();
}

function isMessageActive(message: FloatingMessage) {
  return floatingMessages.some((item) => item.id === message.id);
}

function startTimer(message: FloatingMessage) {
  if (
    message.duration === 0 ||
    message.paused ||
    message.remainingMs <= 0 ||
    timers.has(message.id)
  ) {
    return;
  }

  message.startedAt = Date.now();
  const version = message.timerVersion;

  const tick = () => {
    timers.delete(message.id);
    if (
      !isMessageActive(message) ||
      message.paused ||
      message.timerVersion !== version
    ) {
      return;
    }

    updateRemaining(message);
    if (message.remainingMs <= 0) {
      closeFloatingMessage(message.id);
      return;
    }

    timers.set(message.id, window.setTimeout(tick, TIMER_INTERVAL));
  };

  timers.set(message.id, window.setTimeout(tick, TIMER_INTERVAL));
}

function synchronizeTimers() {
  const activeIds = new Set(floatingMessages.map((message) => message.id));
  for (const id of timers.keys()) {
    if (!activeIds.has(id)) clearTimer(id);
  }

  floatingMessages.forEach((message) => {
    if (message.paused || message.duration === 0 || message.remainingMs <= 0) {
      clearTimer(message.id);
      return;
    }
    startTimer(message);
  });
}

function pauseTimer(message: FloatingMessage) {
  if (message.duration === 0 || message.paused) return;
  updateRemaining(message);
  message.paused = true;
  clearTimer(message.id);
}

function resumeTimer(message: FloatingMessage) {
  if (message.duration === 0 || !message.paused) return;
  message.paused = false;
  startTimer(message);
}

function resetCopyState() {
  if (copiedStateTimer !== undefined) {
    window.clearTimeout(copiedStateTimer);
  }
  copiedStateTimer = window.setTimeout(() => {
    copiedMessageId.value = null;
    copyFailedMessageId.value = null;
  }, 1600);
}

async function writeText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // 受限 WebView 或非安全上下文时，回退到传统复制方式。
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) throw new Error("浏览器未提供可用的剪贴板写入能力");
}

async function copyMessage(message: FloatingMessage) {
  const text = getCopyText(message).trim();
  if (!text) return;

  try {
    await writeText(text);
    copiedMessageId.value = message.id;
    copyFailedMessageId.value = null;
  } catch (error) {
    copyFailedMessageId.value = message.id;
    copiedMessageId.value = null;
    logger.warn("复制顶部浮动消息失败", { error });
  } finally {
    resetCopyState();
  }
}

function getMessageClass(message: FloatingMessage) {
  return [
    `top-message--${message.type}`,
    {
      "top-message--plain": message.plain,
      "top-message--paused": message.paused,
      "top-message--copyable": canCopy(message),
    },
    message.customClass,
  ];
}

watch(floatingMessages, synchronizeTimers, { deep: true, flush: "post" });

onMounted(synchronizeTimers);
onBeforeUnmount(() => {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers.clear();
  if (copiedStateTimer !== undefined) window.clearTimeout(copiedStateTimer);
});
</script>

<template>
  <div class="top-message-host" :style="containerStyle">
    <TransitionGroup
      name="top-message-transition"
      tag="div"
      class="top-message-list"
    >
      <div
        v-for="message in floatingMessages"
        :key="message.id"
        class="top-message"
        :class="getMessageClass(message)"
        :role="canCopy(message) ? 'button' : 'alert'"
        :tabindex="canCopy(message) ? 0 : -1"
        :aria-label="canCopy(message) ? '点击复制消息内容' : '通知'"
        @mouseenter="pauseTimer(message)"
        @mouseleave="resumeTimer(message)"
        @click="copyMessage(message)"
        @keydown.enter.prevent="copyMessage(message)"
        @keydown.space.prevent="copyMessage(message)"
      >
        <div class="top-message__main">
          <div class="top-message__icon" aria-hidden="true">
            <component
              :is="message.icon || getTypeIcon(message.type)"
              :size="18"
            />
          </div>
          <MessageBody
            :content="message.message"
            :dangerously-use-html-string="message.dangerouslyUseHTMLString"
          />
          <span v-if="message.repeatNum > 1" class="top-message__repeat-count">
            {{ message.repeatNum }}
          </span>
          <button
            v-if="canCopy(message)"
            class="top-message__copy"
            type="button"
            :aria-label="
              copiedMessageId === message.id
                ? '消息内容已复制'
                : copyFailedMessageId === message.id
                  ? '复制消息内容失败'
                  : '复制消息内容'
            "
            :title="
              copiedMessageId === message.id
                ? '已复制'
                : copyFailedMessageId === message.id
                  ? '复制失败'
                  : '点击复制'
            "
            @click.stop="copyMessage(message)"
          >
            <Check v-if="copiedMessageId === message.id" :size="16" />
            <X v-else-if="copyFailedMessageId === message.id" :size="16" />
            <Copy v-else :size="16" />
          </button>
          <button
            v-if="message.showClose"
            class="top-message__close"
            type="button"
            aria-label="关闭消息"
            title="关闭"
            @click.stop="closeFloatingMessage(message.id)"
          >
            <X :size="16" />
          </button>
        </div>

        <div
          v-if="message.duration > 0"
          class="top-message__progress"
          :class="{ 'is-paused': message.paused }"
          aria-hidden="true"
        >
          <span
            class="top-message__progress-fill"
            :style="{ transform: `scaleX(${message.progress})` }"
          />
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.top-message-host {
  --top-message-max-width: 720px;
  position: fixed;
  z-index: var(--z-index-notification);
  left: 50%;
  width: min(var(--top-message-max-width), calc(96vw - 32px));
  pointer-events: none;
  transform: translateX(-50%);
}

.top-message-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.top-message {
  --top-message-accent: var(--el-color-info);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  width: fit-content;
  max-width: 100%;
  padding: 9px 11px 10px;
  color: var(--top-message-accent);
  background: color-mix(in srgb, var(--top-message-accent) 15%, transparent);
  border: var(--border-width) solid
    color-mix(in srgb, var(--top-message-accent) 40%, transparent);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(var(--backdrop-bg-rgb), 0.08);
  backdrop-filter: blur(var(--ui-blur));
  cursor: default;
  pointer-events: auto;
}

.top-message--copyable {
  cursor: copy;
}

.top-message--copyable:focus-visible {
  outline: 2px solid var(--top-message-accent);
  outline-offset: 3px;
}

.top-message--success {
  --top-message-accent: var(--el-color-success);
}

.top-message--warning {
  --top-message-accent: var(--el-color-warning);
}

.top-message--error {
  --top-message-accent: var(--el-color-danger);
}

.top-message--primary {
  --top-message-accent: var(--el-color-primary);
}

.top-message--plain {
  background: color-mix(in srgb, var(--top-message-accent) 8%, transparent);
  backdrop-filter: none;
}

.top-message__main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.top-message__icon {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
  color: var(--top-message-accent);
}

.top-message__content {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--top-message-accent);
  overflow-wrap: anywhere;
}

.top-message__repeat-count {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  color: var(--top-message-accent);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--top-message-accent) 13%, transparent);
  border-radius: 9px;
}

.top-message__copy,
.top-message__close {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin: -3px -3px 0 0;
  color: var(--top-message-accent);
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.86;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease;
}

.top-message__copy:hover,
.top-message__close:hover {
  background: color-mix(in srgb, var(--top-message-accent) 16%, transparent);
  opacity: 1;
}

.top-message__copy:focus-visible,
.top-message__close:focus-visible {
  outline: 2px solid var(--top-message-accent);
  outline-offset: 1px;
}

.top-message__progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: color-mix(in srgb, var(--top-message-accent) 20%, transparent);
}

.top-message__progress-fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--top-message-accent);
  transform-origin: left center;
  transition: transform 16ms linear;
}

.top-message__progress.is-paused .top-message__progress-fill {
  transition: none;
}

.top-message-transition-enter-active,
.top-message-transition-leave-active,
.top-message-transition-move {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.top-message-transition-enter-from,
.top-message-transition-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .top-message-transition-enter-active,
  .top-message-transition-leave-active,
  .top-message-transition-move,
  .top-message__copy,
  .top-message__close,
  .top-message__progress-fill {
    transition: none;
  }
}
</style>
