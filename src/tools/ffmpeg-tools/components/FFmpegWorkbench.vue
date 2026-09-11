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
              <!-- 预设管理 -->
              <div class="preset-section">
                <FFmpegPresetManager
                  ref="presetManagerRef"
                  placeholder="选择预设…"
                  @apply="handleApplyPreset"
                  @save-as-preset="handleSaveAsPreset"
                />
              </div>

              <FFmpegParamsForm
                :params="params"
                :is-professional="isProfessional"
                @save-as-preset="triggerSaveAsPreset"
              />

              <div class="output-name-row">
                <span class="output-name-label">输出文件名</span>
                <el-input
                  v-model="outputName"
                  size="small"
                  placeholder="输出文件名"
                  @input="outputNameCustomized = true"
                  @blur="outputName = sanitizeOutputName(outputName)"
                />
                <el-button
                  v-if="outputNameCustomized"
                  link
                  type="primary"
                  size="small"
                  @click="restoreAutoName"
                >
                  恢复自动命名
                </el-button>
              </div>

              <div class="command-preview">
                <div class="preview-header">
                  <span>FFmpeg 指令预览</span>
                  <div class="preview-actions">
                    <el-tag size="small" type="info" effect="plain"
                      >PowerShell</el-tag
                    >
                    <el-tooltip content="复制 PowerShell 命令" placement="top">
                      <el-button
                        :icon="Copy"
                        size="small"
                        link
                        @click="copyPowerShellCommand"
                      />
                    </el-tooltip>
                  </div>
                </div>
                <div class="command-content">
                  <code>{{ generatedCommand }}</code>
                </div>
                <el-alert
                  v-if="containerWarning"
                  :title="containerWarning"
                  type="warning"
                  :closable="false"
                  show-icon
                  class="container-warning"
                />
              </div>
            </div>

            <div class="submit-area">
              <el-button v-if="isStopping" type="danger" size="large" disabled>
                <el-icon><Loader2 /></el-icon>
                <span>停止中</span>
              </el-button>
              <el-button
                v-else-if="activeTask"
                type="danger"
                size="large"
                @click="stopTask"
              >
                <el-icon><StopCircle /></el-icon>
                <span>停止</span>
              </el-button>
              <el-button
                v-else
                type="primary"
                size="large"
                :loading="isSubmitting"
                :disabled="isSubmitting || !currentFilePath"
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
              <el-button
                v-if="currentFilePath"
                link
                :icon="Delete"
                type="danger"
                @click="reset"
                >清除</el-button
              >
            </template>
            <div class="file-selection-area">
              <DropZone
                v-if="!currentFilePath"
                clickable
                click-zone
                @drop="handleFileDrop"
                :accept="[
                  '.mp4',
                  '.mkv',
                  '.avi',
                  '.mov',
                  '.mp3',
                  '.wav',
                  '.flac',
                  '.m4a',
                ]"
                placeholder="点击或拖入媒体文件"
                class="full-dropzone"
              />
              <div v-else class="selected-file-wrapper">
                <div class="selected-file-info">
                  <div class="file-header">
                    <FileIcon :name="fileName" :size="32" />
                    <div class="file-meta">
                      <div class="name" :title="currentFilePath">
                        {{ fileName }}
                      </div>
                      <div class="path">{{ currentFilePath }}</div>
                    </div>
                    <div class="file-replace-hint">
                      <el-button
                        type="primary"
                        link
                        @click="handleManualSelect"
                      >
                        更换
                      </el-button>
                    </div>
                  </div>
                  <!-- 媒体元数据展示 -->
                  <div v-if="metadata" class="metadata-mini-grid">
                    <div class="mini-item">
                      <span class="label">时长</span>
                      <span class="value">{{
                        formatDuration(metadata.duration)
                      }}</span>
                    </div>
                    <div class="mini-item" v-if="metadata.width">
                      <span class="label">分辨率</span>
                      <span class="value"
                        >{{ metadata.width }}x{{ metadata.height }}</span
                      >
                    </div>
                    <div class="mini-item">
                      <span class="label">大小</span>
                      <span class="value">{{ formatSize(metadata.size) }}</span>
                    </div>
                    <div class="mini-item info-btn-item">
                      <el-button
                        type="primary"
                        link
                        :icon="Info"
                        @click="showFullMediaInfo"
                      >
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
                  :accept="[
                    '.mp4',
                    '.mkv',
                    '.avi',
                    '.mov',
                    '.mp3',
                    '.wav',
                    '.flac',
                    '.m4a',
                  ]"
                />
              </div>
            </div>
          </InfoCard>

          <!-- 预览与控制台 -->
          <div class="right-bottom-panel" v-if="currentFilePath">
            <el-tabs v-model="activeRightTab" class="content-tabs">
              <el-tab-pane label="媒体预览" name="preview">
                <div class="preview-box">
                  <VideoPlayer
                    v-if="isMaybeVideo"
                    :src="currentFileUrl"
                    class="preview-player"
                  />
                  <AudioPlayer
                    v-else-if="metadata?.hasAudio"
                    :src="currentFileUrl"
                  />
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
import {
  Files,
  Settings,
  VideoOff,
  Play,
  Delete,
  Info,
  Copy,
  Loader2,
  StopCircle,
} from "lucide-vue-next";
import { useFFmpegStore } from "../ffmpegStore";
import { useFFmpegCore } from "../composables/useFFmpegCore";
import DropZone from "@/components/common/DropZone.vue";
import InfoCard from "@/components/common/InfoCard.vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import FFmpegParamsForm from "./FFmpegParamsForm.vue";
import FFmpegPresetManager from "./FFmpegPresetManager.vue";

import FFmpegConsole from "./FFmpegConsole.vue";
import MediaInfoDialog from "./MediaInfoDialog.vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { basename, dirname, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { MediaMetadata, FFmpegParams } from "../types";
import {
  buildExecutionPlan,
  formatPlanCommand,
  formatPowerShellCommand,
} from "../utils/executionPlan";
import type { FFmpegExecutionPlan } from "../utils/executionPlan";
import {
  splitFileName,
  buildAutoOutputName,
  resolveContainer,
  containerCompatibilityWarning,
  detectCustomFormatArg,
  sanitizeOutputName,
  makeUniqueName,
} from "../utils/naming";
import { applyPresetParams } from "../utils/preset";
import {
  isCancellationError,
  isTerminalStatus,
  normalizeOutputPathKey,
} from "../utils/lifecycle";
import { customMessage } from "@/utils/customMessage";

const store = useFFmpegStore();
const {
  activeFfmpegPath,
  getMetadata,
  startProcess,
  killProcess,
  setupListeners,
} = useFFmpegCore();
const presetManagerRef = ref<InstanceType<typeof FFmpegPresetManager>>();

const currentFilePath = ref("");
const fileName = ref("");
const currentFileUrl = ref("");
const metadata = ref<MediaMetadata | null>(null);
const outputName = ref("");
const outputNameCustomized = ref(false);
const fileLoadToken = ref(0);
const activeRightTab = ref("preview");
const lastTaskId = ref("");
const isProfessional = ref(false);
const mediaInfoDialogRef = ref();
const isSubmitting = ref(false);
const activeTaskId = ref("");
const isStopping = ref(false);

const params = reactive<FFmpegParams>({
  mode: "video",
  inputPath: "",
  outputPath: "",
  ffmpegPath: "",
  hwaccel: true,
  crf: 23,
  audioBitrate: "128k",
  audioEncoder: "aac",
  appendParamsToName: false,
});

const currentTaskLogs = computed(() => {
  if (!lastTaskId.value) return [];
  const task = store.tasks.find((t) => t.id === lastTaskId.value);
  return task?.logs || [];
});

const activeTask = computed(() => {
  if (!activeTaskId.value) return null;
  const task = store.tasks.find((t) => t.id === activeTaskId.value);
  if (!task) return null;
  return task.status === "pending" || task.status === "processing"
    ? task
    : null;
});

const currentPlan = computed<FFmpegExecutionPlan>(() =>
  buildExecutionPlan(
    {
      ...params,
      inputPath: currentFilePath.value || "input.mp4",
      outputPath: outputName.value || "output.mp4",
      ffmpegPath: activeFfmpegPath.value,
    },
    { durationSec: metadata.value?.duration }
  )
);

const generatedCommand = computed(() => formatPlanCommand(currentPlan.value));

const namingContext = computed(() => ({
  inputFileName: fileName.value,
  sourceContainer: splitFileName(fileName.value).ext || undefined,
  sourceAudioCodec: metadata.value?.audioCodec,
  sourceVideoCodec: metadata.value?.videoCodec,
}));

const containerWarning = computed<string | null>(() => {
  if (params.mode === "custom") {
    const format = detectCustomFormatArg(params.customArgs);
    if (!format) return null;
    const { ext } = splitFileName(outputName.value);
    if (
      ext &&
      ext.toLowerCase() !== resolveContainer(params, namingContext.value)
    ) {
      return "自定义 -f 与输出后缀不一致，请确认输出容器";
    }
    return null;
  }
  return containerCompatibilityWarning(
    params,
    resolveContainer(params, namingContext.value)
  );
});

const copyPowerShellCommand = async () => {
  const text = formatPowerShellCommand(currentPlan.value);
  try {
    try {
      await writeText(text);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    customMessage.success("已复制 PowerShell 命令");
  } catch {
    customMessage.error("复制 PowerShell 命令失败");
  }
};

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
  const token = ++fileLoadToken.value;

  const name = await basename(path);
  if (token !== fileLoadToken.value) return;

  const meta = await getMetadata(path);
  if (token !== fileLoadToken.value) return;

  currentFilePath.value = path;
  currentFileUrl.value = convertFileSrc(path);
  params.inputPath = path;
  fileName.value = name;
  metadata.value = meta;
  outputNameCustomized.value = false;
  outputName.value = buildAutoOutputName(params, namingContext.value);
};

const restoreAutoName = () => {
  outputNameCustomized.value = false;
  if (currentFilePath.value) {
    outputName.value = buildAutoOutputName(params, namingContext.value);
  }
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
  outputName.value = "";
  outputNameCustomized.value = false;
  lastTaskId.value = "";
  activeTaskId.value = "";
  isStopping.value = false;
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

const resolveUniqueOutputName = async (inputDir: string): Promise<string> => {
  const original = outputName.value;
  const { base, ext } = splitFileName(original);
  const extSuffix = ext ? `.${ext}` : "";
  const candidates = [original];
  for (let i = 1; i <= 100; i++) {
    candidates.push(`${base}_${i}${extSuffix}`);
  }

  const taken = new Map<string, boolean>();
  for (const candidate of candidates) {
    const isTaken = await invoke<boolean>("path_exists", {
      path: await join(inputDir, candidate),
    });
    taken.set(candidate, isTaken);
    if (!isTaken) break;
  }

  return makeUniqueName(original, (candidate) => taken.get(candidate) ?? true);
};

const submitTask = async () => {
  if (isSubmitting.value || activeTask.value) return;
  if (!currentFilePath.value) return;

  isSubmitting.value = true;
  let taskId = "";
  let plan: FFmpegExecutionPlan | null = null;

  try {
    const inputDir = await dirname(currentFilePath.value);
    let outputPath = await join(inputDir, outputName.value);

    if (
      normalizeOutputPathKey(currentFilePath.value) ===
      normalizeOutputPathKey(outputPath)
    ) {
      customMessage.error("输出路径不能与输入文件相同");
      return;
    }

    if (await invoke<boolean>("path_exists", { path: outputPath })) {
      if (outputNameCustomized.value) {
        try {
          const { ElMessageBox } = await import("element-plus");
          await ElMessageBox.confirm("输出文件已存在，是否覆盖？", "确认覆盖", {
            lockScroll: false,
            type: "warning",
          });
        } catch {
          return;
        }
      } else {
        const unique = await resolveUniqueOutputName(inputDir);
        outputName.value = unique;
        outputPath = await join(inputDir, unique);
      }
    }

    const ffmpegPath = activeFfmpegPath.value;

    plan = buildExecutionPlan(
      {
        ...params,
        inputPath: currentFilePath.value,
        outputPath,
        ffmpegPath,
      },
      { durationSec: metadata.value?.duration }
    );

    const task = store.addTask({
      name: outputName.value,
      inputPath: plan.inputPath,
      outputPath: plan.outputPath,
      mode: params.mode,
    });
    taskId = task.id;

    if (!store.reserveOutputPath(taskId, plan.outputPath)) {
      store.removeTask(taskId);
      taskId = "";
      customMessage.error(`输出路径已被其他任务占用: ${plan.outputPath}`);
      return;
    }

    lastTaskId.value = taskId;
    activeTaskId.value = taskId;
    activeRightTab.value = "logs";
    customMessage.success("任务已提交");
  } finally {
    isSubmitting.value = false;
  }

  if (!taskId || !plan) return;

  const finalPlan = plan;
  const finalTaskId = taskId;
  startProcess(finalTaskId, finalPlan).catch((error) => {
    if (isCancellationError(error)) return;
    customMessage.error("处理失败");
  });
};

const stopTask = async () => {
  if (!activeTask.value || isStopping.value) return;
  isStopping.value = true;
  await killProcess(activeTaskId.value);
};

watch(
  () => {
    if (!activeTaskId.value) return "";
    const task = store.tasks.find((t) => t.id === activeTaskId.value);
    return task?.status ?? "removed";
  },
  (status) => {
    if (!activeTaskId.value) return;
    if (status === "removed" || isTerminalStatus(status)) {
      activeTaskId.value = "";
      isStopping.value = false;
    }
  }
);

// 监听全局 FFmpeg 事件
let unlisten: (() => void) | null = null;
onMounted(async () => {
  unlisten = await setupListeners();
});

onUnmounted(() => {
  if (unlisten) unlisten();
});

/**
 * 应用预设：将预设参数合并到当前参数
 */
const handleApplyPreset = (preset: import("../types").FFmpegPreset) => {
  applyPresetParams(params, preset.params);
  customMessage.success(`已应用预设: ${preset.name}`);
};

/**
 * 从自定义命令编辑器触发保存为预设（打开预设管理器的保存弹窗）
 */
const triggerSaveAsPreset = () => {
  presetManagerRef.value?.openSaveDialog();
};

/**
 * 保存当前参数为预设
 */
const handleSaveAsPreset = (name: string, description: string) => {
  const snapshot: Partial<import("../types").FFmpegParams> = {
    mode: params.mode,
    hwaccel: params.hwaccel,
    videoEncoder: params.videoEncoder,
    preset: params.preset,
    crf: params.crf,
    qualityMode: params.qualityMode,
    container: params.container,
    videoBitrate: params.videoBitrate,
    scale: params.scale,
    fps: params.fps,
    pixelFormat: params.pixelFormat,
    audioEncoder: params.audioEncoder,
    audioBitrate: params.audioBitrate,
    sampleRate: params.sampleRate,
    audioChannels: params.audioChannels,
    customArgs: params.customArgs,
    maxSizeMb: params.maxSizeMb,
    appendParamsToName: params.appendParamsToName,
  };
  store.saveAsPreset(name, description, snapshot);
};

// 自动更新输出文件名逻辑，手动命名后不再覆盖
watch(
  [
    () => params.mode,
    () => params.container,
    () => params.videoEncoder,
    () => params.preset,
    () => params.crf,
    () => params.qualityMode,
    () => params.videoBitrate,
    () => params.maxSizeMb,
    () => params.scale,
    () => params.fps,
    () => params.appendParamsToName,
    () => params.audioEncoder,
    () => params.audioBitrate,
    () => params.sampleRate,
    () => params.audioChannels,
    () => namingContext.value,
    () => currentFilePath.value,
  ],
  () => {
    if (!outputNameCustomized.value && currentFilePath.value) {
      outputName.value = buildAutoOutputName(params, namingContext.value);
    }
  },
  { immediate: true }
);
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
  border: var(--border-width) solid var(--border-color);
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
  border: var(--border-width) solid var(--border-color);
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

.output-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.output-name-label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-light);
}

.container-warning {
  margin-top: 12px;
}

.command-preview {
  margin-top: 16px;
  background: var(--input-bg);
  border-radius: 8px;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
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

.preview-actions {
  display: flex;
  align-items: center;
  gap: 4px;
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
  border-top: var(--border-width) solid var(--border-color);
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

.preset-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
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
