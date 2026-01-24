<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { MediaTask } from "../types";
import { XCircle, Trash2, Download, ExternalLink, Info, Music } from "lucide-vue-next";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { format } from "date-fns";
import ImageViewer from "@/components/common/ImageViewer.vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import { useAssetManager } from "@/composables/useAssetManager";

const props = defineProps<{
  task: MediaTask;
}>();

const store = useMediaGenStore();
const { getAssetUrl } = useAssetManager();

const statusClass = computed(() => `status-${props.task.status}`);
const resultAsset = computed(() => props.task.resultAsset);

const typeLabel = computed(() => {
  switch (props.task.type) {
    case "image":
      return "图片";
    case "video":
      return "视频";
    case "audio":
      return "音乐";
    default:
      return (props.task.type as string).toUpperCase();
  }
});

const typeTagType = computed(() => {
  switch (props.task.type) {
    case "image":
      return "";
    case "video":
      return "warning";
    case "audio":
      return "success";
    default:
      return "info";
  }
});

const assetUrl = ref("");

// 异步获取资产 URL
watch(
  resultAsset,
  async (newAsset) => {
    if (newAsset) {
      assetUrl.value = await getAssetUrl(newAsset);
    } else {
      assetUrl.value = "";
    }
  },
  { immediate: true }
);

const handleRemove = () => {
  store.removeTask(props.task.id);
};
</script>

<template>
  <div class="media-task-card" :class="statusClass">
    <div class="card-header">
      <div class="task-meta">
        <el-tag size="small" effect="dark" :type="typeTagType">
          {{ typeLabel }}
        </el-tag>
        <span class="time">{{ format(task.createdAt, "HH:mm:ss") }}</span>
      </div>
      <div class="task-actions">
        <el-button link @click="handleRemove">
          <el-icon><Trash2 /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="card-content">
      <div class="prompt-section">
        <p class="prompt-text">{{ task.input.prompt }}</p>
      </div>

      <div class="result-section">
        <!-- 加载中 -->
        <div
          v-if="task.status === 'processing' || task.status === 'pending'"
          class="loading-overlay"
        >
          <el-progress
            type="circle"
            :percentage="task.progress"
            :status="task.status === 'processing' ? '' : 'warning'"
            :width="80"
          >
            <template #default="{ percentage }">
              <div class="progress-content">
                <span class="percentage-value">{{ percentage }}%</span>
                <span class="percentage-label">{{ task.statusText || "排队中" }}</span>
              </div>
            </template>
          </el-progress>
        </div>

        <!-- 错误 -->
        <div v-else-if="task.status === 'error'" class="error-display">
          <el-icon color="var(--el-color-danger)" :size="40"><XCircle /></el-icon>
          <p class="error-msg">{{ task.error || "生成失败" }}</p>
          <el-button type="primary" size="small" plain>重试</el-button>
        </div>

        <!-- 成功结果 -->
        <div v-else-if="task.status === 'completed'" class="result-display">
          <template v-if="task.type === 'image' && assetUrl">
            <ImageViewer :src="assetUrl" class="result-preview" fit="contain" />
          </template>
          <template v-else-if="task.type === 'video' && assetUrl">
            <VideoPlayer :src="assetUrl" class="result-preview" />
          </template>
          <template v-else-if="task.type === 'audio' && assetUrl">
            <div class="audio-container">
              <el-icon :size="48" color="var(--el-color-success)"><Music /></el-icon>
              <AudioPlayer :src="assetUrl" class="audio-player" />
            </div>
          </template>
          <div v-else class="no-asset">资产已移除或无法加载</div>

          <div class="result-actions">
            <el-button-group>
              <el-button size="small" plain>
                <el-icon><Download /></el-icon>
                保存
              </el-button>
              <el-button size="small" plain>
                <el-icon><ExternalLink /></el-icon>
                详情
              </el-button>
            </el-button-group>
          </div>
        </div>
      </div>
    </div>

    <div class="card-footer">
      <div class="model-info">
        <el-icon><Info /></el-icon>
        <span>{{ task.input.modelId }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-task-card {
  box-sizing: border-box;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  margin-bottom: 16px;
  max-width: 500px;
}

.media-task-card * {
  box-sizing: border-box;
}

.media-task-card:hover {
  box-shadow: var(--el-box-shadow);
  border-color: var(--el-color-primary-light-5);
}

.card-header {
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.05);
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.card-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-text {
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
  color: var(--el-text-color-primary);
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.result-section {
  aspect-ratio: 16 / 9;
  background-color: var(--el-fill-color-darker);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loading-overlay,
.error-display,
.no-asset {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  text-align: center;
}

.progress-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.percentage-value {
  font-size: 16px;
  font-weight: bold;
}

.percentage-label {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.error-msg {
  font-size: 12px;
  color: var(--el-color-danger);
  margin: 0;
}

.result-display {
  width: 100%;
  height: 100%;
  position: relative;
}

.result-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.audio-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px;
}

.audio-player {
  width: 100%;
}

.result-actions {
  position: absolute;
  bottom: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.result-display:hover .result-actions {
  opacity: 1;
}

.card-footer {
  padding: 6px 12px;
  border-top: 1px solid var(--border-color);
  background-color: rgba(0, 0, 0, 0.02);
}

.model-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

/* 状态样式 */
.status-error {
  border-left: 4px solid var(--el-color-danger);
}

.status-processing {
  border-left: 4px solid var(--el-color-primary);
}

.status-completed {
  border-left: 4px solid var(--el-color-success);
}
</style>
