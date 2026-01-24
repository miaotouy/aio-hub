<script setup lang="ts">
import { computed } from "vue";
import { format } from "date-fns";
import {
  Bot,
  Download,
  Trash2,
  Info,
  Music,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-vue-next";
import Avatar from "@/components/common/Avatar.vue";
import ImageViewer from "@/components/common/ImageViewer.vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import type { MediaTask } from "../types";
interface Props {
  role: string;
  content?: string;
  task?: MediaTask;
  timestamp: string | number | Date;
  assetUrl?: string;
  isSelected?: boolean;
}

const props = defineProps<Props>();

const displayTimestamp = computed(() => {
  if (typeof props.timestamp === 'string') {
    return new Date(props.timestamp);
  }
  return props.timestamp;
});
const emit = defineEmits<{
  (e: "remove", taskId: string): void;
  (e: "download", task: MediaTask): void;
  (e: "select"): void;
}>();

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "error":
      return XCircle;
    case "processing":
      return Loader2;
    case "pending":
      return Clock;
    default:
      return Clock;
  }
};

const getStatusType = (status: string) => {
  switch (status) {
    case "completed":
      return "success";
    case "error":
      return "danger";
    case "processing":
      return "primary";
    case "pending":
      return "info";
    default:
      return "info";
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case "image":
      return "图片生成";
    case "video":
      return "视频生成";
    case "audio":
      return "音乐生成";
    default:
      return type.toUpperCase();
  }
};
</script>

<template>
  <div
    class="chat-message"
    :class="[
      `role-${role}`,
      { 'is-loading': role === 'assistant' && task?.status === 'processing' },
      { 'is-selected': isSelected },
    ]"
    @click="emit('select')"
  >
    <!-- 背景切片 (照搬 chat 结构) -->
    <div class="message-background-container">
      <div v-for="i in 9" :key="i" class="bg-slice"></div>
    </div>

    <div class="message-inner">
      <!-- 消息头部 -->
      <div class="message-header-wrapper">
        <Avatar
          src=""
          :size="36"
          :alt="role === 'user' ? 'User' : 'AI'"
          :shape="role === 'user' ? 'circle' : 'square'"
          class="avatar"
        >
          <template v-if="role === 'assistant'" #default>
            <Bot :size="18" />
          </template>
        </Avatar>
        <div class="header-info">
          <span class="sender-name">{{
            role === "user" ? "你" : task ? getTypeLabel(task.type) : "生成助手"
          }}</span>
          <span class="message-time">{{ format(displayTimestamp, "HH:mm:ss") }}</span>
        </div>
      </div>

      <!-- 消息主体 -->
      <div class="message-content-wrapper">
        <div class="message-bubble">
          <!-- 用户 Prompt -->
          <div v-if="role === 'user'" class="prompt-content">
            {{ content }}
          </div>

          <!-- 助手结果 -->
          <div v-else-if="task" class="assistant-content">
            <!-- 状态展示 -->
            <div v-if="task.status !== 'completed'" class="status-box">
              <div class="status-header">
                <component
                  :is="getStatusIcon(task.status)"
                  :size="16"
                  :class="{ rotate: task.status === 'processing' }"
                  :style="{ color: `var(--el-color-${getStatusType(task.status)})` }"
                />
                <span class="status-text">{{
                  task.statusText || (task.status === "pending" ? "排队中..." : task.status)
                }}</span>
              </div>
              <el-progress
                v-if="task.status === 'processing'"
                :percentage="task.progress || 0"
                :stroke-width="2"
                :show-text="false"
                striped
                striped-flow
              />
            </div>

            <!-- 媒体结果 -->
            <div v-if="task.status === 'completed' && assetUrl" class="media-result">
              <ImageViewer v-if="task.type === 'image'" :src="assetUrl" />
              <VideoPlayer v-else-if="task.type === 'video'" :src="assetUrl" />
              <div v-else-if="task.type === 'audio'" class="audio-wrapper">
                <el-icon :size="32" color="var(--el-color-success)"><Music /></el-icon>
                <AudioPlayer :src="assetUrl" class="audio-player" />
              </div>
            </div>

            <!-- 错误详情 -->
            <div v-if="task.status === 'error' && task.error" class="error-detail">
              <Info :size="14" />
              <span>{{ task.error }}</span>
            </div>
          </div>

          <!-- 悬浮操作栏 -->
          <div class="message-menubar-mini">
            <button
              v-if="role === 'assistant' && task?.status === 'completed'"
              class="menu-btn"
              title="下载"
              @click="task && emit('download', task)"
            >
              <Download :size="14" />
            </button>
            <button
              class="menu-btn btn-danger"
              title="移除"
              @click="task ? emit('remove', task.id) : null"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  position: relative;
  margin-bottom: 24px;
  padding: 16px;
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: visible;
  cursor: pointer;
}

.chat-message.is-selected {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 4px;
}

.chat-message:hover {
  filter: brightness(1.02);
}

.message-background-container {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  z-index: 0;
  pointer-events: none;
  opacity: 0.4;
  transition: opacity 0.3s ease;
}

.chat-message:hover .message-background-container {
  opacity: 0.7;
}

.bg-slice {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  transition: all 0.4s ease;
}

/* 角色特定的样式 */
.role-user {
  align-self: flex-end;
}

.role-user .message-inner {
  align-items: flex-end;
}

.role-user .bg-slice {
  background-color: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-8);
}

.message-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-header-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.role-user .message-header-wrapper {
  flex-direction: row-reverse;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.role-user .header-info {
  align-items: flex-end;
}

.sender-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.message-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  opacity: 0.7;
}

.message-bubble {
  position: relative;
  padding: 4px 0;
}

.prompt-content {
  font-size: 15px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.assistant-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-box {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 240px;
}

.status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.media-result {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--el-fill-color-blank);
  box-shadow: var(--el-box-shadow-light);
  max-width: fit-content;
}

.media-result :deep(img),
.media-result :deep(video) {
  max-width: 100%;
  max-height: 60vh;
  display: block;
}

.audio-wrapper {
  padding: 16px;
  min-width: 300px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-player {
  flex: 1;
}

.error-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-8);
  border-radius: 8px;
  color: var(--el-color-danger);
  font-size: 13px;
}

.message-menubar-mini {
  position: absolute;
  right: 0;
  bottom: -10px;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  opacity: 0;
  transform: translateY(5px);
  transition: all 0.2s ease;
  z-index: 10;
}

.chat-message:hover .message-menubar-mini {
  opacity: 1;
  transform: translateY(0);
}

.menu-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.menu-btn:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.menu-btn.btn-danger:hover {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.rotate {
  animation: spin 2s linear infinite;
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
