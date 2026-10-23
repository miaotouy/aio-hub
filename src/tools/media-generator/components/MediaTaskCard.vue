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
import { ref, computed, onMounted, onUnmounted, watch, h } from "vue";
import { format } from "date-fns";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { ElMessageBox } from "element-plus";
import {
  Film,
  Mic,
  Music,
  Image as ImageIcon,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
  XCircle,
  RefreshCcw,
  Download,
  Trash2 as TrashIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  FolderOpen,
} from "lucide-vue-next";
import type { MediaTask } from "../types";
import { useAssetManager } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { useMediaGenStore } from "../stores/mediaGenStore";
import AudioWaveform from "@/components/common/AudioWaveform.vue";

const props = defineProps<{
  task: MediaTask;
  layout?: "grid" | "list";
}>();

const emit = defineEmits<{
  (e: "remove", id: string): void;
  (e: "cancel", id: string): void;
  (e: "retry", task: MediaTask): void;
  (e: "download", task: MediaTask): void;
  (e: "copyPrompt", prompt: string): void;
  (e: "copyResult", task: MediaTask): void;
  (e: "open", task: MediaTask): void;
}>();

const {
  getAssetUrl,
  getAssetBasePath,
  convertToAssetProtocol,
  ensureAudioWaveform,
  getAssetById,
} = useAssetManager();
const imageViewer = useImageViewer();
const store = useMediaGenStore();

// 结果多图支持
const resultAssetUrls = ref<string[]>([]);
const activeResultIndex = ref(0);
const referenceAssetUrls = ref<string[]>([]);
const videoPosterUrl = ref<string>("");

const hasReferenceImages = computed(() => referenceAssetUrls.value.length > 0);
const hasMultipleResults = computed(() => resultAssetUrls.value.length > 1);
const listReferencePreviewUrls = computed(() =>
  referenceAssetUrls.value.slice(0, 2)
);

const showFullError = () => {
  ElMessageBox.alert(props.task.error || "生成失败", "错误详情", {
    confirmButtonText: "关闭",
    lockScroll: false,
    customStyle: {
      maxWidth: "560px",
      width: "560px",
    },
    message: h(
      "p",
      {
        style: {
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: "50vh",
          overflowY: "auto",
          lineHeight: 1.6,
        },
      },
      props.task.error || "生成失败"
    ),
  });
};

const showFullPrompt = () => {
  ElMessageBox.alert(
    h(
      "pre",
      {
        style: {
          margin: 0,
          maxHeight: "60vh",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          lineHeight: 1.6,
          fontFamily: "inherit",
        },
      },
      props.task.input.prompt
    ),
    "完整提示词",
    {
      confirmButtonText: "关闭",
      lockScroll: false,
      customStyle: {
        width: "720px",
        maxWidth: "calc(100vw - 48px)",
      },
    }
  );
};

const getResultAssets = () =>
  props.task.resultAssets?.length
    ? props.task.resultAssets
    : props.task.resultAsset
      ? [props.task.resultAsset]
      : [];

const loadResultUrls = async () => {
  const assets = getResultAssets();
  if (assets.length === 0) {
    resultAssetUrls.value = [];
    videoPosterUrl.value = "";
    return;
  }
  const urls: string[] = [];
  for (const asset of assets) {
    const url = await getAssetUrl(asset);
    if (url) urls.push(url);

    if (asset.type === "video") {
      let currentAsset = asset;
      if (!currentAsset.thumbnailPath) {
        try {
          const latest = await getAssetById(asset.id);
          if (latest) {
            currentAsset = latest;
          }
        } catch (e) {
          console.error("获取最新资产失败", e);
        }
      }
      if (currentAsset.thumbnailPath) {
        videoPosterUrl.value = await getAssetUrl(currentAsset, true);
      }
    }
  }
  resultAssetUrls.value = urls;
  // 重置索引
  if (activeResultIndex.value >= urls.length) {
    activeResultIndex.value = 0;
  }
};

const loadReferenceUrls = async () => {
  const paths = props.task.input.referenceAssetIds;
  if (!paths || paths.length === 0) {
    referenceAssetUrls.value = [];
    return;
  }
  const basePath = await getAssetBasePath();
  const urls: string[] = [];
  for (const path of paths) {
    if (!path) continue;
    // referenceAssetIds 实际存储的是资产相对路径，直接转换为协议 URL
    const url = convertToAssetProtocol(path, basePath);
    if (url) urls.push(url);
  }
  referenceAssetUrls.value = urls;
};

/** 点击参考图 → 打开预览，支持切换 */
const openReferencePreview = (index: number) => {
  if (referenceAssetUrls.value.length > 0) {
    imageViewer.show(referenceAssetUrls.value, index);
  }
};

/** 切换结果图索引 */
const prevResult = () => {
  if (activeResultIndex.value > 0) activeResultIndex.value--;
};
const nextResult = () => {
  if (activeResultIndex.value < resultAssetUrls.value.length - 1)
    activeResultIndex.value++;
};

/** 音频波形数据（从 resultAsset 的 metadata 中提取） */
const audioWaveform = ref<number[]>([]);
const samplingAssetIds = new Set<string>();
const localWaveformCache = new Map<string, number[]>();
let isUnmounted = false;

/** 加载音频波形数据 */
const loadAudioWaveform = async () => {
  const assets = getResultAssets();
  const asset = assets[activeResultIndex.value] || assets[0];
  if (!asset || asset.type !== "audio") {
    audioWaveform.value = [];
    return;
  }

  // 1. 优先从本地组件缓存中获取，避免重复的 IPC 状态查询
  if (localWaveformCache.has(asset.id)) {
    audioWaveform.value = localWaveformCache.get(asset.id)!;
    return;
  }

  // 2. 如果传入的资产对象本身就带有波形数据，直接缓存并使用
  if (asset.metadata?.audioWaveform?.length) {
    localWaveformCache.set(asset.id, asset.metadata.audioWaveform);
    audioWaveform.value = asset.metadata.audioWaveform;
    return;
  }

  // 没有波形数据，尝试在后台采样（内部会先校验后端数据库，有了就不重复采样）
  if (samplingAssetIds.has(asset.id)) return;
  samplingAssetIds.add(asset.id);
  try {
    const updatedAsset = await ensureAudioWaveform(asset);
    if (isUnmounted) return;

    const currentAssets = getResultAssets();
    const currentAsset =
      currentAssets[activeResultIndex.value] || currentAssets[0];
    if (
      currentAsset?.id === asset.id &&
      updatedAsset.metadata?.audioWaveform?.length
    ) {
      localWaveformCache.set(asset.id, updatedAsset.metadata.audioWaveform);
      audioWaveform.value = updatedAsset.metadata.audioWaveform;

      // 4. 将更新后的资产写回到全局任务状态和会话节点中，实现状态自愈与持久化闭环
      try {
        // 更新全局任务池状态
        store.updateTaskStatus(props.task.id, props.task.status, {
          resultAsset: updatedAsset,
          resultAssets: [updatedAsset],
        });

        // 如果关联了会话节点，同步更新节点快照以持久化到本地 JSON
        const node = store.nodes[props.task.id];
        if (node) {
          const updatedTask = {
            ...props.task,
            resultAsset: updatedAsset,
            resultAssets: [updatedAsset],
          };
          store.updateNodeData(props.task.id, {
            metadata: {
              ...node.metadata,
              taskSnapshot: updatedTask,
            },
          });
        }
      } catch (err) {
        console.error("同步更新音频波形任务状态失败", err);
      }
    }
  } finally {
    samplingAssetIds.delete(asset.id);
  }
};

onMounted(() => {
  loadResultUrls();
  loadReferenceUrls();
  loadAudioWaveform();
});

watch(
  () => [props.task.status, props.task.resultAsset, props.task.resultAssets],
  () => {
    loadResultUrls();
    loadAudioWaveform();
  },
  { deep: true }
);

watch(activeResultIndex, () => {
  loadAudioWaveform();
});

watch(
  () => props.task.input.referenceAssetIds,
  () => {
    loadReferenceUrls();
  },
  { deep: true }
);

onUnmounted(() => {
  isUnmounted = true;
  samplingAssetIds.clear();
});

const getTaskIcon = (type: string) => {
  switch (type) {
    case "video":
      return Film;
    case "speech":
      return Mic;
    case "music":
    case "audio":
      return Music;
    default:
      return ImageIcon;
  }
};

const getStatusType = (status: string) => {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "primary";
    case "error":
      return "danger";
    case "cancelled":
      return "info";
    default:
      return "info";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "已完成";
    case "processing":
      return "生成中";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    case "pending":
      return "排队中";
    default:
      return status;
  }
};

const getTaskResolution = (task: MediaTask) => {
  // 音频类型不显示分辨率（audio 已在 normalizeMediaTaskType 中归一化为 speech）
  if (task.type === "speech" || task.type === "music") {
    return "";
  }
  const asset = task.resultAssets?.[0] || task.resultAsset;
  if (asset?.metadata?.width && asset?.metadata?.height) {
    return `${asset.metadata.width}x${asset.metadata.height}`;
  }
  if (task.input.params?.size) {
    return task.input.params.size;
  }
  return "";
};

const handleVideoEnter = (e: Event) => {
  const video = e.target as HTMLVideoElement;
  if (video) {
    video.play().catch(() => {});
  }
};

const handleVideoLeave = (e: Event) => {
  const video = e.target as HTMLVideoElement;
  if (video) {
    video.pause();
  }
};

/** 打开文件所在位置 */
const openFileDirectory = async () => {
  const assets = getResultAssets();
  const asset = assets[activeResultIndex.value] || assets[0];
  if (!asset || !asset.path) return;
  try {
    const basePath = await getAssetBasePath();
    const absolutePath = await join(basePath, asset.path);
    await invoke("open_file_directory", { filePath: absolutePath });
  } catch (err) {
    console.error("打开文件所在目录失败", err);
  }
};
</script>

<template>
  <div
    class="task-card"
    :class="[task.status, { 'task-card-list': layout === 'list' }]"
  >
    <!-- 卡片头部 -->
    <div class="task-header">
      <div class="task-type">
        <el-icon><component :is="getTaskIcon(task.type)" /></el-icon>
        <span class="model-name">{{ task.input.modelId }}</span>
      </div>
      <div class="task-time">
        <el-icon><Clock /></el-icon>
        <span>{{ format(task.createdAt, "HH:mm:ss") }}</span>
      </div>
    </div>

    <!-- 任务内容预览 -->
    <div class="task-content">
      <div class="prompt-wrapper">
        <div
          class="prompt-preview"
          :title="layout === 'list' ? undefined : task.input.prompt"
        >
          {{ task.input.prompt }}
        </div>
        <div class="prompt-actions">
          <el-tooltip
            v-if="layout === 'list'"
            content="查看完整提示词"
            placement="top"
          >
            <el-button
              :icon="Maximize2"
              link
              class="expand-prompt-btn"
              aria-label="查看完整提示词"
              @click="showFullPrompt"
            />
          </el-tooltip>
          <el-tooltip content="复制提示词" placement="top">
            <el-button
              :icon="Copy"
              link
              class="copy-prompt-btn"
              aria-label="复制提示词"
              @click="emit('copyPrompt', task.input.prompt)"
            />
          </el-tooltip>
          <el-tooltip
            v-if="layout === 'list' && hasReferenceImages"
            :content="`查看 ${referenceAssetUrls.length} 张参考图`"
            placement="top"
          >
            <el-button
              :icon="ImageIcon"
              link
              class="reference-count-trigger"
              :aria-label="`查看 ${referenceAssetUrls.length} 张参考图`"
              @click="openReferencePreview(0)"
            >
              {{ referenceAssetUrls.length }}
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <!-- 结果展示区域 -->
      <div class="result-row" :class="{ 'has-reference': hasReferenceImages }">
        <!-- 列表模式压缩显示参考图；网格模式保留完整参考图列表。 -->
        <div
          v-if="layout === 'list' && hasReferenceImages"
          class="reference-panel"
        >
          <div class="reference-label">
            参考图 ({{ referenceAssetUrls.length }})
          </div>
          <div class="reference-list">
            <div
              v-for="(url, idx) in listReferencePreviewUrls"
              :key="idx"
              class="reference-thumb"
              @click="openReferencePreview(idx)"
            >
              <img :src="url" alt="参考图" loading="lazy" />
              <div class="reference-overlay">
                <el-icon><ExternalLink /></el-icon>
              </div>
            </div>
            <button
              v-if="referenceAssetUrls.length > listReferencePreviewUrls.length"
              type="button"
              class="reference-thumb reference-more"
              :aria-label="`查看其余 ${referenceAssetUrls.length - listReferencePreviewUrls.length} 张参考图`"
              @click="openReferencePreview(listReferencePreviewUrls.length)"
            >
              +{{ referenceAssetUrls.length - listReferencePreviewUrls.length }}
            </button>
          </div>
        </div>
        <div v-else-if="hasReferenceImages" class="reference-panel">
          <div class="reference-label">
            参考图 ({{ referenceAssetUrls.length }})
          </div>
          <div class="reference-list">
            <div
              v-for="(url, idx) in referenceAssetUrls"
              :key="idx"
              class="reference-thumb"
              @click="openReferencePreview(idx)"
            >
              <img :src="url" alt="reference" loading="lazy" />
              <div class="reference-overlay">
                <el-icon><ExternalLink /></el-icon>
              </div>
            </div>
          </div>
        </div>

        <!-- 结果区域 -->
        <div class="result-area">
          <!-- 完成状态：显示缩略图/视频 -->
          <template v-if="task.status === 'completed'">
            <div class="media-preview" @click="emit('open', task)">
              <img
                v-if="task.type === 'image'"
                :src="resultAssetUrls[activeResultIndex] || ''"
                alt="result"
                loading="lazy"
              />
              <div
                v-else-if="task.type === 'video'"
                class="video-preview-wrapper"
              >
                <video
                  :src="resultAssetUrls[activeResultIndex] || ''"
                  :poster="videoPosterUrl"
                  muted
                  loop
                  playsinline
                  preload="none"
                  @mouseenter="handleVideoEnter"
                  @mouseleave="handleVideoLeave"
                  class="video-preview"
                ></video>
                <div class="video-badge">
                  <el-icon><Film /></el-icon>
                </div>
              </div>
              <div v-else class="audio-preview">
                <AudioWaveform
                  :waveform="audioWaveform"
                  :height="80"
                  :bar-width="4"
                  :bar-gap="2"
                  color="var(--el-color-primary)"
                />
                <div class="audio-overlay">
                  <el-icon><ExternalLink /></el-icon>
                  <span>{{
                    task.type === "speech" ? "点击播放语音" : "点击播放音乐"
                  }}</span>
                </div>
              </div>
              <div class="overlay">
                <el-icon><ExternalLink /></el-icon>
              </div>
              <div v-if="getTaskResolution(task)" class="media-info-tag">
                {{ getTaskResolution(task) }}
              </div>
            </div>
            <!-- 多图切换指示器 -->
            <div v-if="hasMultipleResults" class="result-nav">
              <button
                class="nav-btn"
                :disabled="activeResultIndex === 0"
                @click.stop="prevResult"
              >
                <el-icon><ChevronLeft /></el-icon>
              </button>
              <span class="nav-indicator"
                >{{ activeResultIndex + 1 }} /
                {{ resultAssetUrls.length }}</span
              >
              <button
                class="nav-btn"
                :disabled="activeResultIndex === resultAssetUrls.length - 1"
                @click.stop="nextResult"
              >
                <el-icon><ChevronRight /></el-icon>
              </button>
            </div>
          </template>

          <!-- 处理中状态 -->
          <template v-else-if="task.status === 'processing'">
            <div class="status-container processing">
              <el-icon class="is-loading"><Loader2 /></el-icon>
              <div class="progress-info">
                <el-progress
                  :percentage="task.progress"
                  :stroke-width="4"
                  striped
                  striped-flow
                  :show-text="false"
                />
                <span class="status-text">{{
                  task.statusText || "正在生成中..."
                }}</span>
              </div>
            </div>
          </template>

          <!-- 错误状态 -->
          <template v-else-if="task.status === 'error'">
            <div class="status-container error">
              <el-icon><AlertCircle /></el-icon>
              <el-tooltip
                :content="task.error || '生成失败'"
                placement="top"
                popper-class="media-task-error-tooltip"
                :show-after="300"
              >
                <span class="error-msg clickable" @click="showFullError">
                  {{ task.error || "生成失败" }}
                </span>
              </el-tooltip>
            </div>
          </template>

          <!-- 等待状态 -->
          <template v-else>
            <div class="status-container pending">
              <el-icon><Clock /></el-icon>
              <span>排队等待中...</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 卡片底部操作栏 -->
    <div class="task-footer">
      <el-tag
        :type="getStatusType(task.status)"
        size="small"
        class="status-tag"
      >
        {{ getStatusLabel(task.status) }}
      </el-tag>

      <div class="actions">
        <el-tooltip
          v-if="task.status === 'processing' || task.status === 'pending'"
          content="取消任务"
          placement="top"
        >
          <el-button
            :icon="XCircle"
            circle
            size="small"
            type="warning"
            plain
            @click="emit('cancel', task.id)"
          />
        </el-tooltip>
        <el-tooltip
          content="重新生成（填充提示词与参考图到输入框）"
          placement="top"
        >
          <el-button
            :icon="RefreshCcw"
            circle
            size="small"
            @click="emit('retry', task)"
          />
        </el-tooltip>
        <el-tooltip
          v-if="task.status === 'completed'"
          content="复制结果"
          placement="top"
        >
          <el-button
            :icon="Copy"
            circle
            size="small"
            @click="emit('copyResult', task)"
          />
        </el-tooltip>
        <el-tooltip
          v-if="task.status === 'completed'"
          content="下载"
          placement="top"
        >
          <el-button
            :icon="Download"
            circle
            size="small"
            @click="emit('download', task)"
          />
        </el-tooltip>
        <el-tooltip
          v-if="task.status === 'completed'"
          content="打开文件所在位置"
          placement="top"
        >
          <el-button
            :icon="FolderOpen"
            circle
            size="small"
            @click="openFileDirectory"
          />
        </el-tooltip>
        <el-tooltip content="删除" placement="top">
          <el-button
            :icon="TrashIcon"
            circle
            size="small"
            type="danger"
            plain
            @click="emit('remove', task.id)"
          />
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
  height: 350px; /* 统一卡片高度 */
}

.task-card:hover {
  transform: translateY(-2px);
  border-color: var(--el-color-primary-light-5);
  box-shadow: var(--el-box-shadow-light);
}

.task-card-list {
  display: grid;
  grid-template-columns:
    minmax(145px, 180px) minmax(280px, 1fr) minmax(208px, 228px)
    minmax(208px, 232px);
  align-items: center;
  width: 100%;
  height: 88px;
  border-radius: 8px;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.task-card-list:hover {
  transform: none;
}

.task-card-list .task-header {
  grid-column: 1;
  min-width: 0;
  height: 100%;
  padding: 8px 10px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  border-right: var(--border-width) solid var(--border-color);
  border-bottom: 0;
}

.task-card-list .task-type {
  width: 100%;
  min-width: 0;
}

.task-card-list .task-time {
  font-size: 10px;
}

.task-card-list .task-content {
  display: contents;
}

.task-card-list .prompt-wrapper {
  grid-column: 2;
  align-items: center;
  height: 100%;
  min-width: 0;
  padding: 8px 12px;
  border-right: var(--border-width) solid var(--border-color);
}

.task-card-list .prompt-preview {
  min-height: 0;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.prompt-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
}

.task-card-list .prompt-actions .el-button {
  width: 26px;
  height: 26px;
  margin-left: 0;
  padding: 4px;
}

.task-card-list .copy-prompt-btn,
.task-card-list .expand-prompt-btn {
  opacity: 0.7;
}

.task-card-list .result-row {
  grid-column: 3;
  align-items: center;
  width: auto;
  height: 100%;
  flex: none;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border-right: var(--border-width) solid var(--border-color);
}

.task-card-list .result-row.has-reference .reference-panel {
  flex: 0 0 100px;
  height: 100%;
  justify-content: center;
  gap: 4px;
  overflow: hidden;
}

.task-card-list .reference-label {
  font-size: 9px;
  line-height: 12px;
  text-align: center;
}

.task-card-list .reference-list {
  display: flex;
  flex: none;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  max-height: none;
  overflow: hidden;
}

.task-card-list .reference-thumb {
  width: 28px;
  height: 28px;
  box-sizing: border-box;
  border-radius: 4px;
}

.task-card-list .reference-more {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--el-text-color-secondary);
  font-family: inherit;
  font-size: 10px;
  background-color: var(--el-fill-color);
}

.task-card-list .reference-more:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

.task-card-list .result-area {
  flex: 1;
  width: auto;
  min-width: 84px;
  height: 100%;
  aspect-ratio: unset;
}

.task-card-list .status-container {
  gap: 5px;
  padding: 6px;
  font-size: 11px;
}

.task-card-list .status-container .is-loading {
  font-size: 18px;
}

.task-card-list .progress-info {
  gap: 4px;
}

.task-card-list .status-text {
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-card-list .error-msg {
  font-size: 10px;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.task-card-list .task-footer {
  grid-column: 4;
  min-width: 0;
  height: 100%;
  padding: 8px 10px;
  gap: 8px;
  border-top: 0;
  border-left: var(--border-width) solid var(--border-color);
}

.task-card-list .actions {
  gap: 2px;
  flex-shrink: 0;
}

.task-card-list .actions :deep(.el-button) {
  width: 26px;
  height: 26px;
  margin-left: 0;
  padding: 4px;
}

.task-card-list .reference-count-trigger {
  display: none;
}

.task-header {
  flex-shrink: 0;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: rgba(0, 0, 0, 0.02);
}

.task-type {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 500;
}

.model-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  opacity: 0.8;
}

.task-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.task-content {
  min-height: 0;
  overflow: hidden;
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.prompt-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  position: relative;
}

.prompt-preview {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 36px;
  flex: 1;
}

.copy-prompt-btn {
  padding: 2px;
  height: auto;
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--el-text-color-secondary);
}

.copy-prompt-btn:hover {
  color: var(--el-color-primary);
  background-color: transparent;
}

.prompt-wrapper:hover .copy-prompt-btn {
  opacity: 1;
}
.result-row {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.result-row:not(.has-reference) .result-area {
  flex: 1;
}

.result-row.has-reference .reference-panel {
  flex: 0 0 72px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-row.has-reference .result-area {
  flex: 1;
  min-width: 0;
}

.reference-label {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  padding: 0 2px;
  flex-shrink: 0;
  white-space: nowrap;
}

.reference-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  max-height: calc(64px * 3 + 4px * 2);
  border-radius: 6px;
  scrollbar-width: thin;
}

.reference-list::-webkit-scrollbar {
  width: 3px;
}

.reference-list::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-lighter);
  border-radius: 2px;
}

.reference-thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--el-fill-color-lighter);
  border: var(--border-width) solid var(--border-color);
  cursor: pointer;
  position: relative;
  transition: border-color 0.2s;
}

.reference-thumb:hover {
  border-color: var(--el-color-primary-light-5);
}

.reference-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.reference-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
  font-size: 14px;
}

.reference-thumb:hover .reference-overlay {
  opacity: 1;
}

.result-area {
  min-height: 0;
  aspect-ratio: 16 / 9;
  background-color: var(--el-fill-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  border: var(--border-width) solid var(--border-color);
}

.media-preview {
  width: 100%;
  height: 100%;
  cursor: pointer;
  position: relative;
}

.media-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.video-preview-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: var(--el-fill-color-dark);
}

.video-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.video-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  backdrop-filter: blur(4px);
  z-index: 1;
}

.audio-preview {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background-color: rgba(0, 0, 0, 0.02);
}

.audio-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.audio-preview:hover .audio-overlay {
  opacity: 1;
}

.media-preview .overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
  font-size: 24px;
}

.media-preview:hover .overlay {
  opacity: 1;
}

/* 多图切换导航 */
.result-nav {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  padding: 2px 8px;
  z-index: 2;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: white;
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
  transition: background-color 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.2);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-indicator {
  font-size: 11px;
  color: white;
  font-family: monospace;
  white-space: nowrap;
}

.media-info-tag {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 1;
  font-family: monospace;
}

.status-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px;
  box-sizing: border-box;
}

.status-container.processing {
  color: var(--el-color-primary);
}

.status-container.error {
  color: var(--el-color-danger);
}

.status-container.pending {
  color: var(--el-text-color-placeholder);
}

.progress-info {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-text {
  font-size: 11px;
  text-align: center;
  opacity: 0.8;
}

.error-msg {
  font-size: 12px;
  text-align: center;
  line-height: 1.4;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
}

.error-msg.clickable {
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}

.error-msg.clickable:hover {
  color: var(--el-color-danger);
}

.task-footer {
  flex-shrink: 0;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: var(--border-width) solid var(--border-color);
}

.actions {
  display: flex;
  gap: 6px;
}

.is-loading {
  animation: rotating 2s linear infinite;
  font-size: 24px;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.el-button {
  margin-left: 4px;
}

@media (max-width: 1100px) {
  .task-card-list {
    grid-template-columns: minmax(120px, 150px) minmax(0, 1fr) 208px;
  }

  .task-card-list .prompt-wrapper {
    grid-column: 2;
    border-right: 0;
  }

  .task-card-list .result-row {
    display: none;
  }

  .task-card-list .task-footer {
    grid-column: 3;
    padding-inline: 8px;
    gap: 6px;
  }

  .task-card-list .reference-count-trigger {
    display: inline-flex;
    width: auto !important;
    min-width: 26px;
    gap: 3px;
    padding-inline: 4px !important;
  }
}

@media (max-width: 760px) {
  .task-card-list {
    grid-template-columns: minmax(104px, 124px) minmax(0, 1fr) 192px;
  }
}
</style>

<style>
.media-task-error-tooltip {
  max-width: 420px;
  line-height: 1.5;
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
