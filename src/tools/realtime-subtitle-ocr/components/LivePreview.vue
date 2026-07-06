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
      <img
        v-if="lastFrameUrl"
        :src="lastFrameUrl"
        alt="Live Screen Capture"
        class="live-preview__img"
      />
      <div v-else class="live-preview__placeholder">
        <div class="placeholder-content">
          <TvIcon :size="32" class="placeholder-icon" />
          <span>{{ isRunning ? "正在等待首帧画面..." : "未开始监控" }}</span>
        </div>
      </div>
    </div>
    <div class="live-preview__control-bar">
      <div class="control-left">
        <el-button
          type="primary"
          size="small"
          :disabled="isRunning"
          @click="$emit('open-monitor-box')"
        >
          <SquareDashedIcon :size="14" /> 打开监控框
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
          :disabled="!monitorRect && !isRunning"
          @click="$emit('toggle-monitor')"
        >
          <component :is="isRunning ? SquareIcon : PlayIcon" :size="14" />
          {{ isRunning ? "停止监控" : "开始监控" }}
        </el-button>
      </div>
      <div class="control-right">
        <div class="info-item">
          <span class="info-label">aHash:</span>
          <span class="info-value font-mono">{{ lastHash || "N/A" }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">延迟:</span>
          <span class="info-value font-mono">{{
            latency ? `${latency}ms` : "N/A"
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElButton } from "element-plus";
import {
  Tv as TvIcon,
  SquareDashedMousePointer as SquareDashedIcon,
  Crosshair as CrosshairIcon,
  Play as PlayIcon,
  Square as SquareIcon,
} from "lucide-vue-next";

defineProps<{
  lastFrameUrl: string | null;
  lastHash: string;
  latency: number;
  isRunning: boolean;
  isMonitorBoxDetached: boolean;
  monitorRect: any;
}>();

defineEmits<{
  (e: "open-monitor-box"): void;
  (e: "focus-monitor-box"): void;
  (e: "toggle-monitor"): void;
}>();
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

.live-preview__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
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
  flex-direction: column;
  align-items: stretch;
  padding: 10px 12px;
  background: var(--sidebar-bg);
  border-top: var(--border-width) solid var(--border-color);
  font-size: 12px;
  gap: 10px;
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
  border-top: 1px dashed var(--border-color);
  padding-top: 8px;
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
