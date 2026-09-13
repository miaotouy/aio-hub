<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="live-preview">
    <div class="live-preview__screen">
      <div
        v-if="lastFrameUrl"
        class="live-preview__comparison"
        :class="{ 'live-preview__comparison--stacked': shouldStackComparison }"
      >
        <figure class="live-preview__pane">
          <figcaption>原图</figcaption>
          <img
            :src="lastRawFrameUrl || lastFrameUrl"
            alt="原始截图"
            class="live-preview__img"
            @load="updateImageAspect"
          />
        </figure>
        <figure class="live-preview__pane">
          <figcaption>处理后</figcaption>
          <img
            :src="lastFrameUrl"
            alt="滤镜处理结果"
            class="live-preview__img"
            @load="updateImageAspect"
          />
        </figure>
      </div>
      <div v-else class="live-preview__placeholder">
        <div class="placeholder-content">
          <TvIcon :size="32" class="placeholder-icon" />
          <span>{{
            isOcrPreparing
              ? "正在准备 OCR 引擎..."
              : isRunning
                ? "正在等待首帧画面..."
                : "未开始监控"
          }}</span>
        </div>
      </div>
    </div>
    <div class="live-preview__control-bar">
      <div class="control-left">
        <el-button
          v-if="!isMonitorBoxDetached"
          type="primary"
          size="small"
          :disabled="isRunning"
          @click="$emit('open-monitor-box')"
        >
          <SquareDashedIcon :size="14" /> 打开监控框
        </el-button>
        <el-button
          v-else
          type="danger"
          size="small"
          :disabled="isRunning"
          @click="$emit('close-monitor-box')"
        >
          <XIcon :size="14" /> 关闭监控框
        </el-button>
        <el-button
          size="small"
          :disabled="!isMonitorBoxDetached"
          @click="$emit('focus-monitor-box')"
        >
          <CrosshairIcon :size="14" /> 聚焦监控框
        </el-button>
        <el-button
          :type="isRunning ? 'danger' : 'success'"
          size="small"
          :disabled="isOcrPreparing || (!hasMonitorRect && !isRunning)"
          @click="$emit('toggle-monitor')"
        >
          <component
            :is="
              isOcrPreparing ? LoaderIcon : isRunning ? SquareIcon : PlayIcon
            "
            :size="14"
            :class="{ 'is-spinning': isOcrPreparing }"
          />
          {{
            isOcrPreparing ? "检查 OCR" : isRunning ? "停止监控" : "开始监控"
          }}
        </el-button>
      </div>
      <div class="control-right">
        <div class="info-item">
          <span class="info-label">OCR 延迟:</span>
          <span class="info-value font-mono">{{
            latency ? `${latency}ms` : "N/A"
          }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">滤镜+编码:</span>
          <span class="info-value font-mono">{{
            filterLatency ? `${filterLatency}ms` : "N/A"
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton } from "element-plus";
import {
  Tv as TvIcon,
  SquareDashedMousePointer as SquareDashedIcon,
  Crosshair as CrosshairIcon,
  Play as PlayIcon,
  LoaderCircle as LoaderIcon,
  Square as SquareIcon,
  X as XIcon,
} from "lucide-vue-next";

defineProps<{
  lastFrameUrl: string | null;
  lastRawFrameUrl: string | null;
  latency: number;
  filterLatency: number;
  isRunning: boolean;
  isOcrPreparing: boolean;
  isMonitorBoxDetached: boolean;
  hasMonitorRect: boolean;
}>();

defineEmits<{
  (e: "open-monitor-box"): void;
  (e: "close-monitor-box"): void;
  (e: "focus-monitor-box"): void;
  (e: "toggle-monitor"): void;
}>();

const imageAspectRatio = ref<number | null>(null);
const shouldStackComparison = computed(
  () => (imageAspectRatio.value ?? 0) >= 3
);

function updateImageAspect(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    imageAspectRatio.value = image.naturalWidth / image.naturalHeight;
  }
}
</script>

<style scoped>
.live-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.live-preview__screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--input-bg);
  backdrop-filter: blur(var(--ui-blur));
  min-height: 0;
  position: relative;
}

.live-preview__comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 8px;
}

.live-preview__comparison--stacked {
  grid-template-columns: 1fr;
}

.live-preview__pane {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
  margin: 0;
}

.live-preview__pane figcaption {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.live-preview__img {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
}

.live-preview__placeholder {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.placeholder-icon {
  opacity: 0.5;
  animation: pulse 2s infinite;
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.8;
  }
}
.live-preview__control-bar {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--sidebar-bg);
  border-top: var(--border-width) solid var(--border-color);
  font-size: 12px;
  gap: 8px 12px;
}

.control-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.control-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-label {
  color: var(--el-text-color-secondary);
}

.info-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
  word-break: break-all;
}

.font-mono {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
}
</style>
