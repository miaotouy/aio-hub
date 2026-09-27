<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "@/i18n";
import {
  AlertCircle,
  Brain,
  ChevronDown,
  ChevronRight,
  Play,
  Reply,
} from "lucide-vue-next";
import MediaPreviewHost from "@/components/media/MediaPreviewHost.vue";
import type { MediaItem } from "@/components/media/types";
import AttachmentThumbnail from "./AttachmentThumbnail.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import type { ChatMessageAttachment, ChatMessageNode } from "../types";
import { isChatMessageReference } from "../utils/replyReference";
import {
  applyRegexRules,
  collectStageRules,
  filterRulesByDepth,
  filterRulesByRole,
} from "../utils/chatRegex";
import {
  getAttachmentAvailabilityMap,
  type ChatAttachmentAvailability,
} from "../utils/attachmentStatus";

const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.llm-chat.MessageContent.${key}`);

const props = withDefaults(
  defineProps<{
    message: ChatMessageNode;
    /** 该消息渲染阶段使用的正则配置（由 ChatMessage 解析并合并）。 */
    regexConfig?: unknown;
    /** 距离最新消息的深度，0 表示最新。 */
    messageDepth?: number;
  }>(),
  {
    messageDepth: 0,
  }
);

/**
 * 渲染阶段的正则规则：按角色与深度过滤，执行顺序与 request 阶段一致
 * （预设 priority → 规则 order）。无匹配规则时直接短路，避免流式期间
 * 对每个 chunk 做无谓计算；真正的 Markdown 解析节流由 RichTextRenderer 负责。
 */
const renderRules = computed(() => {
  const rules = collectStageRules("render", props.regexConfig);
  if (!rules.length) return [];
  return filterRulesByDepth(
    filterRulesByRole(rules, props.message.role),
    props.messageDepth
  );
});

/** 显示前应用 render 规则；不修改 message.content，只影响界面。 */
const displayedContent = computed(() => {
  const content = props.message.content;
  if (!content || !renderRules.value.length) return content;
  return applyRegexRules(content, renderRules.value).text;
});

const isReasoningExpanded = ref(true);
const replyTo = computed(() =>
  isChatMessageReference(props.message.metadata?.replyTo)
    ? props.message.metadata.replyTo
    : null
);
const replyRoleLabel = computed(() => {
  if (!replyTo.value) return "";
  return t(
    replyTo.value.role === "assistant"
      ? "助手消息"
      : replyTo.value.role === "system"
        ? "系统消息"
        : "用户消息"
  );
});
const attachmentAvailability = ref(
  new Map<string, ChatAttachmentAvailability>()
);
const mediaPreview = ref<MediaItem | null>(null);
let availabilityRequest = 0;

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
    mediaPreview.value = null;
    await refreshAttachmentAvailability();
  },
  { immediate: true }
);

function mediaItemForAttachment(
  attachment: ChatMessageAttachment
): MediaItem | null {
  const { kind, mimeType, displayName } = attachment.snapshot;
  if (kind !== "image" && kind !== "video" && kind !== "audio") return null;
  return {
    assetId: attachment.assetId,
    kind,
    displayName,
    mimeType,
  };
}

/**
 * 附件缩略图通用条目：图片由 AttachmentThumbnail 申请受管来源显示缩略图，
 * 其余类型只显示类型图标（对齐桌面端 AttachmentCard 的横条布局）。
 */
function attachmentThumbItem(attachment: ChatMessageAttachment) {
  const { kind, mimeType, displayName } = attachment.snapshot;
  return { assetId: attachment.assetId, kind, displayName, mimeType };
}

/** 只有确认可用的图片/视频/音频附件可点击打开受控预览。 */
function isInlineMedia(attachment: ChatMessageAttachment): boolean {
  const kind = attachment.snapshot.kind;
  if (kind !== "image" && kind !== "video" && kind !== "audio") return false;
  return getAttachmentStatus(attachment.assetId) === "ready";
}

/**
 * Only message-owned attachments can be resolved from Markdown. This keeps an
 * LLM-generated `asset://` URL from probing arbitrary local library assets.
 */
function resolveMessageMediaItem(source: string): MediaItem | null {
  const match = /^asset:\/\/([a-zA-Z0-9_-]+)$/.exec(source.trim());
  if (!match) return null;
  const attachment = props.message.attachments?.find(
    (candidate) => candidate.assetId === match[1]
  );
  return attachment ? mediaItemForAttachment(attachment) : null;
}

function openMediaPreview(
  attachment: ChatMessageAttachment,
  status: ChatAttachmentAvailability | undefined
) {
  if (status !== "ready") return;
  mediaPreview.value = mediaItemForAttachment(attachment);
}

function onMediaPreviewVisibilityChange(visible: boolean) {
  if (!visible) mediaPreview.value = null;
}

const getAttachmentStatus = (
  assetId: string
): ChatAttachmentAvailability | undefined =>
  attachmentAvailability.value.get(assetId);

const getAttachmentStatusLabel = (
  status: ChatAttachmentAvailability | undefined
): string => {
  switch (status) {
    case "reclaimed":
      return t("原件已清理");
    case "missing":
    case "missing_record":
      return t("原件缺失");
    case "importing":
      return t("原件导入中");
    case "error":
      return t("原件不可用");
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
    <div
      v-if="replyTo"
      class="reply-reference"
      data-testid="message-reply-reference"
    >
      <Reply :size="15" aria-hidden="true" />
      <div>
        <strong>
          {{ t("回复 {role}").replace("{role}", replyRoleLabel) }}
        </strong>
        <p>{{ replyTo.content }}</p>
      </div>
    </div>

    <div v-if="message.attachments?.length" class="attachment-list">
      <template v-for="attachment in message.attachments" :key="attachment.id">
        <!-- 图片：方形缩略图卡（对齐桌面端 AttachmentCard 的图片布局） -->
        <button
          v-if="
            attachment.snapshot.kind === 'image' &&
            getAttachmentStatus(attachment.assetId) === 'ready'
          "
          type="button"
          class="attachment-image"
          :aria-label="
            t('预览 {kind}').replace('{kind}', attachment.snapshot.kind)
          "
          data-testid="message-attachment-preview-image"
          @click.stop="
            openMediaPreview(attachment, getAttachmentStatus(attachment.assetId))
          "
        >
          <AttachmentThumbnail
            :item="attachmentThumbItem(attachment)"
            :size="72"
            lazy
          />
        </button>

        <!-- 音频/视频/文档/其它与不可用附件：横条卡片 -->
        <button
          v-else
          type="button"
          class="attachment-bar"
          :class="{
            clickable: isInlineMedia(attachment),
            unavailable:
              getAttachmentStatus(attachment.assetId) !== undefined &&
              getAttachmentStatus(attachment.assetId) !== 'ready',
          }"
          :aria-label="
            isInlineMedia(attachment)
              ? t('预览 {kind}').replace('{kind}', attachment.snapshot.kind)
              : attachment.snapshot.displayName
          "
          :data-testid="`message-attachment-preview-${attachment.snapshot.kind}`"
          @click.stop="
            openMediaPreview(attachment, getAttachmentStatus(attachment.assetId))
          "
        >
          <span class="attachment-bar-thumb">
            <AttachmentThumbnail
              :item="attachmentThumbItem(attachment)"
              :size="40"
              :enabled="isInlineMedia(attachment)"
              lazy
            />
            <Play
              v-if="
                isInlineMedia(attachment) &&
                (attachment.snapshot.kind === 'video' ||
                  attachment.snapshot.kind === 'audio')
              "
              class="attachment-bar-play"
              :size="14"
              aria-hidden="true"
            />
          </span>
          <span class="attachment-bar-info">
            <span class="attachment-name">{{
              attachment.snapshot.displayName
            }}</span>
            <span class="attachment-bar-meta">
              <span class="attachment-size">{{
                formatBytes(attachment.snapshot.sizeBytes)
              }}</span>
              <span
                v-if="
                  getAttachmentStatusLabel(
                    getAttachmentStatus(attachment.assetId)
                  )
                "
                class="attachment-status"
              >
                <AlertCircle :size="12" />
                {{
                  getAttachmentStatusLabel(
                    getAttachmentStatus(attachment.assetId)
                  )
                }}
              </span>
            </span>
          </span>
        </button>
      </template>
    </div>

    <Teleport to="body">
      <MediaPreviewHost
        v-if="mediaPreview"
        data-testid="chat-attachment-media-preview"
        :model-value="true"
        :item="mediaPreview"
        mode="sheet"
        @update:model-value="onMediaPreviewVisibilityChange"
      />
    </Teleport>

    <!-- 思考过程折叠框 -->
    <div v-if="message.metadata?.reasoningContent" class="reasoning-container">
      <div
        class="reasoning-header"
        @click="isReasoningExpanded = !isReasoningExpanded"
      >
        <div class="reasoning-title">
          <Brain :size="14" class="brain-icon" />
          <span>{{ t("AI 思考过程") }}</span>
        </div>
        <ChevronDown v-if="isReasoningExpanded" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="isReasoningExpanded" class="reasoning-content">
        <RichTextRenderer
          :content="message.metadata.reasoningContent"
          :resolve-media-item="resolveMessageMediaItem"
        />
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
        :content="displayedContent"
        :is-streaming="message.status === 'generating'"
        :resolve-media-item="resolveMessageMediaItem"
      />
    </div>

    <div v-if="message.status === 'error'" class="error-info">
      <AlertCircle :size="14" />
      <div class="error-text">
        <div class="error-title">{{ t("发送失败") }}</div>
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
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

/* 图片：方形缩略图卡 */
.attachment-image {
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  line-height: 0;
  overflow: hidden;
}

/* 音频/视频/文档/其它：横条卡片，对齐桌面端 AttachmentCard */
.attachment-bar {
  flex: 1 1 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  color: var(--color-on-surface-variant);
  background: var(--color-surface-container-low);
  font: inherit;
  text-align: left;
}

.attachment-bar.clickable {
  cursor: pointer;
}

.attachment-bar.unavailable {
  border-color: var(--color-warning, #d58a00);
}

.attachment-bar-thumb {
  position: relative;
  flex: 0 0 auto;
  line-height: 0;
}

.attachment-bar-play {
  position: absolute;
  inset: 0;
  margin: auto;
  color: #fff;
  filter: drop-shadow(0 0 3px rgb(0 0 0 / 60%));
}

.attachment-bar-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.attachment-bar-meta {
  display: flex;
  align-items: center;
  gap: 6px;
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

.attachment-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-warning, #a86400);
  font-size: 0.72rem;
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
