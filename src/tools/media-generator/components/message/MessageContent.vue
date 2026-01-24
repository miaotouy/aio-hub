<script setup lang="ts">
import { computed } from "vue";
import { Loader2, AlertCircle } from "lucide-vue-next";
import type { MediaMessage } from "../../types";
import ImageViewer from "@/components/common/ImageViewer.vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";

interface Props {
  message: MediaMessage;
}

const props = defineProps<Props>();

const task = computed(() => props.message.metadata?.taskSnapshot);
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
      </div>

      <!-- 生成成功后的媒体展示 -->
      <div v-if="task?.status === 'completed'" class="media-result">
        <!-- 图像 -->
        <div v-if="task.type === 'image'" class="image-result">
          <ImageViewer
            v-if="task.resultAsset"
            :src="task.resultAsset.path"
            :alt="task.input.prompt"
            class="media-preview"
          />
          <div v-else-if="task.previewUrl" class="preview-placeholder">
            <img :src="task.previewUrl" class="media-preview opacity-50" />
          </div>
        </div>

        <!-- 视频 -->
        <div v-else-if="task.type === 'video'" class="video-result">
          <VideoPlayer
            v-if="task.resultAsset"
            :src="task.resultAsset.path"
            class="media-preview"
          />
        </div>

        <!-- 音频 -->
        <div v-else-if="task.type === 'audio'" class="audio-result">
          <AudioPlayer
            v-if="task.resultAsset"
            :src="task.resultAsset.path"
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
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-word;
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
