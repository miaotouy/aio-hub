<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { createModuleLogger } from "@/utils/logger";
import { useAssetManager } from "@/composables/useAssetManager";
import MediaMessageItem from "./MediaMessageItem.vue";
import type { MediaTask } from "../types";

const store = useMediaGenStore();
const logger = createModuleLogger("media-generator/task-list");
const { getAssetUrl } = useAssetManager();

// 消息流展示，按时间正序排列（最新的在底部）
const sortedMessages = computed(() => {
  return store.messages;
});

const listContainer = ref<HTMLElement | null>(null);

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (listContainer.value) {
      listContainer.value.scrollTop = listContainer.value.scrollHeight;
    }
  });
};

// 监听任务数量变化，自动滚动
watch(
  () => store.tasks.length,
  () => {
    scrollToBottom();
  }
);

const handleRemoveTask = (taskId: string) => {
  store.removeTask(taskId);
  logger.info("任务已移除", { taskId });
};

// 资产 URL 映射缓存
const assetUrls = ref<Record<string, string>>({});

// 监听任务变化，更新资产 URL
watch(
  () => store.tasks,
  async (newTasks) => {
    for (const task of newTasks) {
      if (task.resultAsset && !assetUrls.value[task.id]) {
        assetUrls.value[task.id] = await getAssetUrl(task.resultAsset);
      }
    }
  },
  { deep: true, immediate: true }
);
</script>

<template>
  <div class="media-conversation-list" ref="listContainer">
    <div v-if="store.tasks.length === 0" class="empty-state">
      <el-empty description="开始你的创作吧" />
    </div>

    <div v-else class="message-flow">
      <MediaMessageItem
        v-for="msg in sortedMessages"
        :key="msg.id"
        :role="msg.role"
        :content="msg.content"
        :task="msg.metadata?.taskSnapshot || (msg.metadata?.taskId ? store.getTask(msg.metadata.taskId) : undefined)"
        :timestamp="msg.timestamp || Date.now()"
        :asset-url="assetUrls[msg.metadata?.taskId || '']"
        :is-selected="msg.isSelected"
        @remove="(taskId) => handleRemoveTask(taskId)"
        @select="store.toggleMessageSelection(msg.id)"
        @download="(t: MediaTask) => logger.info('触发下载', { taskId: t.id })"
      />
    </div>
  </div>
</template>

<style scoped>
.media-conversation-list {
  box-sizing: border-box;
  height: 100%;
  padding: 20px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.media-conversation-list * {
  box-sizing: border-box;
}

.empty-state {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0.6;
}

.message-flow {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 900px;
  margin: 0 auto;
}

/* 滚动条美化 */
.media-conversation-list::-webkit-scrollbar {
  width: 6px;
}

.media-conversation-list::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-lighter);
  border-radius: 3px;
}

.media-conversation-list:hover::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
}
</style>
