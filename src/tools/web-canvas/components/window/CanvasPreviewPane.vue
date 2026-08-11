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
  <div class="canvas-preview-pane">
    <div v-if="isRefreshing" class="loading-overlay">
      <Loader2 class="animate-spin" :size="24" />
    </div>

    <iframe
      ref="iframeRef"
      class="preview-iframe"
      :src="previewSrc || undefined"
      :srcdoc="previewSrcdoc || undefined"
      sandbox="allow-scripts"
      @load="emit('load')"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Loader2 } from "lucide-vue-next";

defineProps<{
  previewSrc: string;
  previewSrcdoc?: string;
  isRefreshing: boolean;
}>();

const emit = defineEmits<{
  (e: "console-message", payload: CanvasPreviewMessage): void;
  (e: "load"): void;
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);

defineExpose({
  iframe: iframeRef,
});

interface CanvasPreviewMessage {
  type: "canvas-console" | "canvas-runtime-error";
  level?: "log" | "warn" | "error" | "info";
  args?: string[];
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  timestamp: number;
}

const MAX_MESSAGE_LENGTH = 8_000;
const MAX_STACK_LENGTH = 16_000;
const MAX_CONSOLE_ARGS = 50;

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, maxLength);
}

function sanitizePreviewMessage(data: unknown): CanvasPreviewMessage | null {
  if (!data || typeof data !== "object") return null;

  const payload = data as Record<string, unknown>;
  const type = payload.type;
  if (type !== "canvas-console" && type !== "canvas-runtime-error") {
    return null;
  }

  const level = payload.level;
  const safeLevel =
    level === "log" || level === "warn" || level === "error" || level === "info"
      ? level
      : type === "canvas-runtime-error"
        ? "error"
        : "log";

  const timestamp =
    typeof payload.timestamp === "number" && Number.isFinite(payload.timestamp)
      ? payload.timestamp
      : Date.now();

  if (type === "canvas-console") {
    const args = Array.isArray(payload.args)
      ? payload.args
          .filter((arg): arg is string => typeof arg === "string")
          .slice(0, MAX_CONSOLE_ARGS)
          .map((arg) => arg.slice(0, MAX_MESSAGE_LENGTH))
      : [];
    return { type, level: safeLevel, args, timestamp };
  }

  const message = boundedText(payload.message, MAX_MESSAGE_LENGTH);
  if (!message) return null;

  return {
    type,
    level: safeLevel,
    message,
    filename: boundedText(payload.filename, MAX_MESSAGE_LENGTH),
    lineno: typeof payload.lineno === "number" ? payload.lineno : undefined,
    colno: typeof payload.colno === "number" ? payload.colno : undefined,
    stack: boundedText(payload.stack, MAX_STACK_LENGTH),
    timestamp,
  };
}

const handleMessage = (event: MessageEvent) => {
  // srcdoc iframe 通过 sandbox="allow-scripts" 获得 opaque origin（序列化为 "null"）。
  // source 校验是主防线，避免页面中其他 frame / 窗口伪造 Agent 可见的运行时错误。
  if (
    event.source !== iframeRef.value?.contentWindow ||
    event.origin !== "null"
  ) {
    return;
  }

  const payload = sanitizePreviewMessage(event.data);
  if (payload) {
    emit("console-message", payload);
  }
};

onMounted(() => {
  window.addEventListener("message", handleMessage);
});

onUnmounted(() => {
  window.removeEventListener("message", handleMessage);
});
</script>

<style scoped lang="scss">
.canvas-preview-pane {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #fff;
  overflow: hidden;

  .preview-iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(var(--ui-blur));
    z-index: 10;
    color: var(--el-color-primary);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
