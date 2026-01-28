<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Loader2, AlertCircle, XCircle } from "lucide-vue-next";
import type { MediaMessage } from "../../types";
import { useMediaGenStore } from "../../stores/mediaGenStore";
import { useAssetManager } from "@/composables/useAssetManager";
import { createModuleLogger } from "@/utils/logger";
import { useImageViewer } from "@/composables/useImageViewer";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";

interface Props {
  message: MediaMessage;
}

const props = defineProps<Props>();
const store = useMediaGenStore();
const { getAssetUrl } = useAssetManager();
const imageViewer = useImageViewer();
const logger = createModuleLogger("media-generator/message-content");

const task = computed(() => {
  const taskId = props.message.metadata?.taskId;
  if (taskId) {
    const liveTask = store.getTask(taskId);
    if (liveTask) return liveTask;
  }
  return props.message.metadata?.taskSnapshot;
});

// 统一多资产范式：将单数或复数资产统一为列表
const effectiveAssets = computed(() => {
  const currentTask = task.value;
  if (!currentTask) return [];

  if (currentTask.resultAssets && currentTask.resultAssets.length > 0) {
    return currentTask.resultAssets;
  }

  // 迁移逻辑：如果只有单数资产，封装成列表
  if (currentTask.resultAsset) {
    return [currentTask.resultAsset];
  }

  return [];
});

// 资产 URL 处理
const resultUrls = ref<string[]>([]);

const updateResultUrls = async () => {
  const assets = effectiveAssets.value;
  if (assets.length > 0) {
    try {
      const urls = await Promise.all(assets.map((asset) => getAssetUrl(asset)));
      resultUrls.value = urls.filter(Boolean) as string[];
      logger.debug("Result URLs updated", {
        taskId: task.value?.id,
        count: resultUrls.value.length,
      });
    } catch (error) {
      logger.error("Failed to get asset URLs", error, { taskId: task.value?.id });
      resultUrls.value = [];
    }
  } else {
    resultUrls.value = [];
  }
};

const handleImageClick = (url: string) => {
  if (url) {
    imageViewer.show(url);
  }
};

// 监听整个 task 的变化，确保状态切换（生成中 -> 已完成）时能及时触发 URL 更新
watch(
  task,
  (newTask) => {
    if (newTask) {
      logger.debug("Task state updated in message", {
        id: newTask.id,
        status: newTask.status,
        hasAsset: !!(newTask.resultAssets?.length || newTask.resultAsset),
      });
      updateResultUrls();
    }
  },
  { immediate: true, deep: true }
);
</script>

<template>
  <div class="message-content">
    <!-- 用户 Prompt -->
    <div v-if="message.role === 'user'" class="prompt-content">
      {{ message.content }}
    </div>

    <!-- 助手生成结果 -->
    <div v-else class="generation-content">
      <!-- 任务状态展示 -->
      <div v-if="task && task.status !== 'completed'" class="task-status">
        <div
          v-if="task.status === 'processing' || task.status === 'pending'"
          class="status-loading"
        >
          <Loader2 class="animate-spin" :size="20" />
          <span>{{ task.statusText || "正在生成中..." }}</span>
          <span v-if="task.progress > 0" class="progress-text">{{ task.progress }}%</span>
        </div>
        <div v-else-if="task.status === 'error'" class="status-error">
          <AlertCircle :size="20" />
          <span>生成失败: {{ task.error }}</span>
        </div>
        <div v-else-if="task.status === 'cancelled'" class="status-cancelled">
          <XCircle :size="20" />
          <span>任务已取消</span>
        </div>
      </div>

      <!-- 生成成功后的媒体展示 -->
      <div
        v-if="task?.status === 'completed'"
        class="media-result"
        :class="{
          'is-multi': resultUrls.length > 1 || (task.previewUrls && task.previewUrls.length > 1),
        }"
      >
        <!-- 图像 -->
        <template v-if="task.type === 'image'">
          <div v-if="resultUrls.length > 0" class="image-grid">
            <div v-for="url in resultUrls" :key="url" class="media-item">
              <img
                :src="url"
                :alt="task.input.prompt"
                class="media-preview clickable"
                @click="handleImageClick(url)"
              />
            </div>
          </div>
          <div v-else-if="task.previewUrls?.length" class="image-grid">
            <div v-for="url in task.previewUrls" :key="url" class="media-item preview-placeholder">
              <img :src="url" class="media-preview opacity-50" />
            </div>
          </div>
          <div v-else-if="task.previewUrl" class="image-grid">
            <div class="media-item preview-placeholder">
              <img :src="task.previewUrl" class="media-preview opacity-50" />
            </div>
          </div>
        </template>

        <!-- 视频 -->
        <template v-else-if="task.type === 'video'">
          <div v-if="resultUrls.length > 0" class="video-list">
            <div v-for="url in resultUrls" :key="url" class="media-item">
              <VideoPlayer :src="url" class="media-preview" />
            </div>
          </div>
        </template>

        <!-- 音频 -->
        <template v-else-if="task.type === 'audio'">
          <div v-if="resultUrls.length > 0" class="audio-list">
            <div v-for="url in resultUrls" :key="url" class="media-item">
              <AudioPlayer :src="url" class="media-preview" />
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-content {
  position: relative;
  padding: 4px 0;
}

.prompt-content {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-word;
  opacity: 0.9;
}

.task-status {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-color-soft);
  border: 1px solid var(--border-color);
}

.status-loading,
.status-error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.status-loading {
  color: var(--primary-color);
}

.status-error {
  color: var(--error-color);
}

.status-cancelled {
  color: var(--text-color-secondary);
}

.progress-text {
  font-weight: bold;
  margin-left: auto;
}

.media-result {
  margin-top: 8px;
}

.media-result.is-multi .image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.media-item {
  position: relative;
  width: 100%;
}

.video-list,
.audio-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.media-preview {
  max-width: 100%;
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  display: block;
}

.media-preview.clickable {
  cursor: zoom-in;
  transition: transform 0.2s;
}

.media-preview.clickable:hover {
  transform: scale(1.01);
}

.preview-placeholder {
  position: relative;
  display: inline-block;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
