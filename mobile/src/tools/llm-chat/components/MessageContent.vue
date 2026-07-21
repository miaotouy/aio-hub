<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Brain,
  Eye,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Paperclip,
  X,
} from "lucide-vue-next";
import type { ChatMessageNode } from "../types";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import {
  getAssetPreviewSource,
  revokeAssetPreviewSource,
} from "../../asset-manager/services/assetService";
import { customMessage } from "@/utils/feedback";
import {
  getAttachmentAvailabilityMap,
  type ChatAttachmentAvailability,
} from "../utils/attachmentStatus";

const props = defineProps<{
  message: ChatMessageNode;
}>();

const isReasoningExpanded = ref(true);
const attachmentAvailability = ref(
  new Map<string, ChatAttachmentAvailability>()
);
const imagePreview = ref<{
  id: string;
  url: string;
  displayName: string;
} | null>(null);
const imagePreviewLoading = ref(false);
let availabilityRequest = 0;
let previewRequest = 0;

const refreshAttachmentAvailability = async () => {
  const request = ++availabilityRequest;
  const attachments = props.message.attachments ?? [];
  if (!attachments.length) {
    attachmentAvailability.value = new Map();
    return;
  }
  const availability = await getAttachmentAvailabilityMap(attachments);
  if (request === availabilityRequest) {
    attachmentAvailability.value = availability;
  }
};

watch(
  () =>
    `${props.message.id}:${props.message.attachments
      ?.map((attachment) => attachment.assetId)
      .join("|")}`,
  async () => {
    await closeImagePreview();
    await refreshAttachmentAvailability();
  },
  { immediate: true }
);

async function closeImagePreview() {
  previewRequest += 1;
  imagePreviewLoading.value = false;
  const current = imagePreview.value;
  imagePreview.value = null;
  if (current) {
    await revokeAssetPreviewSource(current.id).catch(() => undefined);
  }
}

async function openImagePreview(
  assetId: string,
  displayName: string,
  status: ChatAttachmentAvailability | undefined
) {
  if (status !== "ready" || imagePreviewLoading.value) return;
  await closeImagePreview();
  const request = ++previewRequest;
  imagePreviewLoading.value = true;
  try {
    const preview = await getAssetPreviewSource(assetId);
    if (request !== previewRequest) {
      await revokeAssetPreviewSource(preview.id).catch(() => undefined);
      return;
    }
    imagePreview.value = {
      id: preview.id,
      url: preview.url,
      displayName,
    };
  } catch {
    if (request === previewRequest) {
      customMessage("无法打开图片预览", "warning");
    }
  } finally {
    if (request === previewRequest) {
      imagePreviewLoading.value = false;
    }
  }
}

onBeforeUnmount(() => {
  void closeImagePreview();
});

const getAttachmentStatus = (
  assetId: string
): ChatAttachmentAvailability | undefined =>
  attachmentAvailability.value.get(assetId);

const getAttachmentStatusLabel = (
  status: ChatAttachmentAvailability | undefined
): string => {
  switch (status) {
    case "reclaimed":
      return "原件已清理";
    case "missing":
    case "missing_record":
      return "原件缺失";
    case "importing":
      return "原件导入中";
    case "error":
      return "原件不可用";
    default:
      return "";
  }
};

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
};
</script>

<template>
  <div class="message-content">
    <div v-if="message.attachments?.length" class="attachment-list">
      <div
        v-for="attachment in message.attachments"
        :key="attachment.id"
        class="attachment-item"
        :class="{
          unavailable:
            getAttachmentStatus(attachment.assetId) !== undefined &&
            getAttachmentStatus(attachment.assetId) !== 'ready',
        }"
      >
        <FileImage v-if="attachment.snapshot.kind === 'image'" :size="17" />
        <FileAudio
          v-else-if="attachment.snapshot.kind === 'audio'"
          :size="17"
        />
        <FileVideo
          v-else-if="attachment.snapshot.kind === 'video'"
          :size="17"
        />
        <FileText
          v-else-if="attachment.snapshot.kind === 'document'"
          :size="17"
        />
        <Paperclip v-else :size="17" />
        <span class="attachment-name">{{
          attachment.snapshot.displayName
        }}</span>
        <span class="attachment-size">{{
          formatBytes(attachment.snapshot.sizeBytes)
        }}</span>
        <button
          v-if="
            attachment.snapshot.kind === 'image' &&
            getAttachmentStatus(attachment.assetId) === 'ready'
          "
          type="button"
          class="attachment-preview-trigger"
          aria-label="预览图片"
          :disabled="imagePreviewLoading"
          @click.stop="
            openImagePreview(
              attachment.assetId,
              attachment.snapshot.displayName,
              getAttachmentStatus(attachment.assetId)
            )
          "
        >
          <Eye :size="15" />
        </button>
        <span
          v-if="
            getAttachmentStatusLabel(getAttachmentStatus(attachment.assetId))
          "
          class="attachment-status"
        >
          <AlertCircle :size="13" />
          {{
            getAttachmentStatusLabel(getAttachmentStatus(attachment.assetId))
          }}
        </span>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="imagePreview"
        class="image-preview-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
        @click.self="closeImagePreview"
      >
        <button
          type="button"
          class="image-preview-close"
          aria-label="关闭图片预览"
          @click="closeImagePreview"
        >
          <X :size="22" />
        </button>
        <img
          class="image-preview-image"
          :src="imagePreview.url"
          :alt="imagePreview.displayName"
        />
      </div>
    </Teleport>

    <!-- 思考过程折叠框 -->
    <div v-if="message.metadata?.reasoningContent" class="reasoning-container">
      <div
        class="reasoning-header"
        @click="isReasoningExpanded = !isReasoningExpanded"
      >
        <div class="reasoning-title">
          <Brain :size="14" class="brain-icon" />
          <span>AI 思考过程</span>
        </div>
        <ChevronDown v-if="isReasoningExpanded" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="isReasoningExpanded" class="reasoning-content">
        <RichTextRenderer :content="message.metadata.reasoningContent" />
      </div>
    </div>

    <div
      v-if="
        message.status === 'generating' &&
        !message.content &&
        !message.metadata?.reasoningContent
      "
      class="loading-dots"
    >
      <span>.</span><span>.</span><span>.</span>
    </div>

    <div v-if="message.content" class="text-content">
      <RichTextRenderer
        :content="message.content"
        :is-streaming="message.status === 'generating'"
      />
    </div>

    <div v-if="message.status === 'error'" class="error-info">
      <AlertCircle :size="14" />
      <div class="error-text">
        <div class="error-title">发送失败</div>
        <div v-if="message.metadata?.error" class="error-detail">
          {{ message.metadata.error }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-content {
  font-size: 0.95rem;
  line-height: 1.5;
  word-break: break-word;
}

.text-content {
  margin-top: 4px;
}

.attachment-list {
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
}

.attachment-item {
  min-width: 0;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  color: var(--color-on-surface-variant);
  background: var(--color-surface-container-low);
}

.attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-size {
  font-size: 0.72rem;
  white-space: nowrap;
}

.attachment-preview-trigger,
.image-preview-close {
  display: grid;
  place-items: center;
  border: 0;
  color: inherit;
  background: transparent;
}

.attachment-preview-trigger {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.attachment-preview-trigger:disabled {
  opacity: 0.45;
}

.attachment-item.unavailable {
  border-color: var(--color-warning, #d58a00);
}

.attachment-status {
  grid-column: 2 / -1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-warning, #a86400);
  font-size: 0.72rem;
}

.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: calc(60px + env(safe-area-inset-top)) 16px
    calc(28px + env(safe-area-inset-bottom));
  overflow: hidden;
  background: rgba(0, 0, 0, 0.92);
}

.image-preview-close {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top));
  right: 10px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: white;
  background: rgba(255, 255, 255, 0.12);
}

.image-preview-image {
  display: block;
  max-width: calc(100vw - 32px);
  max-height: calc(
    100dvh - 88px - env(safe-area-inset-top) - env(safe-area-inset-bottom)
  );
  object-fit: contain;
}

.reasoning-container {
  margin-bottom: 12px;
  border-left: 3px solid var(--el-border-color-darker);
  background: var(--el-fill-color-lighter);
  border-radius: 0 8px 8px 0;
  overflow: hidden;
}

.reasoning-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
}

.reasoning-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.brain-icon {
  color: var(--el-color-primary);
}

.reasoning-content {
  padding: 0 12px 12px 12px;
  font-size: 0.85rem;
  color: var(--el-text-color-regular);
  opacity: 0.85;
}

.error-info {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--el-color-danger);
  font-size: 0.8rem;
  margin-top: 8px;
  padding: 8px;
  background: var(--el-color-danger-light-9);
  border-radius: 8px;
}

.error-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-title {
  font-weight: bold;
}

.error-detail {
  opacity: 0.8;
  font-size: 0.75rem;
  word-break: break-all;
}

.loading-dots {
  display: flex;
  gap: 2px;
}

.loading-dots span {
  animation: blink 1.4s infinite both;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0% {
    opacity: 0.2;
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0.2;
  }
}
</style>
