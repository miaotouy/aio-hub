<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Copy, Check } from "lucide-vue-next";
import type { ChatMessageNode } from "../../types";
import type { Asset } from "@/types/asset-management";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { useChatSettings } from "../../composables/useChatSettings";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import LlmThinkNode from "@/tools/rich-text-renderer/components/nodes/LlmThinkNode.vue";
import AttachmentCard from "../AttachmentCard.vue";
import { useAttachmentManager } from "../../composables/useAttachmentManager";
import { useChatFileInteraction } from "@/composables/useFileInteraction";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DocumentViewer from "@/components/common/DocumentViewer.vue";

const logger = createModuleLogger("MessageContent");
const { settings } = useChatSettings();

interface Props {
  message: ChatMessageNode;
  isEditing?: boolean;
  llmThinkRules?: import('@/tools/rich-text-renderer/types').LlmThinkRule[];
  richTextStyleOptions?: import('@/tools/rich-text-renderer/types').RichTextRendererStyleOptions;
}

interface Emits {
  (e: "save-edit", newContent: string, attachments?: Asset[]): void;
  (e: "cancel-edit"): void;
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
});
const emit = defineEmits<Emits>();

// 附件管理器 - 用于编辑模式（使用默认配置）
const attachmentManager = useAttachmentManager();

// 是否有附件 - 非编辑模式显示原始附件
const hasAttachments = computed(() => {
  return props.message.attachments && props.message.attachments.length > 0;
});


// 编辑状态
const editingContent = ref("");

// 错误信息复制状态
const errorCopied = ref(false);

// 文档预览状态
const documentPreviewVisible = ref(false);
const previewingAsset = ref<Asset | null>(null);

// 判断是否正在推理中
const isReasoning = computed(() => {
  return !!(
    props.message.status === "generating" &&
    props.message.metadata?.reasoningContent &&
    !props.message.metadata?.reasoningEndTime
  );
});

// 提取生成元数据用于渲染器计时
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
    modelId: metadata.modelId, // 传递模型 ID
  };
});

// 编辑区域引用
const editAreaRef = ref<HTMLElement | undefined>(undefined);

// 当进入编辑模式时，初始化编辑内容和附件
const initEditMode = () => {
  editingContent.value = props.message.content;
  
  // 清空附件管理器
  attachmentManager.clearAttachments();
  
  // 加载现有附件
  if (props.message.attachments && props.message.attachments.length > 0) {
    props.message.attachments.forEach((asset) => {
      attachmentManager.addAsset(asset);
    });
  }
};

// 保存编辑
const saveEdit = () => {
  if (editingContent.value.trim()) {
    // 传递文本内容和附件列表
    const attachments = attachmentManager.attachments.value.length > 0
      ? attachmentManager.attachments.value
      : undefined;
    emit("save-edit", editingContent.value, attachments);
  }
};

// 取消编辑
const cancelEdit = () => {
  editingContent.value = "";
  attachmentManager.clearAttachments();
  emit("cancel-edit");
};

// 处理附件移除
const handleRemoveAttachment = (asset: Asset) => {
  attachmentManager.removeAttachment(asset);
};

// 处理文档预览
const handlePreviewDocument = (asset: Asset) => {
  previewingAsset.value = asset;
  documentPreviewVisible.value = true;
};

// 关闭文档预览
const closeDocumentPreview = () => {
  documentPreviewVisible.value = false;
  previewingAsset.value = null;
};

// 统一的文件交互处理（拖放 + 粘贴）
const { isDraggingOver } = useChatFileInteraction({
  element: editAreaRef,
  onPaths: async (paths: string[]) => {
    if (!props.isEditing) return;
    await attachmentManager.addAttachments(paths);
  },
  onAssets: async (assets) => {
    if (!props.isEditing) return;
    logger.info('编辑模式粘贴文件', { count: assets.length });
    let successCount = 0;
    for (const asset of assets) {
      if (attachmentManager.addAsset(asset)) {
        successCount++;
      }
    }
    if (successCount > 0) {
      const message = successCount === 1
        ? `已粘贴文件: ${assets[0].name}`
        : `已粘贴 ${successCount} 个文件`;
      customMessage.success(message);
    }
  },
});
// 复制错误信息
const copyError = async () => {
  if (!props.message.metadata?.error) return;

  try {
    await navigator.clipboard.writeText(props.message.metadata.error);
    errorCopied.value = true;
    customMessage.success("错误信息已复制");

    // 2秒后重置复制状态
    setTimeout(() => {
      errorCopied.value = false;
    }, 2000);
  } catch (err) {
    customMessage.error("复制失败");
  }
};

// 监听编辑模式变化
watch(
  () => props.isEditing,
  (newVal) => {
    if (newVal) {
      initEditMode();
    } else {
      // 退出编辑模式时清空附件管理器
      attachmentManager.clearAttachments();
    }
  }
);
</script>

<template>
  <div class="message-content">
    <!-- 附件展示区域 - 非编辑模式 -->
    <div v-if="!isEditing && hasAttachments" class="attachments-section">
      <div class="attachments-list">
        <AttachmentCard
          v-for="attachment in message.attachments"
          :key="attachment.id"
          :asset="attachment"
          :all-assets="message.attachments"
          :removable="false"
          size="large"
          @preview-document="handlePreviewDocument"
        />
      </div>
    </div>

    <!-- 推理内容（DeepSeek reasoning） -->
    <LlmThinkNode
      v-if="message.metadata?.reasoningContent"
      raw-tag-name="reasoning"
      rule-id="reasoning-metadata"
      display-name="深度思考"
      :is-thinking="isReasoning"
      :collapsed-by-default="true"
      :raw-content="message.metadata.reasoningContent"
      :generation-meta="generationMetaForRenderer"
    >
      <RichTextRenderer
        :content="message.metadata.reasoningContent"
        :version="settings.uiPreferences.rendererVersion"
        :style-options="richTextStyleOptions"
      />
    </LlmThinkNode>

    <!-- 编辑模式 -->
    <div
      v-if="isEditing"
      ref="editAreaRef"
      class="edit-mode"
      :class="{ 'is-dragging': isDraggingOver }"
    >
      <!-- 编辑模式的附件展示 -->
      <div v-if="attachmentManager.hasAttachments.value" class="attachments-section edit-attachments">
        <div class="attachments-list">
          <AttachmentCard
            v-for="attachment in attachmentManager.attachments.value"
            :key="attachment.id"
            :asset="attachment"
            :all-assets="attachmentManager.attachments.value"
            :removable="true"
            size="medium"
            @remove="handleRemoveAttachment"
            @preview-document="handlePreviewDocument"
          />
        </div>
      </div>

      <!-- 文本编辑区域 -->
      <textarea
        v-model="editingContent"
        class="edit-textarea"
        rows="3"
        placeholder="编辑消息内容、拖入或粘贴文件..."
        @keydown.ctrl.enter="saveEdit"
        @keydown.esc="cancelEdit"
      />

      <!-- 操作按钮 -->
      <div class="edit-actions">
        <div class="edit-info">
          <span v-if="attachmentManager.count.value > 0" class="attachment-count">
            {{ attachmentManager.count.value }} 个附件
          </span>
          <span class="drag-tip">拖拽文件到此区域添加附件</span>
        </div>
        <div class="edit-buttons">
          <el-button @click="saveEdit" type="primary" size="small">保存 (Ctrl+Enter)</el-button>
          <el-button @click="cancelEdit" size="small">取消 (Esc)</el-button>
        </div>
      </div>
    </div>

    <!-- 正常显示模式 -->
    <template v-else>
      <RichTextRenderer
        v-if="message.content"
        :content="message.content"
        :version="settings.uiPreferences.rendererVersion"
        :llm-think-rules="llmThinkRules"
        :style-options="richTextStyleOptions"
        :generation-meta="generationMetaForRenderer"
      />
      <div v-if="message.status === 'generating'" class="streaming-indicator">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </template>

    <!-- 元数据 -->
    <div v-if="(settings.uiPreferences.showTokenCount && (message.metadata?.usage || message.metadata?.contentTokens !== undefined)) || message.metadata?.error" class="message-meta">
      <!-- API 返回的完整 Usage 信息（助手消息） -->
      <div v-if="settings.uiPreferences.showTokenCount && message.metadata?.usage" class="usage-info">
        <span>Token: {{ message.metadata.usage.totalTokens }}</span>
        <span class="usage-detail">
          (输入: {{ message.metadata.usage.promptTokens }}, 输出:
          {{ message.metadata.usage.completionTokens }})
        </span>
      </div>
      <!-- 本地计算的单条消息 Token（用户消息） -->
      <div v-else-if="settings.uiPreferences.showTokenCount && message.metadata?.contentTokens !== undefined" class="usage-info">
        <span>本条消息: {{ message.metadata.contentTokens.toLocaleString('en-US') }} tokens</span>
      </div>
      <div v-if="message.metadata?.error" class="error-info">
        <el-button
          @click="copyError"
          class="error-copy-btn"
          :class="{ copied: errorCopied }"
          :title="errorCopied ? '已复制' : '复制错误信息'"
          :icon="errorCopied ? Check : Copy"
          size="small"
          text
        />
        <span class="error-text"> {{ message.metadata.error }}</span>
      </div>
    </div>

    <!-- 文档预览对话框 -->
    <BaseDialog
      v-model="documentPreviewVisible"
      :title="previewingAsset?.name || '文档预览'"
      width="80%"
      height="80vh"
      @close="closeDocumentPreview"
    >
      <DocumentViewer
        v-if="previewingAsset"
        :file-path="previewingAsset.originalPath || previewingAsset.path"
        :file-name="previewingAsset.name"
        :file-type-hint="previewingAsset.mimeType"
        :show-engine-switch="true"
      />
    </BaseDialog>
  </div>
</template>

<style scoped>
.message-content {
  margin: 8px 0;
  font-size: v-bind('settings.uiPreferences.fontSize + "px"');
  line-height: v-bind('settings.uiPreferences.lineHeight');
}

/* 使用深度选择器强制 RichTextRenderer 继承字体设置 */
.message-content :deep(.rich-text-renderer) {
  font-size: inherit;
  line-height: inherit;
}

.message-text {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color);
  font-family: inherit;
}

.streaming-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
}

.streaming-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--primary-color);
  animation: pulse 1.4s infinite ease-in-out;
}

.streaming-indicator .dot:nth-child(1) {
  animation-delay: -0.32s;
}

.streaming-indicator .dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.message-meta {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}

.usage-info {
  color: var(--text-color-light);
}

.usage-detail {
  margin-left: 8px;
  opacity: 0.7;
}

.error-info {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--error-color);
  margin-top: 8px;
  margin-bottom: 32px;
}

.error-text {
  flex: 1;
  font-size: 14px;
  word-break: break-word;
}
.error-copy-btn.copied {
  color: var(--success-color, #67c23a);
}

/* 编辑模式样式 */
.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--container-bg);
  transition: border-color 0.2s, background-color 0.2s;
}

.edit-mode.is-dragging {
  background-color: var(--primary-color-alpha, rgba(64, 158, 255, 0.1));
  border-color: var(--primary-color);
}

.edit-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  background-color: var(--container-bg);
  color: var(--text-color);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  min-height: 300px;
  box-sizing: border-box;
}

.edit-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
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
  background-color: var(--primary-color-alpha, rgba(64, 158, 255, 0.1));
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

/* 推理内容样式 */
/* 样式已移除，使用 LlmThinkNode 组件 */
</style>
