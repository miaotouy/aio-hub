<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Loader2, AlertCircle, XCircle, GitBranch } from "lucide-vue-next";
import type { MediaMessage } from "../../types";
import type { Asset } from "@/types/asset-management";
import { useMediaGenStore } from "../../stores/mediaGenStore";
import { useAssetManager } from "@/composables/useAssetManager";
import { useImageViewer } from "@/composables/useImageViewer";
import { useAttachmentManager } from "../../composables/useAttachmentManager";
import { useChatFileInteraction } from "@/composables/useFileInteraction";
import { createModuleLogger } from "@/utils/logger";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import AttachmentCard from "@/tools/llm-chat/components/AttachmentCard.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import LlmThinkNode from "@/tools/rich-text-renderer/components/nodes/LlmThinkNode.vue";

interface Props {
  message: MediaMessage;
  isEditing?: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
});

const emit = defineEmits<{
  (e: "save-edit", newContent: string, attachments?: Asset[]): void;
  (e: "save-to-branch", newContent: string, attachments?: Asset[]): void;
  (e: "cancel-edit"): void;
}>();

const store = useMediaGenStore();
const { getAssetUrl } = useAssetManager();
const imageViewer = useImageViewer();
const attachmentManager = useAttachmentManager();
const logger = createModuleLogger("media-generator/message-content");

// 编辑区域引用
const editAreaRef = ref<HTMLElement | undefined>(undefined);

// 编辑状态
const editingContent = ref("");

const initEditMode = () => {
  editingContent.value = props.message.content;

  // 清空附件管理器并加载现有附件
  attachmentManager.clearAttachments();
  if (props.message.attachments && props.message.attachments.length > 0) {
    props.message.attachments.forEach((asset) => {
      attachmentManager.addAsset(asset);
    });
  }
};

const saveEdit = () => {
  if (editingContent.value.trim() || attachmentManager.hasAttachments.value) {
    emit("save-edit", editingContent.value, attachmentManager.attachments.value);
  }
};

const saveToBranch = () => {
  if (editingContent.value.trim() || attachmentManager.hasAttachments.value) {
    emit("save-to-branch", editingContent.value, attachmentManager.attachments.value);
  }
};

const cancelEdit = () => {
  editingContent.value = "";
  attachmentManager.clearAttachments();
  emit("cancel-edit");
};

// 统一的文件交互处理（拖放 + 粘贴）
const { isDraggingOver } = useChatFileInteraction({
  element: editAreaRef,
  onPaths: async (paths: string[]) => {
    if (!props.isEditing) return;
    await attachmentManager.addAttachments(paths);
  },
  onAssets: async (assets: Asset[]) => {
    if (!props.isEditing) return;
    for (const asset of assets) {
      attachmentManager.addAsset(asset);
    }
  },
});

// 监听编辑模式变化
watch(
  () => props.isEditing,
  (newVal) => {
    if (newVal) {
      initEditMode();
    } else {
      attachmentManager.clearAttachments();
    }
  }
);

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
      const urls = await Promise.all(assets.map((asset: Asset) => getAssetUrl(asset)));
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

// 推理状态计算
const isReasoning = computed(() => {
  return !!(
    props.message.status === "generating" &&
    props.message.metadata?.reasoningContent &&
    !props.message.metadata?.reasoningEndTime &&
    !props.message.metadata?.error
  );
});

const generationMetaForRenderer = computed(() => {
  const metadata = props.message.metadata;
  if (!metadata) return undefined;

  return {
    requestStartTime: metadata.requestStartTime,
    requestEndTime: metadata.requestEndTime,
    reasoningStartTime: metadata.reasoningStartTime,
    reasoningEndTime: metadata.reasoningEndTime,
    firstTokenTime: metadata.firstTokenTime,
    tokensPerSecond: metadata.tokensPerSecond,
    usage: metadata.usage,
    modelId: metadata.modelId,
  };
});
</script>

<template>
  <div class="message-content">
    <!-- 推理内容 (DeepSeek / O1) -->
    <LlmThinkNode
      v-if="message.metadata?.reasoningContent"
      raw-tag-name="reasoning"
      rule-id="reasoning-metadata"
      display-name="深度思考"
      :is-thinking="isReasoning"
      :collapsed-by-default="true"
      :raw-content="message.metadata.reasoningContent"
      :generation-meta="generationMetaForRenderer"
    />
    <RichTextRenderer
      :content="message.content"
      :generation-meta="generationMetaForRenderer"
      :llm-think-rules="llmThinkRules"
    />

    <!-- 编辑模式 -->
    <div
      v-if="isEditing"
      ref="editAreaRef"
      class="edit-mode"
      :class="{ 'is-dragging': isDraggingOver }"
    >
      <!-- 编辑模式的附件展示 -->
      <div
        v-if="attachmentManager.hasAttachments.value"
        class="attachments-section edit-attachments"
      >
        <div class="attachments-list">
          <AttachmentCard
            v-for="attachment in attachmentManager.attachments.value"
            :key="attachment.id"
            :asset="attachment"
            :all-assets="attachmentManager.attachments.value"
            :removable="true"
            size="medium"
            @remove="attachmentManager.removeAttachment($event.id)"
          />
        </div>
      </div>

      <textarea
        v-model="editingContent"
        class="edit-textarea"
        rows="3"
        placeholder="编辑提示词、拖入或粘贴图片..."
        @keydown.ctrl.enter="saveEdit"
        @keydown.esc="cancelEdit"
      />
      <div class="edit-actions">
        <div class="edit-info">
          <span v-if="attachmentManager.attachmentCount.value > 0" class="attachment-count">
            {{ attachmentManager.attachmentCount.value }} 个附件
          </span>
          <span class="drag-tip">拖拽文件到此区域添加附件</span>
        </div>
        <div class="edit-buttons">
          <el-button @click="saveEdit" type="primary" size="small">保存 (Ctrl+Enter)</el-button>
          <el-button @click="saveToBranch" size="small" :icon="GitBranch">保存到新分支</el-button>
          <el-button @click="cancelEdit" size="small">取消 (Esc)</el-button>
        </div>
      </div>
    </div>

    <!-- 用户 Prompt -->
    <div v-else-if="message.role === 'user'" class="prompt-content">
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

/* 编辑模式样式 */
.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  backdrop-filter: blur(var(--ui-blur));
  margin-bottom: 8px;
  transition: all 0.2s ease;
}

.edit-mode.is-dragging {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border-color: var(--primary-color);
}

.edit-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  color: var(--text-color);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  min-height: 120px;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.edit-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  background-color: var(--input-bg);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 15%, transparent);
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
}

.edit-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-color-light);
}

.attachment-count {
  padding: 2px 8px;
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border-radius: 12px;
  color: var(--primary-color);
  font-weight: 500;
}

.drag-tip {
  opacity: 0.7;
}

.edit-buttons {
  display: flex;
  gap: 8px;
}

/* 附件展示区域样式 */
.attachments-section {
  margin-bottom: 12px;
  border-radius: 8px;
}

.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 0;
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
