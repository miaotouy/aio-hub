<script setup lang="ts">
import { computed, ref } from "vue";
import {
  AlertTriangle,
  Send,
  Square,
  Paperclip,
  Reply,
  X,
} from "lucide-vue-next";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";
import { useChatExecutor } from "../composables/useChatExecutor";
import { useContextTokenUsage } from "../composables/useContextTokenUsage";
import { useChatSettings } from "../composables/useChatSettings";
import { useI18n } from "@/i18n";
import LlmModelSelector from "../../llm-api/components/LlmModelSelector.vue";
import AssetPickerSheet from "./AssetPickerSheet.vue";
import type {
  ChatMessageAttachment,
  ChatMessageReference,
} from "../types";

const props = defineProps<{
  replyTo?: ChatMessageReference | null;
}>();
const emit = defineEmits<{
  (e: "clear-reply"): void;
}>();

const chatStore = useLlmChatStore();
const { execute, stop } = useChatExecutor();
const { isKeyboardVisible } = useKeyboardAvoidance();

const inputText = ref("");
const attachments = ref<ChatMessageAttachment[]>([]);
const pickerOpen = ref(false);
const { settings } = useChatSettings();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.llm-chat.TokenUsage.${key}`);
const inputT = (key: string) => tRaw(`tools.llm-chat.ChatInput.${key}`);
const {
  estimatedTokens,
  contextLength,
  usageRatio,
  riskLevel,
  isCalculating,
  isFallback,
  latestActualPromptTokens,
} = useContextTokenUsage(inputText);
const meterWidth = computed(
  () => `${Math.min((usageRatio.value || 0) * 100, 100)}%`
);
const formattedRatio = computed(() =>
  usageRatio.value === undefined ? "" : `${Math.round(usageRatio.value * 100)}%`
);
const formatTokens = (value: number) => value.toLocaleString();
const replyRoleLabel = (role: ChatMessageReference["role"]) =>
  inputT(
    role === "assistant"
      ? "助手消息"
      : role === "system"
        ? "系统消息"
        : "用户消息"
  );

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    handleSend();
  }
};

const handleSend = async () => {
  if (chatStore.isSending) {
    if (chatStore.currentSession) stop(chatStore.currentSession);
    return;
  }
  if (
    !inputText.value.trim() && !attachments.value.length
  )
    return;

  const content = inputText.value;

  if (chatStore.currentSession) {
    const accepted = await execute(
      chatStore.currentSession,
      content,
      undefined,
      attachments.value,
      props.replyTo ?? undefined
    );
    if (accepted) {
      inputText.value = "";
      attachments.value = [];
      emit("clear-reply");
    }
  }
};

const addAttachments = (selected: ChatMessageAttachment[]) => {
  const existing = new Set(attachments.value.map((item) => item.assetId));
  attachments.value = [
    ...attachments.value,
    ...selected.filter((item) => !existing.has(item.assetId)),
  ];
};
</script>

<template>
  <div
    class="chat-input"
    data-testid="chat-input"
    :class="{ 'keyboard-open': isKeyboardVisible }"
  >
    <div class="toolbar">
      <LlmModelSelector v-model="chatStore.selectedModelValue" />
      <div
        v-if="settings.uiPreferences.showTokenCount"
        class="context-usage"
        :class="riskLevel"
      >
        <div class="context-usage-line">
          <AlertTriangle v-if="riskLevel !== 'normal'" :size="14" />
          <span>
            ~{{ formatTokens(estimatedTokens) }}
            <template v-if="contextLength">
              / {{ formatTokens(contextLength) }}</template
            >
            <template v-if="formattedRatio"> · {{ formattedRatio }}</template>
          </span>
          <span class="source-label">
            {{
              isCalculating
                ? t("计算中")
                : isFallback
                  ? t("字符估算")
                  : t("o200k 预估")
            }}
          </span>
          <span
            v-if="latestActualPromptTokens !== undefined"
            class="actual-label"
          >
            {{ t("上次实际") }} {{ formatTokens(latestActualPromptTokens) }}
          </span>
        </div>
        <div v-if="contextLength" class="context-meter" aria-hidden="true">
          <i :style="{ width: meterWidth }" />
        </div>
      </div>
    </div>

    <div v-if="replyTo" class="reply-preview" data-testid="chat-reply-preview">
      <Reply :size="16" aria-hidden="true" />
      <div class="reply-preview-copy">
        <strong>
          {{
            inputT("回复 {role}").replace("{role}", replyRoleLabel(replyTo.role))
          }}
        </strong>
        <span>{{ replyTo.content }}</span>
      </div>
      <button
        type="button"
        class="reply-preview-dismiss"
        :aria-label="inputT('取消回复')"
        @click="emit('clear-reply')"
      >
        <X :size="16" />
      </button>
    </div>

    <div class="input-container">
      <button
        type="button"
        class="attachment-btn"
        data-testid="chat-add-asset"
        :disabled="chatStore.isSending"
        :aria-label="inputT('添加资产')"
        @click="pickerOpen = true"
      >
        <Paperclip :size="19" />
      </button>

      <textarea
        v-model="inputText"
        class="text-area"
        data-testid="chat-message-input"
        rows="1"
        :placeholder="inputT('输入消息 (Ctrl+Enter 发送)...')"
        @keydown="handleKeyDown"
      ></textarea>

      <button
        class="send-btn"
        :class="{ stopping: chatStore.isSending }"
        data-testid="chat-send"
        :aria-label="chatStore.isSending ? inputT('停止生成') : inputT('发送')"
        :disabled="!chatStore.isSending && !inputText.trim() && !attachments.length"
        @click="handleSend"
      >
        <Square v-if="chatStore.isSending" :size="18" />
        <Send v-else :size="20" />
      </button>
    </div>

    <div
      v-if="attachments.length"
      class="pending-attachments"
      data-testid="chat-pending-attachments"
    >
      <span v-for="attachment in attachments" :key="attachment.id">
        {{ attachment.snapshot.displayName }}
        <button
          type="button"
          :aria-label="inputT('移除 {name}').replace('{name}', attachment.snapshot.displayName)"
          @click="
            attachments = attachments.filter(
              (item) => item.id !== attachment.id
            )
          "
        >
          <X :size="14" />
        </button>
      </span>
    </div>

    <AssetPickerSheet
      :open="pickerOpen"
      @close="pickerOpen = false"
      @select="addAttachments"
    />
  </div>
</template>

<style scoped>
.chat-input {
  padding: 12px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-top: var(--border-width) solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 键盘弹出时，由 useKeyboardAvoidance 调整整体高度，此处不再需要安全区域 padding */
  padding-bottom: calc(
    12px + var(--safe-bottom-dynamic, env(safe-area-inset-bottom))
  );
  transition: padding-bottom 0.2s;
}

.chat-input.keyboard-open {
  --safe-bottom-dynamic: 0px;
  padding-bottom: 8px; /* 键盘打开时稍微收紧 */
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar :deep(.llm-model-selector) {
  max-width: 180px;
}

.context-usage {
  min-width: 0;
  flex: 1;
  color: var(--color-on-surface-variant);
  font-size: 0.68rem;
}

.context-usage-line {
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.source-label,
.actual-label {
  white-space: nowrap;
}

.actual-label {
  opacity: 0.82;
}

.context-meter {
  height: 3px;
  margin-top: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--border-color);
}

.context-meter i {
  height: 100%;
  display: block;
  background: var(--color-primary);
  transition: width 0.2s;
}

.context-usage.warning {
  color: var(--color-warning, #a86400);
}

.context-usage.warning .context-meter i {
  background: var(--color-warning, #d58a00);
}

.context-usage.critical {
  color: var(--color-danger, #c43c3c);
}

.context-usage.critical .context-meter i {
  background: var(--color-danger, #d14343);
}

.reply-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  color: var(--color-on-surface-variant);
  background: var(--color-surface-container-low);
}

.reply-preview-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.reply-preview-copy strong,
.reply-preview-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-preview-copy strong {
  font-size: 0.74rem;
  color: var(--color-primary);
}

.reply-preview-copy span {
  font-size: 0.78rem;
}

.reply-preview-dismiss {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: inherit;
  background: transparent;
}

.input-container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--el-fill-color-light);
  border-radius: 20px;
  padding: 4px;
}

.attachment-btn {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-on-surface-variant);
}

.text-area {
  flex: 1;
  border: none;
  background: none;
  resize: none;
  padding: 8px 0;
  font-size: 1rem;
  max-height: 120px;
  color: var(--el-text-color-primary);
  outline: none;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--el-color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.send-btn:disabled {
  opacity: 0.5;
}

.pending-attachments {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.pending-attachments > span {
  max-width: min(72vw, 320px);
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 5px 4px 9px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-on-surface-variant);
  background: var(--color-surface-container-low);
  font-size: 0.78rem;
}

.pending-attachments button {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
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
