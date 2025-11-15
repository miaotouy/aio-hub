<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-vue-next";
import type { ChatMessageNode } from "../../types";
import type { Asset } from "@/types/asset-management";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { useChatSettings } from "../../composables/useChatSettings";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
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


// 推理内容展开状态
const isReasoningExpanded = ref(false);

// 编辑状态
const editingContent = ref("");

// 错误信息复制状态
const errorCopied = ref(false);

// 文档预览状态
const documentPreviewVisible = ref(false);
const previewingAsset = ref<Asset | null>(null);

// 计算推理用时（毫秒）
const reasoningDuration = computed(() => {
  const start = props.message.metadata?.reasoningStartTime;
  const end = props.message.metadata?.reasoningEndTime;
  if (start && end) {
    return end - start;
  }
  return null;
});

// 格式化推理用时
const formattedReasoningDuration = computed(() => {
  const duration = reasoningDuration.value;
  if (duration === null) return "";

  if (duration < 1000) {
    return `${duration}ms`;
  } else if (duration < 60000) {
    return `${(duration / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(duration / 60000);
    const seconds = ((duration % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
});

// 判断是否正在推理中
const isReasoning = computed(() => {
  return (
    props.message.status === "generating" &&
    props.message.metadata?.reasoningContent &&
    !props.message.metadata?.reasoningEndTime
  );
});

// 获取推理内容的最新片段（用于跑马灯显示）
const reasoningPreview = computed(() => {
  const content = props.message.metadata?.reasoningContent;
  if (!content) return "";

  // 获取最后100个字符作为预览
  const previewLength = 100;
  if (content.length <= previewLength) {
    return content;
  }

  // 从最后开始截取，找到一个合适的断句位置
  const preview = content.slice(-previewLength);
  // 尝试从句号、问号、感叹号等位置开始
  const sentenceEnd = preview.search(/[。！？\.\!\?]\s*/);
  if (sentenceEnd !== -1 && sentenceEnd < previewLength - 20) {
    return preview.slice(sentenceEnd + 1).trim();
  }

  return "..." + preview.trim();
});

// 推理内容切换
const toggleReasoning = () => {
  isReasoningExpanded.value = !isReasoningExpanded.value;
};

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
    <div v-if="message.metadata?.reasoningContent" class="reasoning-section">
      <button
        @click="toggleReasoning"
        class="reasoning-toggle"
        :class="{ expanded: isReasoningExpanded }"
      >
        <ChevronRight v-if="!isReasoningExpanded" :size="14" class="toggle-icon" />
        <ChevronDown v-else :size="14" class="toggle-icon" />
        <span class="toggle-text">思维链推理过程</span>
        <!-- 推理进行中：显示内容跑马灯 -->
        <div v-if="isReasoning && !isReasoningExpanded" class="reasoning-marquee">
          <span class="marquee-content">{{ reasoningPreview }}</span>
        </div>
        <!-- 推理完成：显示用时 -->
        <span
          v-else-if="formattedReasoningDuration && !isReasoningExpanded"
          class="reasoning-duration"
        >
          {{ formattedReasoningDuration }}
        </span>
      </button>
      <div v-if="isReasoningExpanded" class="reasoning-content">
        <pre class="reasoning-text">{{ message.metadata.reasoningContent }}</pre>
      </div>
    </div>

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
.reasoning-section {
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--container-bg);
}

.reasoning-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  font-size: 13px;
  transition: background-color 0.2s;
}

.reasoning-toggle:hover {
  background-color: var(--hover-bg);
}

.reasoning-toggle.expanded {
  border-bottom: 1px solid var(--border-color);
}

.toggle-icon {
  color: var(--text-color-light);
  flex-shrink: 0;
}

.toggle-text {
  flex: 1;
  text-align: left;
  font-weight: 500;
}

.reasoning-duration {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 4px;
  flex-shrink: 0;
}

.reasoning-marquee {
  flex: 1;
  margin-left: 8px;
  overflow: hidden;
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  padding: 0 8px;
}

.marquee-content {
  display: inline-block;
  white-space: nowrap;
  color: var(--text-color-light);
  font-size: 12px;
  animation: marquee-scroll 15s linear infinite;
  padding-right: 50px;
}

@keyframes marquee-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-100%);
  }
}

/* 当内容较短时，停止滚动 */
.reasoning-marquee:hover .marquee-content {
  animation-play-state: paused;
}

.reasoning-content {
  padding: 12px;
  background-color: var(--bg-color);
  border-top: 1px solid var(--border-color);
}

.reasoning-text {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color-light);
  font-family: "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.85;
}
</style>
