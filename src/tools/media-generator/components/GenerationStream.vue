<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from "vue";
import { ElMessageBox as elMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaGenInputManager } from "../composables/useMediaGenInputManager";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { useAssetManager } from "@/composables/useAssetManager";
import MessageList from "./message/MessageList.vue";
import SessionManager from "./SessionManager.vue";
import MediaGenerationInput from "./MediaGenerationInput.vue";
import {
  Sparkles,
  History,
  Check,
  X,
  RefreshCw,
  MessageSquarePlus,
  Layers,
  Download,
  Trash2,
} from "lucide-vue-next";
import { SUGGESTED_PROMPTS } from "../config";
import { sampleSize } from "lodash-es";

const store = useMediaGenStore();
const inputManager = useMediaGenInputManager();
const { startGeneration } = useMediaGenerationManager();
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
  const params = store.getRetryParams(messageId);
  if (!params) return;

  if (params.isMediaTask && params.type) {
    // 触发媒体生成重试
    await startGeneration(params.options as any, params.type);
  } else {
    // TODO: 处理纯对话重试 (目前 MediaGenerator 暂未开放纯对话流)
    console.log("对话重试:", params);
  }
};

const handleBatchDelete = async () => {
  const selectedCount = store.selectedMessages.length;
  if (selectedCount === 0) return;

  try {
    await elMessageBox.confirm(`确定要删除选中的 ${selectedCount} 条消息吗？`, "批量删除", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    for (const msg of store.selectedMessages) {
      store.deleteMessage(msg.id);
    }
    store.exitBatchMode();
  } catch {
    // 用户取消
  }
};

const handleBatchDownload = async () => {
  // TODO: 实现批量下载逻辑
  customMessage.info("批量下载功能开发中...");
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
    <!-- 顶部导航栏 -->
    <div class="stream-header" :class="{ 'batch-mode-active': store.isBatchMode }">
      <div v-if="store.isBatchMode" class="batch-header-content">
        <div class="batch-info">
          <span class="selected-count">已选中 {{ store.selectedMessages.length }} 项</span>
        </div>
        <div class="batch-actions">
          <el-button
            type="primary"
            plain
            size="small"
            :disabled="store.selectedMessages.length === 0"
            @click="handleBatchDownload"
          >
            <el-icon><Download /></el-icon>
            <span>下载</span>
          </el-button>
          <el-button
            type="danger"
            plain
            size="small"
            :disabled="store.selectedMessages.length === 0"
            @click="handleBatchDelete"
          >
            <el-icon><Trash2 /></el-icon>
            <span>删除</span>
          </el-button>
          <el-divider direction="vertical" />
          <el-button size="small" @click="store.exitBatchMode">取消</el-button>
        </div>
      </div>

      <div v-else class="header-left">
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

      <div v-if="!store.isBatchMode" class="header-actions">
        <el-tooltip content="批量操作" placement="bottom">
          <el-button link class="action-btn" @click="store.enterBatchMode">
            <el-icon><Layers /></el-icon>
          </el-button>
        </el-tooltip>

        <el-tooltip content="开启新会话" placement="bottom">
          <el-button link class="action-btn" @click="store.createNewSession()">
            <el-icon><MessageSquarePlus /></el-icon>
          </el-button>
        </el-tooltip>

        <el-popover
          placement="bottom-end"
          :width="360"
          trigger="click"
          popper-class="session-popover"
        >
          <template #reference>
            <el-button link class="history-btn">
              <span style="padding-right: 4px">切换会话</span>
              <el-icon><History /></el-icon>
            </el-button>
          </template>
          <SessionManager />
        </el-popover>
      </div>
    </div>

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
              <el-icon :class="{ 'rotating-icon': isRefreshing }"><RefreshCw /></el-icon>
              <span>换一批</span>
            </el-button>
          </div>
        </div>
      </div>

      <div v-else class="message-list-wrapper">
        <MessageList
          :messages="store.messages.filter((m) => m.role !== 'system')"
          :is-batch-mode="store.isBatchMode"
          @remove-task="(taskId) => store.removeTask(taskId)"
          @retry="handleRetry"
        />
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
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-bottom: 1px solid transparent;
}

.stream-header.batch-mode-active {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 92%);
  border-bottom: 1px solid color-mix(in srgb, var(--el-color-primary), transparent 80%);
  backdrop-filter: blur(var(--ui-blur));
}

.batch-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.batch-info {
  display: flex;
  align-items: center;
}

.selected-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
  gap: 8px;
  flex-shrink: 0;
}

.action-btn,
.history-btn {
  height: 32px;
  padding: 0 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  transition: all 0.2s;
}

.action-btn:hover,
.history-btn:hover {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
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

.task-list-wrapper {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.stream-footer {
  padding: 16px 24px 24px;
}
</style>
