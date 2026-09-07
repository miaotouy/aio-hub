<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<template>
  <section class="video-panel">
    <div class="video-panel__header">
      <div>
        <div class="video-panel__title">本地视频 OCR</div>
        <div class="video-panel__hint">
          选择已下载的视频，按时间抽帧识别字幕并导出 SRT
        </div>
      </div>
      <div class="video-panel__actions">
        <el-button size="small" :disabled="isBusy" @click="clearVideo"
          >重新选择</el-button
        >
        <el-button v-if="isBusy" size="small" type="danger" @click="cancel"
          >取消识别</el-button
        >
        <el-button
          v-else
          size="small"
          type="primary"
          :disabled="!canStart || screen.isOcrPreparing.value"
          @click="startTask"
          >{{
            screen.isOcrPreparing.value ? "检查 OCR" : "开始识别"
          }}</el-button
        >
      </div>
    </div>

    <DropZone
      v-if="!source"
      class="video-drop-zone"
      :accept="videoExtensions"
      :multiple="false"
      file-only
      clickable
      click-zone
      variant="border"
      placeholder="拖入视频文件，或点击选择"
      drag-overlay-text="松开以加载视频"
      @drop="onVideoDrop"
      @error="onError"
    />

    <template v-else>
      <div class="video-meta">
        <span class="video-name" :title="source.fileName">{{
          source.fileName
        }}</span>
        <span>{{ formatDuration(source.durationMs) }}</span>
        <span>{{ source.width }} × {{ source.height }}</span>
        <span v-if="source.fps">{{ source.fps.toFixed(2) }} fps</span>
        <span
          class="ffmpeg-status"
          :class="{
            'ffmpeg-status--ok': ffmpegAvailable === true,
            'ffmpeg-status--error': ffmpegAvailable === false,
          }"
        >
          FFmpeg
          {{
            ffmpegAvailable === true
              ? "已就绪"
              : ffmpegAvailable === false
                ? "不可用"
                : "待检查"
          }}
        </span>
      </div>
      <div class="video-range">
        <label
          >开始
          <input
            v-model.number="startSeconds"
            type="number"
            min="0"
            :max="durationSeconds"
            step="0.1"
            :disabled="isBusy"
          />
          秒</label
        >
        <label
          >结束
          <input
            v-model.number="endSeconds"
            type="number"
            min="0"
            :max="durationSeconds"
            step="0.1"
            :disabled="isBusy"
          />
          秒</label
        >
        <span class="range-hint"
          >抽帧间隔
          {{ (screen.config.value.intervalMs / 1000).toFixed(1) }} 秒</span
        >
      </div>
      <VideoRoiSelector
        v-model="roi"
        :video-url="videoUrl"
        :video-width="source.width"
        :video-height="source.height"
      />
      <div class="video-progress">
        <div class="video-progress__row">
          <span>{{ phaseText }}</span>
          <span>{{ progress.percent.toFixed(1) }}%</span>
        </div>
        <el-progress
          :percentage="Math.min(100, progress.percent)"
          :status="progressStatus"
          :show-text="false"
        />
        <div class="video-progress__detail">
          <span>时间 {{ formatDuration(progress.currentTimeMs) }}</span>
          <span
            >已抽帧 {{ progress.extracted }} / {{ progress.total || "-" }}</span
          >
          <span>已识别 {{ progress.ocrCompleted }}</span>
        </div>
        <div v-if="progress.error" class="video-error">
          {{ progress.error }}
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ElButton, ElProgress } from "element-plus";
import DropZone from "@/components/common/DropZone.vue";
import { customMessage } from "@/utils/customMessage";
import { useVideoSubtitleOcr } from "../composables/useVideoSubtitleOcr";
import VideoRoiSelector from "./VideoRoiSelector.vue";

const video = useVideoSubtitleOcr();
const {
  source,
  roi,
  status,
  progress,
  ffmpegAvailable,
  canStart,
  start,
  cancel,
  selectVideo,
} = video;
const screen = video.screen;
const videoExtensions = [
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
  ".flv",
  ".m4v",
];
const videoUrl = computed(() =>
  source.value ? convertFileSrc(source.value.path) : ""
);
const durationSeconds = computed(() => (source.value?.durationMs ?? 0) / 1000);
const startSeconds = computed({
  get: () => video.startMs.value / 1000,
  set: (value: number) => {
    const seconds = Number.isFinite(value) ? value : 0;
    video.startMs.value = Math.min(
      source.value?.durationMs ?? Number.MAX_SAFE_INTEGER,
      Math.max(0, Math.round(seconds * 1000))
    );
  },
});
const endSeconds = computed({
  get: () => video.endMs.value / 1000,
  set: (value: number) => {
    const seconds = Number.isFinite(value) ? value : 0;
    video.endMs.value = Math.min(
      source.value?.durationMs ?? Number.MAX_SAFE_INTEGER,
      Math.max(0, Math.round(seconds * 1000))
    );
  },
});
const isBusy = computed(() =>
  ["preparing", "running", "cancelling"].includes(status.value)
);
const phaseText = computed(
  () =>
    ({
      extracting: "抽取视频帧",
      ocr: "识别字幕",
      completed: "识别完成",
      cancelled: "已取消",
      error: "处理失败",
    })[progress.value.phase] ?? "等待开始"
);
const progressStatus = computed(() =>
  progress.value.phase === "error"
    ? "exception"
    : progress.value.phase === "completed"
      ? "success"
      : undefined
);

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

async function onVideoDrop(paths: string[]) {
  if (!paths[0]) return;
  try {
    await selectVideo(paths[0]);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}
async function startTask() {
  try {
    await start();
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}
async function clearVideo() {
  await cancel();
  video.source.value = null;
}
async function onError(message: string) {
  customMessage.error(message);
}
</script>

<style scoped>
.video-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: auto;
}
.video-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.video-panel__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.video-panel__hint,
.range-hint {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  margin-top: 3px;
}
.video-panel__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.video-drop-zone {
  min-height: 180px;
  flex: 1;
}
.video-meta,
.video-range,
.video-progress__row,
.video-progress__detail {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.video-name {
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.ffmpeg-status--ok {
  color: var(--el-color-success);
}
.ffmpeg-status--error {
  color: var(--el-color-danger);
}
.video-range label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.video-range input {
  width: 78px;
  color: var(--el-text-color-primary);
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 4px 6px;
}
.video-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.video-progress__row {
  justify-content: space-between;
  width: 100%;
}
.video-progress__detail {
  justify-content: space-between;
  width: 100%;
  font-size: 11px;
}
.video-error {
  color: var(--el-color-danger);
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
