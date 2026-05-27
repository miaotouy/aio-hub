<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaGenInputManager } from "../composables/useMediaGenInputManager";
import { useAssetManager } from "@/composables/useAssetManager";
import MessageList from "./message/MessageList.vue";
import { Sparkles, RefreshCw } from "lucide-vue-next";
import { SUGGESTED_PROMPTS } from "../config";
import { sampleSize } from "lodash-es";

const store = useMediaGenStore();
const inputManager = useMediaGenInputManager();
const { getAssetUrl } = useAssetManager();

const scrollContainer = ref<HTMLElement | null>(null);

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick();
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
};

// 监听消息列表变化，自动滚动
watch(
  () => store.messages.length,
  () => {
    scrollToBottom();
  }
);

const displayPrompts = ref<string[]>([]);
const isRefreshing = ref(false);

const refreshPrompts = () => {
  isRefreshing.value = true;
  // 随机抽取 3 个
  displayPrompts.value = sampleSize(SUGGESTED_PROMPTS, 3);
  setTimeout(() => {
    isRefreshing.value = false;
  }, 500);
};

let refreshTimer: any = null;

onMounted(() => {
  scrollToBottom();
  refreshPrompts();

  // 每 30 秒自动刷新一次
  refreshTimer = setInterval(refreshPrompts, 30000);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

// 处理重试
const handleRetry = async (messageId: string) => {
  await store.regenerateFromNode(messageId);
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
  <div class="generation-stream">
    <!-- 任务列表滚动区 -->
    <div class="stream-body" ref="scrollContainer">
      <div v-if="store.messages.length <= 1" class="empty-placeholder">
        <div class="welcome-content">
          <el-icon :size="64" class="welcome-icon"><Sparkles /></el-icon>
          <h2>开始你的创意之旅</h2>
          <p>在下方输入提示词，让 AI 为你生成精美的媒体内容</p>
          <div class="quick-tips-container">
            <transition name="fade-slide" mode="out-in">
              <div class="quick-tips" :key="displayPrompts.join('|')">
                <el-tag
                  v-for="prompt in displayPrompts"
                  :key="prompt"
                  size="small"
                  effect="plain"
                  class="clickable-tag"
                  @click="inputManager.addContent(prompt)"
                >
                  {{ prompt }}
                </el-tag>
              </div>
            </transition>
            <el-button class="refresh-tips-btn" link @click="refreshPrompts">
              <el-icon :class="{ 'rotating-icon': isRefreshing }"
                ><RefreshCw
              /></el-icon>
              <span>换一批</span>
            </el-button>
          </div>
        </div>
      </div>

      <div v-else class="message-list-wrapper">
        <MessageList
          :messages="store.messages.filter((m: any) => m.role !== 'system')"
          :is-batch-mode="store.isBatchMode"
          @remove-task="(taskId) => store.removeTask(taskId)"
          @retry="handleRetry"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.generation-stream {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: all 0.3s;
  position: relative;
}

.generation-stream * {
  box-sizing: border-box;
}

.stream-body {
  flex: 1;
  overflow-y: auto;
  padding: 0; /* 移除容器内边距，由内部列表处理 */
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.empty-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  padding: 24px;
}

.welcome-content {
  text-align: center;
  max-width: 500px;
}

.welcome-icon {
  color: var(--el-color-primary);
  opacity: 0.5;
  margin-bottom: 16px;
}

.quick-tips-container {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.quick-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  min-height: 24px;
}

/* 容器级平滑切换动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.15s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.refresh-tips-btn {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  opacity: 0;
  transition: opacity 0.3s;
}

.quick-tips-container:hover .refresh-tips-btn {
  opacity: 1;
}

.refresh-tips-btn:hover {
  color: var(--el-color-primary);
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.clickable-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.clickable-tag:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
}
.message-list-wrapper {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 左右边距比输入框(24px)稍大一些(32px)，使消息流滚入输入框圆角内侧 */
  padding: 0px 32px;
}
</style>
