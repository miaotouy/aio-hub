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

// 资产 URL 处理
const resultUrl = ref<string>("");

const updateResultUrl = async () => {
  const currentTask = task.value;
  if (currentTask?.resultAsset) {
    try {
      const url = await getAssetUrl(currentTask.resultAsset);
      resultUrl.value = url;
      logger.debug("Result URL updated", { taskId: currentTask.id, url: !!url });
    } catch (error) {
      logger.error("Failed to get asset URL", error, { taskId: currentTask.id });
      resultUrl.value = "";
    }
  } else {
    resultUrl.value = "";
  }
};

const handleImageClick = () => {
  if (resultUrl.value) {
    imageViewer.show(resultUrl.value);
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
        hasAsset: !!newTask.resultAsset,
      });
      updateResultUrl();
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
        <div v-if="task.status === 'processing' || task.status === 'pending'" class="status-loading">
          <Loader2 class="animate-spin" :size="20" />
          <span>{{ task.statusText || '正在生成中...' }}</span>
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
      <div v-if="task?.status === 'completed'" class="media-result">
        <!-- 图像 -->
        <div v-if="task.type === 'image'" class="image-result">
          <img
            v-if="resultUrl"
            :src="resultUrl"
            :alt="task.input.prompt"
            class="media-preview clickable"
            @click="handleImageClick"
          />
          <div v-else-if="task.previewUrl" class="preview-placeholder">
            <img :src="task.previewUrl" class="media-preview opacity-50" />
          </div>
        </div>

        <!-- 视频 -->
        <div v-else-if="task.type === 'video'" class="video-result">
          <VideoPlayer
            v-if="resultUrl"
            :src="resultUrl"
            class="media-preview"
          />
        </div>

        <!-- 音频 -->
        <div v-else-if="task.type === 'audio'" class="audio-result">
          <AudioPlayer
            v-if="resultUrl"
            :src="resultUrl"
            class="media-preview"
          />
        </div>
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

.status-loading, .status-error {
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
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
