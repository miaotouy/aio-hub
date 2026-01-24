<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import MediaTaskCard from "./MediaTaskCard.vue";
import SessionManager from "./SessionManager.vue";
import { Send, Image as ImageIcon, Wand2, History, ChevronDown, Check, X } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";

const store = useMediaGenStore();
const { startGeneration, isGenerating } = useMediaGenerationManager();

const scrollContainer = ref<HTMLElement | null>(null);
const prompt = ref("");

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick();
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
};

// 监听任务列表变化，自动滚动F
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

const handleSend = async (e?: KeyboardEvent) => {
  if (e && e.shiftKey) return; // Shift + Enter 换行

  if (!prompt.value.trim()) return;
  if (isGenerating.value) {
    customMessage.warning("正在生成中，请稍候...");
    return;
  }

  const mediaType = store.currentConfig.activeType;
  const { modelCombo, params } = store.currentConfig.types[mediaType];

  if (!modelCombo) {
    customMessage.warning("请先选择生成模型");
    return;
  }

  const [profileId, modelId] = modelCombo.split(":");
  const currentPrompt = prompt.value;
  prompt.value = "";

  const options = {
    ...params,
    prompt: currentPrompt,
    modelId,
    profileId,
    // 映射 UI 参数到 API 参数
    numInferenceSteps: params.steps,
    guidanceScale: params.cfgScale,
  };

  await startGeneration(options as any, mediaType);
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
            <el-tag size="small" effect="plain">一个在霓虹灯下的赛博朋克城市</el-tag>
            <el-tag size="small" effect="plain">唯美的二次元少女，樱花飘落</el-tag>
            <el-tag size="small" effect="plain">壮阔的雪山日出，电影级光效</el-tag>
          </div>
        </div>
      </div>

      <div v-else class="task-list">
        <MediaTaskCard v-for="task in [...store.tasks].reverse()" :key="task.id" :task="task" />
      </div>
    </div>

    <!-- 底部输入区 -->
    <div class="stream-footer">
      <div class="input-container">
        <div class="input-toolbar">
          <el-button link size="small">
            <el-icon><ImageIcon /></el-icon>
            参考图
          </el-button>
          <el-divider direction="vertical" />
          <el-button link size="small">
            <el-icon><Wand2 /></el-icon>
            提示词优化
          </el-button>
        </div>

        <div class="input-main">
          <el-input
            v-model="prompt"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 6 }"
            placeholder="描述你想要生成的画面..."
            @keydown.enter.prevent="handleSend($event)"
          />
          <el-button type="primary" class="send-btn" :loading="isGenerating" @click="handleSend">
            <el-icon v-if="!isGenerating"><Send /></el-icon>
          </el-button>
        </div>
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

.task-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.stream-footer {
  padding: 16px 24px 24px;
}

.input-container {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px;
  box-shadow: var(--el-box-shadow-light);
  transition: all 0.2s;
}

.input-container:focus-within {
  border-color: var(--el-color-primary);
  box-shadow: var(--el-box-shadow);
}

.input-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  margin-bottom: 4px;
}

.input-main {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.input-main :deep(.el-textarea__inner) {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 8px;
  font-size: 14px;
  resize: none;
}

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  flex-shrink: 0;
  margin-bottom: 4px;
  margin-right: 4px;
}
</style>
