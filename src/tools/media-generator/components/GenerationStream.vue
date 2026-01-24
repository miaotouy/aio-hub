<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { useFileInteraction } from "@/composables/useFileInteraction";
import { useAssetManager } from "@/composables/useAssetManager";
import MediaTaskCard from "./MediaTaskCard.vue";
import SessionManager from "./SessionManager.vue";
import AttachmentCard from "../../llm-chat/components/AttachmentCard.vue";
import { Send, Image as ImageIcon, Wand2, History, ChevronDown, Check, X } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { open } from "@tauri-apps/plugin-dialog";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("media-generator/GenerationStream");

const store = useMediaGenStore();
const { startGeneration, isGenerating } = useMediaGenerationManager();
const assetManager = useAssetManager();

const scrollContainer = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement>();
const prompt = ref("");

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

// 统一的文件交互处理（拖放 + 粘贴）
const { isDraggingOver } = useFileInteraction({
  element: containerRef,
  sourceModule: "media-generator",
  pasteMode: "asset",
  onPaths: async (paths) => {
    logger.info("文件拖拽触发", { paths });
    let successCount = 0;
    for (const path of paths) {
      try {
        const asset = await assetManager.importAssetFromPath(path, {
          sourceModule: "media-generator",
          origin: {
            type: "local",
            source: "drag-and-drop",
            sourceModule: "media-generator",
          },
        });
        if (asset && store.addAsset(asset)) {
          successCount++;
        }
      } catch (err) {
        logger.error("导入文件失败", err, { path });
      }
    }
    if (successCount > 0) {
      customMessage.success(`已添加 ${successCount} 个参考图`);
    }
  },
  onAssets: async (assets) => {
    logger.info("文件粘贴触发", { count: assets.length });
    let successCount = 0;
    for (const asset of assets) {
      if (store.addAsset(asset)) {
        successCount++;
      }
    }
    if (successCount > 0) {
      customMessage.success(`已添加 ${successCount} 个参考图`);
    }
  },
  disabled: isGenerating,
});

const handleTriggerAttachment = async () => {
  try {
    const selected = await open({
      multiple: true,
      title: "选择参考图",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      let successCount = 0;
      for (const path of paths) {
        try {
          const asset = await assetManager.importAssetFromPath(path, {
            sourceModule: "media-generator",
            origin: {
              type: "local",
              source: "file-picker",
              sourceModule: "media-generator",
            },
          });
          if (asset && store.addAsset(asset)) {
            successCount++;
          }
        } catch (err) {
          logger.error("导入文件失败", err, { path });
        }
      }
      if (successCount > 0) {
        customMessage.success(`已添加 ${successCount} 个参考图`);
      }
    }
  } catch (error) {
    customMessage.error("选择文件失败");
  }
};

const handleSend = async (e?: KeyboardEvent) => {
  if (e && e.shiftKey) return; // Shift + Enter 换行

  if (!prompt.value.trim() && !store.hasAttachments) return;
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
  const currentAttachments = [...store.attachments];

  prompt.value = "";
  store.clearAttachments();

  const options = {
    ...params,
    prompt: currentPrompt,
    modelId,
    profileId,
    attachments: currentAttachments,
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
  <div ref="containerRef" :class="['generation-stream', { 'dragging-over': isDraggingOver }]">
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
      <div :class="['input-container', { 'dragging-over': isDraggingOver }]">
        <!-- 附件展示区 -->
        <div v-if="store.hasAttachments" class="attachments-area">
          <div class="attachments-list">
            <AttachmentCard
              v-for="asset in store.attachments"
              :key="asset.id"
              :asset="asset"
              :all-assets="store.attachments"
              :removable="true"
              size="small"
              @remove="store.removeAttachment(asset.id)"
            />
          </div>
        </div>

        <div class="input-toolbar">
          <el-button link size="small" @click="handleTriggerAttachment">
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
  transition: all 0.3s;
  position: relative;
}

.input-container.dragging-over {
  border-color: var(--primary-color) !important;
  box-shadow: 0 0 15px var(--primary-color-alpha) !important;
  background-color: var(--primary-color-alpha, rgba(64, 158, 255, 0.1)) !important;
  position: relative;
}

.input-container.dragging-over::after {
  content: "释放以添加参考图";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.05);
  color: var(--primary-color);
  font-size: 18px;
  font-weight: bold;
  pointer-events: none;
  z-index: 100;
  border-radius: inherit;
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
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  box-shadow: var(--el-box-shadow-lighter);
}

.input-container:focus-within {
  border-color: var(--el-color-primary);
  background-color: var(--card-bg);
  box-shadow: var(--el-box-shadow-light);
}

.attachments-area {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(0, 0, 0, 0.02);
  margin-bottom: 4px;
}

.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
