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

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButtonGroup } from "element-plus";
import VideoWorkbench from "./components/video/VideoWorkbench.vue";
import ScreenWorkbench from "./components/screen/ScreenWorkbench.vue";
import { useScreenMonitor } from "./composables/useScreenMonitor";
import { useVideoSubtitleOcr } from "./composables/useVideoSubtitleOcr";

// 壳子只负责模式切换与全局状态徽标；屏幕 / 视频两套工作台各自持有独立状态。
const { status, isOcrPreparing } = useScreenMonitor();
const videoOcr = useVideoSubtitleOcr();
const ocrMode = ref<"screen" | "video">("screen");

/**
 * 切换模式只改变当前展示的工作台，不停止/取消另一条流水线：
 * 两个工作台经 KeepAlive 常驻，屏幕监控与视频识别可同时并行。
 */
function switchMode(nextMode: "screen" | "video") {
  ocrMode.value = nextMode;
}

const statusText = computed(() => {
  if (ocrMode.value === "video") {
    switch (videoOcr.status.value) {
      case "preparing":
      case "running":
        return videoOcr.progress.value.phase === "ocr" ? "识别中" : "抽帧中";
      case "cancelling":
        return "取消中";
      case "completed":
        return "已完成";
      case "cancelled":
        return "已取消";
      case "error":
        return "失败";
      default:
        return "空闲";
    }
  }
  if (isOcrPreparing.value) return "OCR 准备中";
  switch (status.value) {
    case "running":
      return "监控中";
    case "stopped":
      return "已停止";
    default:
      return "空闲";
  }
});
</script>

<template>
  <div class="rsocr-wrapper">
    <!-- 顶部工具栏 -->
    <div class="rsocr-toolbar">
      <div class="toolbar-left">
        <el-button-group size="small">
          <el-button
            data-testid="rsocr-mode-screen"
            :type="ocrMode === 'screen' ? 'primary' : 'default'"
            @click="switchMode('screen')"
            >屏幕实时 OCR</el-button
          >
          <el-button
            data-testid="rsocr-mode-video"
            :type="ocrMode === 'video' ? 'primary' : 'default'"
            @click="switchMode('video')"
            >本地视频 OCR</el-button
          >
        </el-button-group>
        <span
          class="status-badge"
          :class="ocrMode === 'video' ? videoOcr.status : status"
        >
          {{ statusText }}
        </span>
      </div>
    </div>

    <!-- 工作台区：KeepAlive 常驻，切换模式不销毁、不中断对方 -->
    <div class="rsocr-content">
      <KeepAlive>
        <VideoWorkbench
          v-if="ocrMode === 'video'"
          class="rsocr-workbench"
        />
        <ScreenWorkbench v-else class="rsocr-workbench" />
      </KeepAlive>
    </div>
  </div>
</template>

<style scoped>
.rsocr-wrapper {
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  border-radius: 8px;
  flex-direction: column;
  background: var(--container-bg);
}

.rsocr-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-secondary);
}

.status-badge.running {
  background: rgba(var(--el-color-success-rgb), 0.15);
  color: var(--el-color-success);
}

.status-badge.stopped {
  background: rgba(var(--el-color-danger-rgb), 0.15);
  color: var(--el-color-danger);
}

.rsocr-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.rsocr-workbench {
  flex: 1;
  min-height: 0;
}
</style>
