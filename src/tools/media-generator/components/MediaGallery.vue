<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import {
  Search,
  Info,
  Download,
  Trash2,
  Video as VideoIcon,
  Music as AudioIcon,
} from "lucide-vue-next";
import { useAssetManager } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { useGenerationInfoViewer } from "../composables/useGenerationInfoViewer";
import type { MediaTask, MediaTaskType } from "../types";

const store = useMediaGenStore();
const { getAssetUrl } = useAssetManager();
const { show: showImageViewer } = useImageViewer();
const { previewVideo } = useVideoViewer();
const { previewAudio } = useAudioViewer();
const { show: showInfoViewer } = useGenerationInfoViewer();

const searchQuery = ref("");
const filterType = ref<MediaTaskType | "all">("all");

// 过滤已完成且有资产的任务
const completedTasks = computed(() => {
  return store.tasks.filter((task) => task.status === "completed" && task.resultAsset);
});

// 搜索和筛选后的任务
const filteredTasks = computed(() => {
  return completedTasks.value.filter((task) => {
    const matchesSearch = task.input.prompt.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesType = filterType.value === "all" || task.type === filterType.value;
    return matchesSearch && matchesType;
  });
});

// 资产 URL 缓存
const assetUrls = ref<Record<string, string>>({});

// 加载资产 URL
const loadAssetUrls = async () => {
  for (const task of completedTasks.value) {
    if (task.resultAsset && !assetUrls.value[task.id]) {
      assetUrls.value[task.id] = await getAssetUrl(task.resultAsset);
    }
  }
};

// 监听任务变化加载 URL
watch(
  completedTasks,
  () => {
    loadAssetUrls();
  },
  { immediate: true, deep: true }
);

const handlePreview = (task: MediaTask) => {
  const url = assetUrls.value[task.id];
  if (!url || !task.resultAsset) return;

  if (task.type === "image") {
    showImageViewer(url);
  } else if (task.type === "video") {
    previewVideo(task.resultAsset);
  } else if (task.type === "audio") {
    previewAudio(task.resultAsset);
  }
};

const handleViewInfo = (task: MediaTask) => {
  if (task.resultAsset) {
    showInfoViewer(task.resultAsset, {
      prompt: task.input.prompt,
      negativePrompt: task.input.negativePrompt,
      modelId: task.input.modelId,
      params: task.input.params,
      genType: task.type,
    });
  }
};

const handleDownload = (task: MediaTask) => {
  if (!assetUrls.value[task.id]) return;
  const link = document.createElement("a");
  link.href = assetUrls.value[task.id];
  link.download = `generated-${task.id}.${task.type === "image" ? "png" : task.type === "video" ? "mp4" : "mp3"}`;
  link.click();
};

const handleRemove = (task: MediaTask) => {
  store.removeTask(task.id);
};
</script>

<template>
  <div class="media-gallery">
    <!-- 工具栏 -->
    <div class="gallery-toolbar">
      <div class="search-box">
        <el-input
          v-model="searchQuery"
          placeholder="搜索提示词..."
          clearable
          :prefix-icon="Search"
        />
      </div>

      <div class="filter-actions">
        <el-radio-group v-model="filterType" size="default">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="image">图片</el-radio-button>
          <el-radio-button value="video">视频</el-radio-button>
          <el-radio-button value="audio">音频</el-radio-button>
        </el-radio-group>

        <div class="stats">
          <el-tag type="info" effect="plain"> 共 {{ filteredTasks.length }} 个结果 </el-tag>
        </div>
      </div>
    </div>

    <!-- 瀑布流/网格内容 -->
    <div v-if="filteredTasks.length > 0" class="gallery-grid">
      <div
        v-for="task in filteredTasks"
        :key="task.id"
        class="gallery-item"
        @click="handlePreview(task)"
      >
        <!-- 预览图 -->
        <div class="item-preview">
          <template v-if="task.type === 'image'">
            <img :src="assetUrls[task.id]" loading="lazy" />
          </template>
          <template v-else-if="task.type === 'video'">
            <video
              :src="assetUrls[task.id]"
              muted
              loop
              onmouseover="this.play()"
              onmouseout="this.pause()"
            ></video>
            <div class="media-badge">
              <VideoIcon :size="14" />
            </div>
          </template>
          <template v-else-if="task.type === 'audio'">
            <div class="audio-placeholder">
              <AudioIcon :size="48" />
              <span>音频结果</span>
            </div>
            <div class="media-badge">
              <AudioIcon :size="14" />
            </div>
          </template>

          <!-- 悬浮层 -->
          <div class="item-overlay">
            <div class="overlay-top">
              <p class="prompt-hint">{{ task.input.prompt }}</p>
            </div>
            <div class="overlay-bottom">
              <div class="action-buttons">
                <el-tooltip content="查看参数" placement="top">
                  <el-button circle size="small" @click.stop="handleViewInfo(task)">
                    <el-icon><Info /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="下载" placement="top">
                  <el-button circle size="small" @click.stop="handleDownload(task)">
                    <el-icon><Download /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="删除" placement="top">
                  <el-button circle size="small" type="danger" @click.stop="handleRemove(task)">
                    <el-icon><Trash2 /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <el-empty :description="searchQuery ? '未找到匹配的结果' : '暂无生成结果'">
        <template v-if="!searchQuery" #extra>
          <p>去工作台创作一些作品吧！</p>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.media-gallery {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  overflow: hidden;
}

.gallery-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.search-box {
  width: 300px;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.gallery-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  grid-auto-rows: 200px;
  gap: 16px;
  overflow-y: auto;
  padding-right: 8px;
}

.gallery-item {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.gallery-item:hover {
  transform: translateY(-4px);
  box-shadow: var(--el-box-shadow);
}

.item-preview {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--el-fill-color-dark);
}

.item-preview img,
.item-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audio-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
}

.media-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  backdrop-filter: blur(4px);
}

.item-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.6) 0%,
    transparent 40%,
    transparent 60%,
    rgba(0, 0, 0, 0.6) 100%
  );
  opacity: 0;
  transition: opacity 0.3s;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
}

.gallery-item:hover .item-overlay {
  opacity: 1;
}

.prompt-hint {
  color: white;
  font-size: 12px;
  margin: 0;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.overlay-bottom {
  display: flex;
  justify-content: flex-end;
}

.action-buttons {
  display: flex;
  gap: 6px;
}

.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 滚动条美化 */
.gallery-grid::-webkit-scrollbar {
  width: 6px;
}

.gallery-grid::-webkit-scrollbar-thumb {
  background-color: var(--border-color);
  border-radius: 3px;
}
</style>
