<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaGenInputManager } from "../composables/useMediaGenInputManager";
import MediaTaskCard from "./MediaTaskCard.vue";
import SessionManager from "./SessionManager.vue";
import MediaGenerationInput from "./MediaGenerationInput.vue";
import { Wand2, History, ChevronDown, Check, X } from "lucide-vue-next";

const store = useMediaGenStore();
const inputManager = useMediaGenInputManager();

const scrollContainer = ref<HTMLElement | null>(null);

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick();
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
};

// 监听任务列表变化，自动滚动
watch(
  () => store.tasks.length,
  () => {
    scrollToBottom();
  }
);

const currentSessionName = ref("");
const isEditingName = ref(false);
const editingName = ref("");
const titleInputRef = ref<any>(null);

watch(
  () => store.currentSessionId,
  () => {
    const session = store.sessions.find((s) => s.id === store.currentSessionId);
    currentSessionName.value = session?.name || "生成会话";
  },
  { immediate: true }
);

const startEdit = async () => {
  editingName.value = currentSessionName.value;
  isEditingName.value = true;
  await nextTick();
  titleInputRef.value?.focus();
};

const saveEdit = async () => {
  if (!isEditingName.value) return;
  const newName = editingName.value.trim();
  if (newName && newName !== currentSessionName.value && store.currentSessionId) {
    await store.updateSessionName(store.currentSessionId, newName);
    currentSessionName.value = newName;
  }
  isEditingName.value = false;
};

const cancelEdit = () => {
  isEditingName.value = false;
};

onMounted(() => {
  scrollToBottom();
});
</script>

<template>
  <div class="generation-stream">
    <!-- 顶部导航栏 -->
    <div class="stream-header">
      <div class="header-left">
        <el-icon class="title-icon"><Wand2 /></el-icon>
        <div v-if="isEditingName" class="title-edit-wrapper">
          <el-input
            ref="titleInputRef"
            v-model="editingName"
            size="small"
            placeholder="输入会话名称..."
            @keyup.enter="saveEdit"
            @keyup.esc="cancelEdit"
          />
          <div class="edit-actions">
            <el-button link size="small" type="primary" @click="saveEdit">
              <el-icon><Check /></el-icon>
            </el-button>
            <el-button link size="small" @click="cancelEdit">
              <el-icon><X /></el-icon>
            </el-button>
          </div>
        </div>
        <span v-else class="session-display-name" @click="startEdit">{{ currentSessionName }}</span>
      </div>

      <div class="header-actions">
        <el-popover
          placement="bottom-end"
          :width="320"
          trigger="click"
          popper-class="session-popover"
        >
          <template #reference>
            <el-button link class="history-btn">
              <el-icon><History /></el-icon>
              <span>切换会话</span>
              <el-icon class="el-icon--right"><ChevronDown /></el-icon>
            </el-button>
          </template>
          <SessionManager />
        </el-popover>
      </div>
    </div>

    <!-- 任务列表滚动区 -->
    <div class="stream-body" ref="scrollContainer">
      <div v-if="store.tasks.length === 0" class="empty-placeholder">
        <div class="welcome-content">
          <el-icon :size="64" class="welcome-icon"><Wand2 /></el-icon>
          <h2>开始你的创意之旅</h2>
          <p>在下方输入提示词，让 AI 为你生成精美的媒体内容</p>
          <div class="quick-tips">
            <el-tag
              size="small"
              effect="plain"
              class="clickable-tag"
              @click="inputManager.addContent('一个在霓虹灯下的赛博朋克城市')"
            >
              一个在霓虹灯下的赛博朋克城市
            </el-tag>
            <el-tag
              size="small"
              effect="plain"
              class="clickable-tag"
              @click="inputManager.addContent('唯美的二次元少女，樱花飘落')"
            >
              唯美的二次元少女，樱花飘落
            </el-tag>
            <el-tag
              size="small"
              effect="plain"
              class="clickable-tag"
              @click="inputManager.addContent('壮阔的雪山日出，电影级光效')"
            >
              壮阔的雪山日出，电影级光效
            </el-tag>
          </div>
        </div>
      </div>

      <div v-else class="task-list">
        <MediaTaskCard v-for="task in [...store.tasks].reverse()" :key="task.id" :task="task" />
      </div>
    </div>

    <!-- 底部输入区 -->
    <div class="stream-footer">
      <MediaGenerationInput />
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

.stream-header {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.title-icon {
  font-size: 18px;
  color: var(--el-color-primary);
}
.session-display-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.session-display-name:hover {
  background-color: var(--el-fill-color-light);
}

.title-edit-wrapper {
  flex: 1;
  max-width: 300px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.edit-actions {
  display: flex;
  align-items: center;
}

.edit-actions .el-button {
  padding: 4px;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.history-btn {
  height: 32px;
  padding: 0 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.history-btn:hover {
  color: var(--el-color-primary);
}

.stream-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.empty-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.welcome-content {
  text-align: center;
  max-width: 400px;
}

.welcome-icon {
  color: var(--el-color-primary);
  opacity: 0.5;
  margin-bottom: 16px;
}

.quick-tips {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.clickable-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.clickable-tag:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.task-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.stream-footer {
  padding: 16px 24px 24px;
}
</style>
