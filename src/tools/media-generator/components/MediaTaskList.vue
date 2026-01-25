<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaTaskManager } from "../composables/useMediaTaskManager";
import { createModuleLogger } from "@/utils/logger";
import { useAssetManager } from "@/composables/useAssetManager";
import { format } from "date-fns";
import {
  Image as ImageIcon,
  Film,
  Music,
  Trash2,
  RefreshCcw,
  Download,
  ExternalLink,
  Clock,
  AlertCircle,
  Loader2,
  Search,
  Trash2 as TrashIcon,
} from "lucide-vue-next";
import type { MediaTask, MediaTaskStatus, MediaTaskType } from "../types";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";

const store = useMediaGenStore();
const taskManager = useMediaTaskManager();
const logger = createModuleLogger("media-generator/task-list");
const { getAssetUrl } = useAssetManager();
const imageViewer = useImageViewer();
const videoViewer = useVideoViewer();
const audioViewer = useAudioViewer();

// 搜索和筛选状态
const searchQuery = ref("");
const filterType = ref<MediaTaskType | "all">("all");
const filterStatus = ref<MediaTaskStatus | "all">("all");

// 统计信息直接使用管理器的
const stats = taskManager.stats;

// 过滤后的任务列表，按时间倒序排列
const filteredTasks = computed(() => {
  let list = Array.isArray(taskManager.tasks.value) ? [...taskManager.tasks.value] : [];

  // 搜索过滤
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (t) =>
        t.input.prompt.toLowerCase().includes(q) || t.input.modelId.toLowerCase().includes(q)
    );
  }

  // 类型过滤
  if (filterType.value !== "all") {
    list = list.filter((t) => t.type === filterType.value);
  }

  // 状态过滤
  if (filterStatus.value !== "all") {
    list = list.filter((t) => t.status === filterStatus.value);
  }

  return list.sort((a, b) => b.createdAt - a.createdAt);
});

const getTaskIcon = (type: string) => {
  switch (type) {
    case "video":
      return Film;
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

const handleRemoveTask = (taskId: string) => {
  store.removeTask(taskId);
  logger.info("任务已移除", { taskId });
};

const clearFinishedTasks = () => {
  const finishedIds = taskManager.tasks.value
    .filter((t) => ["completed", "error", "cancelled"].includes(t.status))
    .map((t) => t.id);

  finishedIds.forEach((id) => store.removeTask(id));
  logger.info("已清空已结束的任务", { count: finishedIds.length });
};

const handleRetryTask = (task: MediaTask) => {
  // 直接从任务对象中恢复参数，这样更直接且类型安全
  store.inputPrompt = task.input.prompt;
  store.currentConfig.activeType = task.type;

  // 恢复对应类型的配置
  const typeConfig = store.currentConfig.types[task.type];
  if (typeConfig) {
    typeConfig.modelCombo = `${task.input.profileId}:${task.input.modelId}`;
    if (task.input.params) {
      Object.assign(typeConfig.params, task.input.params);
    }
  }

  logger.info("已恢复任务参数，准备重试", { taskId: task.id });
};

const handleDownloadTask = (task: MediaTask) => {
  if (task.resultAsset) {
    // 触发下载逻辑，通常是通过 assetManager 或直接打开
    logger.info("触发下载", { taskId: task.id, asset: task.resultAsset });
  }
};

const handleOpenAsset = (task: MediaTask) => {
  if (!task.resultAsset) return;

  const url = assetUrls.value[task.id];
  if (task.type === "image") {
    imageViewer.show(url);
  } else if (task.type === "video") {
    videoViewer.previewVideo(task.resultAsset);
  } else if (task.type === "audio") {
    audioViewer.previewAudio(task.resultAsset);
  }
};

// 资产 URL 映射缓存
const assetUrls = ref<Record<string, string>>({});

// 监听任务变化，更新资产 URL
watch(
  () => store.tasks,
  async (newTasks) => {
    if (!Array.isArray(newTasks)) return;
    for (const task of newTasks) {
      if (task?.resultAsset && !assetUrls.value[task.id]) {
        assetUrls.value[task.id] = await getAssetUrl(task.resultAsset);
      }
    }
  },
  { deep: true, immediate: true }
);
</script>

<template>
  <div class="media-task-list">
    <!-- 统计概览 -->
    <div class="stats-overview">
      <div class="stat-item">
        <span class="label">总任务</span>
        <span class="value">{{ stats.total }}</span>
      </div>
      <div class="stat-item processing">
        <span class="label">生成中</span>
        <span class="value">{{ stats.processing }}</span>
      </div>
      <div class="stat-item pending">
        <span class="label">排队中</span>
        <span class="value">{{ stats.pending }}</span>
      </div>
      <div class="stat-item completed">
        <span class="label">已完成</span>
        <span class="value">{{ stats.completed }}</span>
      </div>
      <div class="stat-item error">
        <span class="label">失败</span>
        <span class="value">{{ stats.error }}</span>
      </div>
    </div>

    <!-- 筛选工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchQuery"
          placeholder="搜索提示词、模型..."
          clearable
          :prefix-icon="Search"
          class="search-input"
        />
        <el-select v-model="filterType" placeholder="任务类型" class="filter-select">
          <el-option label="全部类型" value="all" />
          <el-option label="图片" value="image" />
          <el-option label="视频" value="video" />
          <el-option label="音频" value="audio" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="任务状态" class="filter-select">
          <el-option label="全部状态" value="all" />
          <el-option label="生成中" value="processing" />
          <el-option label="已完成" value="completed" />
          <el-option label="失败" value="error" />
          <el-option label="排队中" value="pending" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button :icon="TrashIcon" link @click="clearFinishedTasks"> 清空已结束任务 </el-button>
      </div>
    </div>

    <div v-if="taskManager.tasks.value.length === 0" class="empty-state">
      <el-empty description="暂无生成任务，开始你的创作吧" />
    </div>

    <div v-else-if="filteredTasks.length === 0" class="empty-state">
      <el-empty description="没有找到匹配的任务" />
    </div>

    <div v-else class="task-grid">
      <div v-for="task in filteredTasks" :key="task.id" class="task-card" :class="task.status">
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
          <div class="prompt-preview" :title="task.input.prompt">
            {{ task.input.prompt }}
          </div>

          <!-- 结果展示区域 -->
          <div class="result-area">
            <!-- 完成状态：显示缩略图/视频 -->
            <template v-if="task.status === 'completed'">
              <div class="media-preview" @click="handleOpenAsset(task)">
                <img v-if="task.type === 'image'" :src="assetUrls[task.id]" alt="result" />
                <div v-else-if="task.type === 'video'" class="video-placeholder">
                  <el-icon><Film /></el-icon>
                  <span>点击查看视频</span>
                </div>
                <div v-else class="audio-placeholder">
                  <el-icon><Music /></el-icon>
                  <span>点击播放音频</span>
                </div>
                <div class="overlay">
                  <el-icon><ExternalLink /></el-icon>
                </div>
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
                  <span class="status-text">{{ task.statusText || "正在生成中..." }}</span>
                </div>
              </div>
            </template>

            <!-- 错误状态 -->
            <template v-else-if="task.status === 'error'">
              <div class="status-container error">
                <el-icon><AlertCircle /></el-icon>
                <span class="error-msg">{{ task.error || "生成失败" }}</span>
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

        <!-- 卡片底部操作栏 -->
        <div class="task-footer">
          <el-tag :type="getStatusType(task.status)" size="small" class="status-tag">
            {{ getStatusLabel(task.status) }}
          </el-tag>

          <div class="actions">
            <el-tooltip content="重新生成" placement="top">
              <el-button :icon="RefreshCcw" circle size="small" @click="handleRetryTask(task)" />
            </el-tooltip>
            <el-tooltip v-if="task.status === 'completed'" content="下载" placement="top">
              <el-button :icon="Download" circle size="small" @click="handleDownloadTask(task)" />
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button
                :icon="Trash2"
                circle
                size="small"
                type="danger"
                plain
                @click="handleRemoveTask(task.id)"
              />
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-task-list {
  box-sizing: border-box;
  height: 100%;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.stat-item {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stat-item .label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.stat-item .value {
  font-size: 18px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.stat-item.processing .value {
  color: var(--el-color-primary);
}
.stat-item.completed .value {
  color: var(--el-color-success);
}
.stat-item.error .value {
  color: var(--el-color-danger);
}
.stat-item.pending .value {
  color: var(--el-color-warning);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.search-input {
  max-width: 240px;
}

.filter-select {
  width: 120px;
}

.empty-state {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0.6;
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  max-width: 1400px;
  margin: 0 auto;
}

.task-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.task-card:hover {
  transform: translateY(-2px);
  border-color: var(--el-color-primary-light-5);
  box-shadow: var(--el-box-shadow-light);
}

.task-header {
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
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
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
}

.result-area {
  aspect-ratio: 16 / 9;
  background-color: var(--el-fill-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--border-color);
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

.video-placeholder,
.audio-placeholder {
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
}

.task-footer {
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border-color);
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

/* 滚动条美化 */
.media-task-list::-webkit-scrollbar {
  width: 6px;
}

.media-task-list::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-lighter);
  border-radius: 3px;
}

.media-task-list:hover::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
}
</style>
