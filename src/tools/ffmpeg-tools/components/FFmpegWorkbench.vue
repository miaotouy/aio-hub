<template>
  <div class="workbench-container">
    <div class="workbench-main">
      <div class="workbench-layout">
        <!-- 左侧：处理配置 -->
        <div class="left-panel config-panel">
          <InfoCard title="处理配置" :icon="Settings">
            <template #headerExtra>
              <div class="pro-switch">
                <span class="label">专业模式</span>
                <el-switch v-model="isProfessional" size="small" />
              </div>
            </template>
            <div class="config-scroll-area">
              <FFmpegParamsForm :params="params" :is-professional="isProfessional" />

              <div class="command-preview">
                <div class="preview-header">
                  <span>FFmpeg 指令预览</span>
                  <el-tag size="small" type="info" effect="plain">自动生成</el-tag>
                </div>
                <div class="command-content">
                  <code>{{ generatedCommand }}</code>
                </div>
              </div>
            </div>

            <div class="submit-area">
              <el-button
                type="primary"
                size="large"
                :disabled="!currentFilePath"
                @click="submitTask"
              >
                <el-icon><Play /></el-icon>
                <span>开始处理任务</span>
              </el-button>
            </div>
          </InfoCard>
        </div>

        <!-- 右侧：文件管理与反馈 -->
        <div class="right-panel">
          <!-- 待处理文件卡片 -->
          <InfoCard title="待处理文件" :icon="Files" class="file-card">
            <template #headerExtra>
              <el-button v-if="currentFilePath" link :icon="Delete" type="danger" @click="reset"
                >清除</el-button
              >
            </template>
            <div class="file-selection-area">
              <DropZone
                v-if="!currentFilePath"
                clickable
                @drop="handleFileDrop"
                :accept="['.mp4', '.mkv', '.avi', '.mov', '.mp3', '.wav', '.flac', '.m4a']"
                placeholder="点击或拖入媒体文件"
                class="full-dropzone"
              />
              <div v-else class="selected-file-wrapper">
                <div class="selected-file-info">
                  <div class="file-header">
                    <FileIcon :name="fileName" :size="32" />
                    <div class="file-meta">
                      <div class="name" :title="currentFilePath">{{ fileName }}</div>
                      <div class="path">{{ currentFilePath }}</div>
                    </div>
                    <div class="file-replace-hint">
                      <el-button type="primary" link @click="handleManualSelect"> 更换 </el-button>
                    </div>
                  </div>
                  <!-- 媒体元数据展示 -->
                  <div v-if="metadata" class="metadata-mini-grid">
                    <div class="mini-item">
                      <span class="label">时长</span>
                      <span class="value">{{ formatDuration(metadata.duration) }}</span>
                    </div>
                    <div class="mini-item" v-if="metadata.width">
                      <span class="label">分辨率</span>
                      <span class="value">{{ metadata.width }}x{{ metadata.height }}</span>
                    </div>
                    <div class="mini-item">
                      <span class="label">大小</span>
                      <span class="value">{{ formatSize(metadata.size) }}</span>
                    </div>
                    <div class="mini-item info-btn-item">
                      <el-button type="primary" link :icon="Info" @click="showFullMediaInfo">
                        详情
                      </el-button>
                    </div>
                  </div>
                </div>
                <!-- 覆盖模式，自动处理拖放更换 -->
                <DropZone
                  overlay
                  hide-content
                  @drop="handleFileDrop"
                  :accept="['.mp4', '.mkv', '.avi', '.mov', '.mp3', '.wav', '.flac', '.m4a']"
                />
              </div>
            </div>
          </InfoCard>

          <!-- 预览与控制台 -->
          <div class="right-bottom-panel" v-if="currentFilePath">
            <el-tabs v-model="activeRightTab" class="content-tabs">
              <el-tab-pane label="媒体预览" name="preview">
                <div class="preview-box">
                  <VideoPlayer v-if="isMaybeVideo" :src="currentFileUrl" class="preview-player" />
                  <AudioPlayer v-else-if="metadata?.hasAudio" :src="currentFileUrl" />
                  <div v-else class="no-preview">
                    <el-icon :size="48"><VideoOff /></el-icon>
                    <span>暂无预览</span>
                  </div>
                </div>
              </el-tab-pane>
              <el-tab-pane label="实时控制台" name="logs">
                <FFmpegConsole :logs="currentTaskLogs" @clear="clearLogs" />
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>
      </div>
    </div>

    <!-- 媒体详情弹窗 -->
    <MediaInfoDialog ref="mediaInfoDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import { Files, Settings, VideoOff, Play, Delete, Info } from "lucide-vue-next";
import { useFFmpegStore } from "../ffmpegStore";
import { useFFmpegCore } from "../composables/useFFmpegCore";
import DropZone from "@/components/common/DropZone.vue";
import InfoCard from "@/components/common/InfoCard.vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import FFmpegParamsForm from "./FFmpegParamsForm.vue";
import FFmpegConsole from "./FFmpegConsole.vue";
import MediaInfoDialog from "./MediaInfoDialog.vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { basename, extname, dirname, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import type { MediaMetadata, FFmpegParams } from "../types";
import { customMessage } from "@/utils/customMessage";

const store = useFFmpegStore();
const { getMetadata, startProcess, setupListeners } = useFFmpegCore();

const currentFilePath = ref("");
const fileName = ref("");
const currentFileUrl = ref("");
const metadata = ref<MediaMetadata | null>(null);
const outputName = ref("");
const activeRightTab = ref("preview");
const lastTaskId = ref("");
const isProfessional = ref(false);
const mediaInfoDialogRef = ref();

const params = reactive<FFmpegParams>({
  mode: "video",
  inputPath: "",
  outputPath: "",
  ffmpegPath: "",
  hwaccel: true,
  crf: 23,
  audioBitrate: "128k",
  audioEncoder: "aac",
});

const currentTaskLogs = computed(() => {
  if (!lastTaskId.value) return [];
  const task = store.tasks.find((t) => t.id === lastTaskId.value);
  return task?.logs || [];
});

const generatedCommand = computed(() => {
  const parts = ["ffmpeg", "-y"]; // -y 默认覆盖
  if (params.hwaccel) parts.push("-hwaccel", "auto");
  parts.push("-i", currentFilePath.value || "input.mp4");

  if (params.mode === "custom" && params.customArgs) {
    parts.push(...params.customArgs);
  } else {
    if (params.mode === "extract_audio") {
      parts.push("-vn");
    } else {
      // 视频编码器优化：默认使用 libx264，但如果用户没选且是专业模式，可以考虑 libx265
      const vEncoder = params.videoEncoder || "libx264";
      parts.push("-c:v", vEncoder);

      // CRF 逻辑优化
      if (params.crf !== undefined) {
        parts.push("-crf", params.crf.toString());
      } else if (!params.videoBitrate && !params.maxSizeMb) {
        // 默认 CRF
        parts.push("-crf", vEncoder.includes("x265") ? "28" : "23");
      }

      if (params.videoBitrate) parts.push("-b:v", params.videoBitrate);
      if (params.preset) parts.push("-preset", params.preset);
      if (params.scale) parts.push("-vf", params.scale);
      if (params.fps) parts.push("-r", params.fps.toString());

      // 强制 yuv420p 以保证大多数播放器兼容性
      if (vEncoder !== "copy") {
        parts.push("-pix_fmt", params.pixelFormat || "yuv420p");
      }
    }

    // 音频处理
    if (params.audioEncoder) parts.push("-c:a", params.audioEncoder);
    if (params.audioEncoder !== "copy") {
      if (params.audioBitrate) parts.push("-b:a", params.audioBitrate);
      if (params.sampleRate) parts.push("-ar", params.sampleRate);
      if (params.audioChannels) parts.push("-ac", params.audioChannels.toString());
    }

    // 优化：添加 faststart 标志，便于网页预加载
    if (params.mode !== "extract_audio") {
      parts.push("-movflags", "+faststart");
    }
  }

  parts.push(`"${outputName.value || "output.mp4"}"`);
  return parts.join(" ");
});

const isMaybeVideo = computed(() => {
  const videoExts = [".mp4", ".mkv", ".avi", ".mov", ".webm"];
  return videoExts.some((ext) => fileName.value.toLowerCase().endsWith(ext));
});

const handleManualSelect = async () => {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Media Files",
        extensions: ["mp4", "mkv", "avi", "mov", "mp3", "wav", "flac", "m4a"],
      },
    ],
  });
  if (selected && typeof selected === "string") {
    handleFileDrop([selected]);
  }
};

const handleFileDrop = async (paths: string[]) => {
  if (paths.length === 0) return;
  const path = paths[0];
  currentFilePath.value = path;
  currentFileUrl.value = convertFileSrc(path);
  params.inputPath = path;

  const name = await basename(path);
  fileName.value = name;
  const ext = await extname(path);
  const nameWithoutExt = name.substring(0, name.lastIndexOf("."));
  outputName.value = `${nameWithoutExt}_processed.${ext}`;

  metadata.value = await getMetadata(path);
};

const showFullMediaInfo = () => {
  if (currentFilePath.value) {
    mediaInfoDialogRef.value?.show(currentFilePath.value, fileName.value);
  }
};

const reset = () => {
  currentFilePath.value = "";
  fileName.value = "";
  currentFileUrl.value = "";
  metadata.value = null;
  lastTaskId.value = "";
};

const clearLogs = () => {
  if (lastTaskId.value) {
    const task = store.tasks.find((t) => t.id === lastTaskId.value);
    if (task) task.logs = [];
  }
};

const formatDuration = (seconds?: number) => {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatSize = (bytes?: number | string) => {
  if (!bytes) return "--";
  const b = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(b)) return bytes.toString();
  const mb = b / (1024 * 1024);
  if (mb > 1024) {
    return `${(mb / 1024).toFixed(2)} GiB`;
  }
  return `${mb.toFixed(2)} MiB`;
};

const submitTask = async () => {
  if (!currentFilePath.value) return;

  const inputDir = await dirname(currentFilePath.value);
  params.outputPath = await join(inputDir, outputName.value);
  params.ffmpegPath = store.config.ffmpegPath;

  const task = store.addTask({
    name: outputName.value,
    inputPath: params.inputPath,
    outputPath: params.outputPath,
    mode: params.mode,
  });

  lastTaskId.value = task.id;
  activeRightTab.value = "logs";
  customMessage.success("任务已提交");

  startProcess(task.id, { ...params }).catch(() => {
    customMessage.error("处理失败");
  });
};

// 监听全局 FFmpeg 事件
let unlisten: (() => void) | null = null;
onMounted(async () => {
  unlisten = await setupListeners();
});

onUnmounted(() => {
  if (unlisten) unlisten();
});

// 自动更新输出文件名逻辑
watch([() => params.mode, () => params.audioEncoder], async () => {
  if (!currentFilePath.value) return;
  const nameWithoutExt = fileName.value.substring(0, fileName.value.lastIndexOf("."));
  const originalExt = await extname(currentFilePath.value);

  if (params.mode === "extract_audio") {
    const extMap: Record<string, string> = {
      aac: "m4a",
      libmp3lame: "mp3",
      flac: "flac",
      libopus: "opus",
    };
    outputName.value = `${nameWithoutExt}.${extMap[params.audioEncoder || ""] || "m4a"}`;
  } else {
    outputName.value = `${nameWithoutExt}_processed.${originalExt}`;
  }
});
</script>

<style scoped>
.workbench-container {
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.workbench-main {
  flex: 1;
  min-height: 0;
}

.workbench-layout {
  display: grid;
  grid-template-columns: 500px 1fr;
  gap: 20px;
  height: 100%;
}

.left-panel {
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.left-panel :deep(.el-card) {
  border: none;
  background: transparent;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.left-panel :deep(.el-card__body) {
  flex: 1;
  overflow: hidden; /* 关键：Body 不直接滚动 */
  padding: 0;
  display: flex;
  flex-direction: column;
}

.config-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.right-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

/* 当有文件时，调整比例 */
.right-panel:has(.right-bottom-panel) .file-card {
  flex: 0 0 auto;
}

.file-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-card :deep(.el-card) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.file-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.file-selection-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.full-dropzone {
  flex: 1;
}

.selected-file-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* overlay 模式由组件内部处理，此处不再需要复杂的 hack 样式 */

.selected-file-info {
  padding: 16px;
  transition: background-color 0.2s;
  border-radius: 8px;
  flex: 1;
}

.file-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  position: relative;
}

.file-replace-hint {
  margin-left: auto;
  flex-shrink: 0;
  position: relative;
  z-index: 20; /* 确保在透明 DropZone 之上，能够被点击 */
}

.file-meta {
  flex: 1;
  min-width: 0;
}

.file-meta .name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta .path {
  font-size: 12px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metadata-mini-grid {
  display: flex;
  gap: 24px;
  padding: 8px;
  background: var(--input-bg);
  border-radius: 4px;
}

.mini-item {
  display: flex;
  flex-direction: column;
}

.mini-item .label {
  font-size: 11px;
  color: var(--text-color-light);
}

.mini-item .value {
  font-size: 13px;
  font-weight: 600;
}

.right-bottom-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.content-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.content-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.content-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.preview-box {
  background: #000;
  border-radius: 8px;
  height: 100%;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border-color);
  position: relative;
}

.no-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #666;
}

.no-preview span {
  font-size: 14px;
}

.preview-player {
  width: 100%;
  height: 100%;
}

.info-btn-item {
  justify-content: center;
  margin-left: 8px;
}

.command-preview {
  margin-top: 24px;
  background: var(--input-bg);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-color-light);
  font-weight: 600;
}

.command-content {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--primary-color);
  word-break: break-all;
  line-height: 1.5;
}

.submit-area {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
  flex-shrink: 0;
}

.submit-area .el-button {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
}

.pro-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pro-switch .label {
  font-size: 12px;
  color: var(--text-color-light);
}

.clickable-dropzone {
  cursor: pointer;
}

.config-scroll-area::-webkit-scrollbar {
  width: 6px;
}

.config-scroll-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.config-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

/* 适配移动端或小屏幕的响应式处理 */
@media (max-width: 1000px) {
  .workbench-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .left-panel {
    height: auto;
    min-height: 500px;
  }
}
</style>
