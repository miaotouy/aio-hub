<!-- Copyright 2025-2026 miaotouy(Github@miaotouy); SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="sequence-workspace">
    <section class="sequence-config">
      <InfoCard title="序列帧合成" :icon="Images">
        <div class="config-content">
          <div class="source-actions">
            <el-button
              :icon="FolderOpen"
              :disabled="busy || scanning"
              :loading="scanning"
              @click="chooseSource(true)"
              >选择渲染目录</el-button
            >
            <el-button
              :icon="Image"
              :disabled="busy || scanning"
              @click="chooseSource(false)"
              >选择其中一帧</el-button
            >
          </div>
          <p class="hint">按文件名中的帧编号识别序列，例如 render_0001.png。</p>
          <p v-if="directory" class="source-path" :title="directory">
            {{ directory }}
          </p>
          <el-form label-position="top" :disabled="busy || scanning">
            <el-form-item label="图像序列">
              <el-select
                v-model="selectedPattern"
                placeholder="选择目录后自动识别"
                class="full-width"
              >
                <el-option
                  v-for="item in sequences"
                  :key="item.pattern"
                  :value="item.pattern"
                  :label="`${item.pattern} · ${item.frames.length} 帧`"
                />
              </el-select>
            </el-form-item>
            <div class="form-grid">
              <el-form-item label="起始帧"
                ><el-input-number
                  v-model="startFrame"
                  :min="0"
                  :max="2147483647"
                  :precision="0"
                  controls-position="right"
              /></el-form-item>
              <el-form-item label="结束帧"
                ><el-input-number
                  v-model="endFrame"
                  :min="0"
                  :max="2147483647"
                  :precision="0"
                  controls-position="right"
              /></el-form-item>
            </div>
            <el-form-item label="帧率（fps）">
              <el-input-number
                v-model="frameRate"
                :min="0.001"
                :max="1000"
                :precision="3"
                controls-position="right"
              />
              <span class="field-hint"
                >与渲染项目的帧率一致，例如 24、25、30 或 29.97。</span
              >
            </el-form-item>
            <el-form-item label="配音 / 背景音频">
              <div class="audio-input full-width">
                <el-input
                  :model-value="audioPath"
                  readonly
                  placeholder="可选：音频文件或带音轨的视频"
                />
                <el-button
                  :icon="Music"
                  :loading="checkingAudio"
                  @click="chooseAudio"
                  >选择</el-button
                >
                <el-button v-if="audioPath" @click="audioPath = ''"
                  >清除</el-button
                >
              </div>
              <span class="field-hint"
                >取第一条音轨，与起始帧同时开始；长音频截断，短音频补静音。</span
              >
            </el-form-item>
            <div class="form-grid">
              <el-form-item label="视频编码">
                <el-select v-model="videoEncoder" class="full-width">
                  <el-option label="H.264（通用）" value="libx264" />
                  <el-option label="H.265 / HEVC" value="libx265" />
                  <el-option label="H.264 · NVIDIA" value="h264_nvenc" />
                  <el-option label="HEVC · NVIDIA" value="hevc_nvenc" />
                  <el-option label="H.264 · Intel" value="h264_qsv" />
                </el-select>
              </el-form-item>
              <el-form-item
                :label="`画质（${qualitySpec.label.toUpperCase()}，越低越清晰）`"
              >
                <el-input-number
                  v-model="quality"
                  :min="qualitySpec.min"
                  :max="qualitySpec.max"
                  :precision="0"
                  controls-position="right"
                />
              </el-form-item>
            </div>
            <el-form-item label="输出文件">
              <div class="audio-input full-width">
                <el-input
                  v-model="outputPath"
                  @input="outputCustomized = true"
                  placeholder="选择保存位置（MP4 / MOV / MKV）"
                />
                <el-button :icon="FolderOpen" @click="chooseOutput"
                  >浏览</el-button
                >
              </div>
            </el-form-item>
          </el-form>
          <el-alert
            v-if="planState.error"
            :title="planState.error"
            type="warning"
            :closable="false"
            show-icon
          />
        </div>
        <div class="submit-row">
          <el-button
            v-if="activeTask"
            type="danger"
            :icon="StopCircle"
            :loading="stopping"
            @click="stopTask"
            >停止合成</el-button
          >
          <el-button
            v-else
            type="primary"
            :icon="Play"
            :loading="submitting"
            :disabled="!planState.plan || scanning || checkingAudio"
            @click="submitTask"
            >开始合成</el-button
          >
          <span v-if="planState.plan" class="hint"
            >{{ frameCount }} 帧 ·
            {{ planState.plan.totalDuration?.toFixed(2) }} 秒</span
          >
        </div>
      </InfoCard>
    </section>
    <section class="sequence-preview">
      <InfoCard title="画面预览" :icon="Film">
        <div class="preview-stage">
          <VideoPlayer
            v-if="lastTask?.status === 'completed'"
            :key="lastTask.id"
            :src="convertFileSrc(lastTask.outputPath)"
            :title="lastTask.name"
          />
          <img
            v-else-if="previewPath && !previewFailed"
            :key="previewPath"
            :src="convertFileSrc(previewPath)"
            alt="起始帧预览"
            @error="previewFailed = true"
          />
          <div v-else class="preview-placeholder">
            <Images :size="40" /><span>{{
              sequence
                ? "此格式可交由 FFmpeg 解码合成"
                : "选择渲染目录或一张序列帧"
            }}</span>
          </div>
        </div>
        <p v-if="sequence?.suffix.toLowerCase().endsWith('.exr')" class="hint">
          EXR 等线性 / HDR 素材建议先在渲染软件中完成色彩转换。
        </p>
        <div v-if="lastTask" class="task-feedback">
          <div class="task-heading">
            <span>{{ statusLabels[lastTask.status] }}</span
            ><span class="hint">{{ lastTask.name }}</span>
          </div>
          <el-progress
            v-if="lastTask.status === 'processing'"
            :percentage="lastTask.progress.percent"
            :indeterminate="isProgressIndeterminate(lastTask.progress)"
            :format="formatPercent"
          />
          <el-alert
            v-if="lastTask.error"
            :title="lastTask.error"
            type="error"
            :closable="false"
          />
          <div v-if="lastTask.status === 'completed'" class="result-row">
            <span class="source-path">{{ lastTask.outputPath }}</span
            ><el-button :icon="FolderOpen" @click="revealOutput"
              >定位文件</el-button
            >
          </div>
        </div>
      </InfoCard>
      <InfoCard title="命令预览" :icon="Terminal">
        <template #headerExtra
          ><el-button
            link
            :icon="Copy"
            :disabled="!planState.plan"
            @click="copyCommand"
            >复制 PowerShell 命令</el-button
          ></template
        >
        <code class="command-preview">{{
          planState.plan
            ? formatPowerShellCommand(planState.plan)
            : "选择序列帧并配置输出后显示命令"
        }}</code>
      </InfoCard>
      <el-collapse class="logs-panel"
        ><el-collapse-item title="处理日志" name="logs"
          ><FFmpegConsole :logs="lastTask?.logs ?? []" /></el-collapse-item
      ></el-collapse>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Images,
  Image,
  FolderOpen,
  Music,
  Film,
  Play,
  StopCircle,
  Terminal,
  Copy,
} from "lucide-vue-next";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { basename, dirname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ElMessageBox } from "element-plus";
import InfoCard from "@/components/common/InfoCard.vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import FFmpegConsole from "./FFmpegConsole.vue";
import { useFFmpegStore } from "../ffmpegStore";
import { useFFmpegCore } from "../composables/useFFmpegCore";
import {
  buildExecutionPlan,
  formatPowerShellCommand,
  resolveVideoQuality,
} from "../utils/executionPlan";
import {
  discoverImageSequences,
  getImageSequenceRange,
  joinSequencePath,
  SEQUENCE_IMAGE_EXTENSIONS,
  type ImageSequence,
} from "../utils/imageSequence";
import {
  isCancellationError,
  isProgressIndeterminate,
  normalizeOutputPathKey,
} from "../utils/lifecycle";
import { sanitizeOutputName } from "../utils/naming";

const formatPercent = (percent: number) => `${percent.toFixed(1)}%`;

const store = useFFmpegStore();
const { activeFfmpegPath, getMetadata, startProcess, killProcess } =
  useFFmpegCore();
const errorHandler = createModuleErrorHandler("FFmpegImageSequence");
const directory = ref("");
const sequences = ref<ImageSequence[]>([]);
const selectedPattern = ref("");
const sequence = computed(() =>
  sequences.value.find((item) => item.pattern === selectedPattern.value)
);
const startFrame = ref(1);
const endFrame = ref(1);
const frameRate = ref(24);
const audioPath = ref("");
const outputPath = ref("");
const outputCustomized = ref(false);
const videoEncoder = ref("libx264");
const quality = ref(18);
const qualitySpec = computed(() => resolveVideoQuality(videoEncoder.value));
const scanning = ref(false);
const checkingAudio = ref(false);
const submitting = ref(false);
const stopping = ref(false);
const lastTaskId = ref("");
const lastTask = computed(() =>
  store.tasks.find((task) => task.id === lastTaskId.value)
);
const activeTask = computed(() =>
  lastTask.value && ["pending", "processing"].includes(lastTask.value.status)
    ? lastTask.value
    : undefined
);
const busy = computed(
  () => submitting.value || checkingAudio.value || !!activeTask.value
);
const statusLabels = {
  pending: "等待合成",
  processing: "正在合成",
  completed: "合成完成",
  failed: "合成失败",
  cancelled: "已停止",
};
const frameCount = computed(() => endFrame.value - startFrame.value + 1);
const previewFailed = ref(false);
const previewPath = computed(() => {
  const frame = sequence.value?.frames.find(
    (item) => item.number === startFrame.value
  );
  return frame ? joinSequencePath(directory.value, frame.name) : "";
});
watch(previewPath, () => {
  previewFailed.value = false;
});
watch(sequence, (item) => {
  if (!item) return;
  startFrame.value = item.frames[0].number;
  endFrame.value = item.frames[item.frames.length - 1].number;
  if (!outputCustomized.value) {
    const name = sanitizeOutputName(
      `${item.prefix.replace(/[_ .-]+$/, "") || "序列帧"}_合成.mp4`
    );
    outputPath.value = joinSequencePath(
      store.config.defaultWorkDir || directory.value,
      name
    );
  }
});
watch(videoEncoder, () => {
  quality.value = Math.max(
    qualitySpec.value.min,
    Math.min(quality.value, qualitySpec.value.max)
  );
});
const planState = computed(() => {
  if (!sequence.value) return { plan: null, error: "" };
  try {
    if (
      !Number.isInteger(quality.value) ||
      quality.value < qualitySpec.value.min ||
      quality.value > qualitySpec.value.max
    )
      throw new Error("请输入编码器支持的画质值");
    if (!/\.(mp4|mov|mkv)$/i.test(outputPath.value.trim()))
      throw new Error("输出文件请选择 MP4、MOV 或 MKV 格式");
    return {
      plan: buildExecutionPlan(
        {
          mode: "video",
          inputPath: "",
          outputPath: outputPath.value.trim(),
          ffmpegPath: activeFfmpegPath.value,
          hwaccel: false,
          videoEncoder: videoEncoder.value,
          qualityMode: "quality",
          crf: quality.value,
          preset: "medium",
          pixelFormat: "yuv420p",
        },
        {
          imageSequence: {
            directory: directory.value,
            sequence: sequence.value,
            startFrame: startFrame.value,
            endFrame: endFrame.value,
            frameRate: frameRate.value,
            audioPath: audioPath.value || undefined,
          },
        }
      ),
      error: "",
    };
  } catch (error) {
    return {
      plan: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

async function chooseSource(folder: boolean) {
  if (busy.value || scanning.value) return;
  scanning.value = true;
  try {
    await errorHandler.wrapAsync(
      async () => {
        const selected = await open({
          directory: folder,
          multiple: false,
          title: folder ? "选择序列帧目录" : "选择任意一帧",
          ...(!folder
            ? {
                filters: [
                  { name: "图像序列", extensions: SEQUENCE_IMAGE_EXTENSIONS },
                ],
              }
            : {}),
        });
        if (typeof selected !== "string") return;
        const path = folder ? selected : await dirname(selected);
        const entries = await readDir(path);
        const found = discoverImageSequences(
          entries.filter((entry) => entry.isFile).map((entry) => entry.name)
        );
        if (!found.length) {
          customMessage.warning("目录中未找到带帧编号的图像序列");
          return;
        }
        const fileName = folder ? "" : await basename(selected);
        const selectedSequence = folder
          ? found[0]
          : found.find((item) =>
              item.frames.some((frame) => frame.name === fileName)
            );
        if (!selectedSequence) {
          customMessage.warning(
            "所选图像的文件名需要包含帧编号，例如 render_0001.png"
          );
          return;
        }
        directory.value = path;
        sequences.value = found;
        selectedPattern.value = selectedSequence.pattern;
        lastTaskId.value = "";
      },
      { userMessage: "读取序列帧失败" }
    );
  } finally {
    scanning.value = false;
  }
}

async function chooseAudio() {
  if (busy.value || checkingAudio.value) return;
  checkingAudio.value = true;
  try {
    await errorHandler.wrapAsync(
      async () => {
        const selected = await open({
          multiple: false,
          title: "选择音频或视频音轨",
          filters: [
            {
              name: "音频 / 视频",
              extensions: [
                "wav",
                "mp3",
                "flac",
                "aac",
                "m4a",
                "ogg",
                "opus",
                "aiff",
                "aif",
                "wma",
                "mp4",
                "mov",
                "mkv",
                "webm",
                "avi",
                "m4v",
                "ts",
              ],
            },
          ],
        });
        if (typeof selected !== "string") return;
        const metadata = await getMetadata(selected);
        if (!metadata) return;
        if (!metadata.hasAudio) {
          customMessage.warning(
            "所选文件没有可用音轨，请选择带音轨的音频或视频"
          );
          return;
        }
        audioPath.value = selected;
      },
      { userMessage: "选择配音文件失败" }
    );
  } finally {
    checkingAudio.value = false;
  }
}

async function chooseOutput() {
  await errorHandler.wrapAsync(
    async () => {
      const path = await save({
        defaultPath: outputPath.value || "序列帧_合成.mp4",
        filters: [{ name: "视频", extensions: ["mp4", "mov", "mkv"] }],
      });
      if (path) {
        outputPath.value = path;
        outputCustomized.value = true;
      }
    },
    { userMessage: "选择输出文件失败" }
  );
}

async function submitTask() {
  const plan = planState.value.plan;
  const selectedSequence = sequence.value;
  if (
    !plan ||
    !selectedSequence ||
    busy.value ||
    scanning.value ||
    checkingAudio.value
  )
    return;
  submitting.value = true;
  try {
    await errorHandler.wrapAsync(
      async () => {
        if (store.activeTasks.length >= store.config.maxConcurrentTasks) {
          customMessage.warning("当前处理任务已达到并发上限，请等待任务完成");
          return;
        }
        if (store.isOutputPathReserved(plan.outputPath)) {
          customMessage.warning("此输出文件正在被其他任务使用，请更换保存位置");
          return;
        }
        const outputKey = normalizeOutputPathKey(plan.outputPath);
        if (
          outputKey === normalizeOutputPathKey(audioPath.value) ||
          selectedSequence.frames.some(
            (frame) =>
              outputKey ===
              normalizeOutputPathKey(
                joinSequencePath(directory.value, frame.name)
              )
          )
        ) {
          customMessage.error("输出路径与输入文件相同，请更换保存位置");
          return;
        }
        // 重新读取目录，在提交前发现渲染文件新增、删除或缺失。
        const entries = await readDir(directory.value);
        const current = discoverImageSequences(
          entries.filter((entry) => entry.isFile).map((entry) => entry.name)
        ).find((item) => item.pattern === selectedSequence.pattern);
        if (!current) throw new Error("序列帧已发生变化，请重新选择目录");
        getImageSequenceRange(current, startFrame.value, endFrame.value);
        if (audioPath.value) {
          const metadata = await getMetadata(audioPath.value);
          if (!metadata) return;
          if (!metadata.hasAudio) {
            customMessage.error("配音文件没有可用音轨，请重新选择");
            return;
          }
        }
        if (await invoke<boolean>("path_exists", { path: plan.outputPath })) {
          try {
            await ElMessageBox.confirm(
              "输出文件已存在，是否覆盖？",
              "确认覆盖",
              { lockScroll: false, type: "warning" }
            );
          } catch {
            return;
          }
        }
        const task = store.addTask({
          name: await basename(plan.outputPath),
          inputPath: plan.inputPath,
          outputPath: plan.outputPath,
          mode: "video",
        });
        if (!store.reserveOutputPath(task.id, plan.outputPath)) {
          store.removeTask(task.id);
          customMessage.warning("此输出文件正在被其他任务使用");
          return;
        }
        lastTaskId.value = task.id;
        void startProcess(task.id, plan).catch((error) => {
          if (!isCancellationError(error))
            customMessage.error("合成失败，可展开处理日志查看原因");
        });
      },
      { userMessage: "提交序列帧合成失败" }
    );
  } finally {
    submitting.value = false;
  }
}

async function stopTask() {
  if (!activeTask.value || stopping.value) return;
  stopping.value = true;
  try {
    await killProcess(activeTask.value.id);
  } finally {
    stopping.value = false;
  }
}
async function copyCommand() {
  const plan = planState.value.plan;
  if (!plan) return;
  await errorHandler.wrapAsync(
    async () => {
      await writeText(formatPowerShellCommand(plan));
      customMessage.success("命令已复制");
    },
    { userMessage: "复制命令失败" }
  );
}
async function revealOutput() {
  if (!lastTask.value) return;
  await errorHandler.wrapAsync(
    () =>
      invoke("open_file_directory", { filePath: lastTask.value!.outputPath }),
    { userMessage: "定位输出文件失败" }
  );
}
</script>

<style scoped>
.sequence-workspace {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(380px, 460px) minmax(0, 1fr);
  gap: 20px;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}
.sequence-config,
.sequence-preview {
  min-width: 0;
}
.sequence-config {
  min-height: 0;
}
.sequence-config :deep(.info-card) {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.sequence-config :deep(.info-card:not(.is-bare) > .el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.config-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.sequence-preview {
  overflow: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.source-actions,
.audio-input,
.submit-row,
.task-heading,
.result-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.submit-row {
  margin-top: 0;
  flex-wrap: wrap;
  padding: 16px;
  flex-shrink: 0;
  border-top: var(--border-width) solid var(--border-color);
}
.hint,
.field-hint {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.field-hint {
  display: block;
  margin-top: 6px;
}
.source-path {
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--text-secondary);
}
.full-width {
  width: 100%;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-grid :deep(.el-input-number) {
  width: 100%;
}
.preview-stage {
  height: clamp(240px, 36vh, 460px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.preview-stage > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.preview-stage :deep(.video-player-host) {
  width: 100%;
  height: 100%;
}
.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--text-secondary);
}
.task-feedback {
  margin-top: 16px;
}
.task-heading {
  justify-content: space-between;
  margin-bottom: 12px;
  color: var(--text-primary);
}
.result-row {
  justify-content: space-between;
}
.command-preview {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-primary);
}
.logs-panel {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 0 16px;
  border: var(--border-width) solid var(--border-color);
}
.logs-panel :deep(.ffmpeg-console) {
  height: 260px;
}
@media (max-width: 1000px) {
  .sequence-workspace {
    grid-template-columns: 1fr;
    overflow: auto;
  }
  .sequence-config :deep(.info-card) {
    height: auto;
  }
  .config-content,
  .sequence-preview {
    overflow: visible;
  }
}
</style>
