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
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaTaskManager } from "../composables/useMediaTaskManager";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { createModuleLogger } from "@/utils/logger";
import { useAssetManager } from "@/composables/useAssetManager";
import { customMessage } from "@/utils/customMessage";
import { save } from "@tauri-apps/plugin-dialog";
import { copyFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { Search, Trash2 as TrashIcon } from "lucide-vue-next";
import type { MediaTask, MediaTaskStatus, MediaTaskType } from "../types";
import { isAudioOutputTaskType, normalizeMediaTaskType } from "../types";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { useVirtualList } from "@vueuse/core";
import MediaTaskCard from "./MediaTaskCard.vue";

const store = useMediaGenStore();
const taskManager = useMediaTaskManager();
const { abortTask } = useMediaGenerationManager();
const logger = createModuleLogger("media-generator/task-list");
const { getAssetBasePath, getAssetUrl } = useAssetManager();
const imageViewer = useImageViewer();
const videoViewer = useVideoViewer();
const audioViewer = useAudioViewer();

// 资产 URL 映射缓存 (供复制和打开使用)
const assetUrls = ref<Record<string, string>>({});

// 搜索和筛选状态
const searchQuery = ref("");
const filterType = ref<MediaTaskType | "all">("all");
const filterStatus = ref<MediaTaskStatus | "all">("all");

// 统计信息直接使用管理器的
const stats = taskManager.stats;

// 过滤后的任务列表，按时间倒序排列
const filteredTasks = computed(() => {
  let list = Array.isArray(taskManager.tasks.value)
    ? [...taskManager.tasks.value]
    : [];

  // 搜索过滤
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (t) =>
        t.input.prompt.toLowerCase().includes(q) ||
        t.input.modelId.toLowerCase().includes(q)
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

// 虚拟列表配置 - 考虑到网格布局，我们需要按行分组
const COL_WIDTH = 280; // 每个卡片的最小宽度 + 间距
const containerWidth = ref(0); // 初始为 0，等 ResizeObserver 同步真实宽度

// 计算每行显示多少个（容器未就绪时默认 1 列）
const colsPerRow = computed(() => {
  if (containerWidth.value <= 0) return 1;
  return Math.max(1, Math.floor(containerWidth.value / COL_WIDTH));
});

// 将任务按行分组
const taskRows = computed(() => {
  const rows = [];
  const tasks = filteredTasks.value;
  const cols = colsPerRow.value;
  for (let i = 0; i < tasks.length; i += cols) {
    rows.push(tasks.slice(i, i + cols));
  }
  return rows;
});

const {
  list: virtualRows,
  containerProps,
  wrapperProps,
} = useVirtualList(taskRows, {
  itemHeight: 370, // 行高度 (卡片高度 + 间距)
  overscan: 10, // 增加预加载行数以减少快速滚动时的抖动
});

// 监听容器大小变化 - 使用 watch 而非 onMounted，因为容器在 v-else 条件渲染下
// 冷启动时 store 异步加载数据，onMounted 时容器 DOM 可能还不存在
let resizeObserver: ResizeObserver | null = null;

watch(
  () => containerProps.ref.value,
  (container) => {
    // 清理旧 observer
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (container) {
      containerWidth.value = container.clientWidth;
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          containerWidth.value = entry.contentRect.width;
        }
      });
      resizeObserver.observe(container);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

const handleRemoveTask = (taskId: string) => {
  store.removeTask(taskId);
  logger.info("任务已移除", { taskId });
};

const handleCancelTask = (taskId: string) => {
  abortTask(taskId);
  logger.info("任务已取消", { taskId });
};

const clearFinishedTasks = () => {
  const finishedIds = taskManager.tasks.value
    .filter((t) => ["completed", "error", "cancelled"].includes(t.status))
    .map((t) => t.id);

  finishedIds.forEach((id) => store.removeTask(id));
  logger.info("已清空已结束的任务", { count: finishedIds.length });
};

const handleRetryTask = (task: MediaTask) => {
  const mediaType = normalizeMediaTaskType(task.type, "image");
  store.inputPrompt = task.input.prompt;
  store.currentConfig.activeType = mediaType;

  const typeConfig = store.currentConfig.types[mediaType];
  if (typeConfig) {
    typeConfig.modelCombo = `${task.input.profileId}:${task.input.modelId}`;
    if (task.input.params) {
      Object.assign(typeConfig.params, task.input.params);
    }
  }

  // 恢复参考图附件
  store.clearAttachments();
  const inputAttachments = task.input.params?.inputAttachments as
    any[] | undefined;
  if (inputAttachments && inputAttachments.length > 0) {
    for (const att of inputAttachments) {
      if (att && (att.id || att.path)) {
        store.addAsset(att);
      }
    }
  }

  logger.info("已恢复任务参数，准备重试", { taskId: task.id });
};

const getOrUpdateAssetUrl = async (task: MediaTask) => {
  if (assetUrls.value[task.id]) return assetUrls.value[task.id];
  const asset = task.resultAssets?.[0] || task.resultAsset;
  if (asset) {
    const url = await getAssetUrl(asset);
    assetUrls.value[task.id] = url;
    return url;
  }
  return "";
};

const handleDownloadTask = async (task: MediaTask) => {
  const asset = task.resultAssets?.[0] || task.resultAsset;
  if (!asset) return;

  try {
    const basePath = await getAssetBasePath();
    const sourcePath = await join(basePath, asset.path);

    const targetPath = await save({
      title: "下载媒体文件",
      defaultPath: asset.name,
      filters: [
        {
          name:
            task.type === "image"
              ? "图片"
              : task.type === "video"
                ? "视频"
                : "音频",
          extensions: [asset.path.split(".").pop() || "*"],
        },
      ],
    });

    if (targetPath) {
      await copyFile(sourcePath, targetPath);
      customMessage.success("文件已下载成功");
      logger.info("文件下载成功", { taskId: task.id, targetPath });
    }
  } catch (err) {
    logger.error("下载失败", err);
    customMessage.error("下载失败，请重试");
  }
};

const handleCopyPrompt = (prompt: string) => {
  navigator.clipboard.writeText(prompt);
  customMessage.success("提示词已复制到剪贴板");
};

const handleCopyResult = async (task: MediaTask) => {
  const asset = task.resultAssets?.[0] || task.resultAsset;
  if (!asset) return;

  const url = await getOrUpdateAssetUrl(task);
  if (!url) return;

  try {
    if (task.type === "image") {
      const response = await fetch(url);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      customMessage.success("图片已复制到剪贴板");
    } else {
      await navigator.clipboard.writeText(url);
      customMessage.success(
        `${task.type === "video" ? "视频" : "音频"}链接已复制`
      );
    }
  } catch (err) {
    logger.error("复制失败", err);
    await navigator.clipboard.writeText(url);
    customMessage.success("已复制媒体链接");
  }
};

const handleOpenAsset = async (task: MediaTask) => {
  const assets = task.resultAssets?.length
    ? task.resultAssets
    : task.resultAsset
      ? [task.resultAsset]
      : [];
  if (assets.length === 0) return;

  if (task.type === "image") {
    // 多图预览：加载所有结果图 URL
    const urls: string[] = [];
    for (const asset of assets) {
      const url = await getAssetUrl(asset);
      if (url) urls.push(url);
    }
    if (urls.length > 0) {
      imageViewer.show(urls, 0);
    }
  } else if (task.type === "video") {
    videoViewer.previewVideo(assets[0]);
  } else if (isAudioOutputTaskType(task.type)) {
    audioViewer.previewAudio(assets[0]);
  }
};
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
        <el-select
          v-model="filterType"
          placeholder="任务类型"
          class="filter-select"
        >
          <el-option label="全部类型" value="all" />
          <el-option label="图片" value="image" />
          <el-option label="视频" value="video" />
          <el-option label="语音" value="speech" />
          <el-option label="音乐" value="music" />
        </el-select>
        <el-select
          v-model="filterStatus"
          placeholder="任务状态"
          class="filter-select"
        >
          <el-option label="全部状态" value="all" />
          <el-option label="生成中" value="processing" />
          <el-option label="已完成" value="completed" />
          <el-option label="失败" value="error" />
          <el-option label="排队中" value="pending" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button :icon="TrashIcon" link @click="clearFinishedTasks">
          清空已结束任务
        </el-button>
      </div>
    </div>

    <div v-if="taskManager.tasks.value.length === 0" class="empty-state">
      <el-empty description="暂无生成任务，开始你的创作吧" />
    </div>

    <div v-else-if="filteredTasks.length === 0" class="empty-state">
      <el-empty description="没有找到匹配的任务" />
    </div>

    <div v-else class="task-list-container" v-bind="containerProps">
      <div class="task-grid-virtual" v-bind="wrapperProps">
        <div v-for="row in virtualRows" :key="row.index" class="task-row">
          <div v-for="task in row.data" :key="task.id" class="task-col">
            <MediaTaskCard
              :task="task"
              @remove="handleRemoveTask"
              @cancel="handleCancelTask"
              @retry="handleRetryTask"
              @download="handleDownloadTask"
              @copy-prompt="handleCopyPrompt"
              @copy-result="handleCopyResult"
              @open="handleOpenAsset"
            />
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
  padding: 16px 16px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.task-list-container {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 80px; /* 底部余量 */
  padding-top: 12px;
  margin: 0 -16px; /* 抵消父级左右 padding 以便滚动条靠边 */
  padding-left: 16px;
  padding-right: 16px;
}

/* 滚动条美化移至容器 */
.task-list-container::-webkit-scrollbar {
  width: 6px;
}

.task-list-container::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-lighter);
  border-radius: 3px;
}

.task-list-container:hover::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.stat-item {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
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

.task-grid-virtual {
  width: 100%;
  box-sizing: border-box;
}

.task-row {
  display: flex;
  gap: 16px;
  padding: 8px 0;
  box-sizing: border-box;
}

.task-col {
  flex: 1;
  min-width: 240px;
  max-width: 480px;
}
</style>
