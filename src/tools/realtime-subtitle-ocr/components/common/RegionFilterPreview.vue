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
  <FrameFilterPreview
    :original-url="originalUrl"
    :filtered-url="filteredUrl"
    :recognized-text="recognizedText"
    :capturing="capturing"
    :recognizing="recognizing"
    :disabled="disabled"
    :hint="hint"
    @capture="refresh"
    @recognize="recognize"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import FrameFilterPreview from "./FrameFilterPreview.vue";
import { useScreenMonitor } from "../../composables/useScreenMonitor";
import {
  getSourceDimensions,
  isSourceReady,
  releaseCaptureSource,
  recognizeCanvas,
  renderFilteredRegion,
  type CaptureSource,
  type PixelRect,
} from "../../utils/frameCapture";

const props = defineProps<{
  /** 返回一个可截图的来源（视频当前帧 / 已解码的屏幕截图）。 */
  capture: () => Promise<CaptureSource | null>;
  /** 可选的裁剪区域；缺省时使用来源完整尺寸。 */
  getRect?: (source: CaptureSource) => PixelRect;
  /** 变化时若已有预览则自动重新截图（如 ROI 调整）。 */
  refreshKey?: string | number;
  disabled?: boolean;
  hint?: string;
}>();

const { config } = useScreenMonitor();

const originalUrl = ref("");
const filteredUrl = ref("");
const recognizedText = ref<string | null>(null);
const capturing = ref(false);
const recognizing = ref(false);

let filteredCanvas: HTMLCanvasElement | null = null;
let currentSource: CaptureSource | null = null;
let recognizeAbort: AbortController | null = null;
let refreshTimer: number | null = null;

function fullRect(source: CaptureSource): PixelRect {
  const { width, height } = getSourceDimensions(source);
  return { x: 0, y: 0, width, height };
}

async function refresh() {
  if (props.disabled) return;
  capturing.value = true;
  let capturedSource: CaptureSource | null = null;
  try {
    capturedSource = await props.capture();
    if (!capturedSource || !isSourceReady(capturedSource)) {
      clearPreview();
      return;
    }
    const rect = props.getRect
      ? props.getRect(capturedSource)
      : fullRect(capturedSource);
    const result = renderFilteredRegion(
      capturedSource,
      rect,
      config.value.imageFilter
    );
    if (currentSource !== capturedSource) {
      releaseCaptureSource(currentSource);
    }
    currentSource = capturedSource;
    capturedSource = null;
    originalUrl.value = result.originalUrl;
    filteredUrl.value = result.filteredUrl;
    filteredCanvas = result.filteredCanvas;
    recognizedText.value = null;
  } catch {
    clearPreview();
  } finally {
    releaseCaptureSource(capturedSource);
    capturing.value = false;
  }
}

function clearPreview() {
  releaseCaptureSource(currentSource);
  currentSource = null;
  originalUrl.value = "";
  filteredUrl.value = "";
  filteredCanvas = null;
  recognizedText.value = null;
}

async function recognize() {
  if (!filteredCanvas) return;
  recognizing.value = true;
  try {
    recognizeAbort?.abort();
    recognizeAbort = new AbortController();
    recognizedText.value = await recognizeCanvas(
      filteredCanvas,
      config.value.engineConfig,
      recognizeAbort.signal
    );
  } catch {
    recognizedText.value = "[识别失败]";
  } finally {
    recognizing.value = false;
  }
}

function scheduleRefresh() {
  if (!originalUrl.value) return;
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, 220);
}

/** 仅在已经抓过图时重新截图（供外部 seek/ROI 变化时调用）。 */
function refreshIfActive() {
  if (originalUrl.value) void refresh();
}

watch(
  () => JSON.stringify(config.value.imageFilter),
  () => scheduleRefresh()
);

watch(
  () => props.refreshKey,
  () => scheduleRefresh()
);

onBeforeUnmount(() => {
  recognizeAbort?.abort();
  if (refreshTimer) window.clearTimeout(refreshTimer);
  clearPreview();
});

defineExpose({ refresh, recognize, refreshIfActive, originalUrl });
</script>
