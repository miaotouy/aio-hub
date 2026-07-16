<script setup lang="ts">
import { computed, ref } from "vue";
import { AlertTriangle, Send, Loader2 } from "lucide-vue-next";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";
import { useChatExecutor } from "../composables/useChatExecutor";
import { useContextTokenUsage } from "../composables/useContextTokenUsage";
import { useChatSettings } from "../composables/useChatSettings";
import { useI18n } from "@/i18n";
import LlmModelSelector from "../../llm-api/components/LlmModelSelector.vue";

const chatStore = useLlmChatStore();
const { execute } = useChatExecutor();
const { isKeyboardVisible } = useKeyboardAvoidance();

const inputText = ref("");
const { settings } = useChatSettings();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.llm-chat.TokenUsage.${key}`);
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

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    handleSend();
  }
};

const handleSend = async () => {
  if (!inputText.value.trim() || chatStore.isSending) return;

  const content = inputText.value;
  inputText.value = "";

  if (chatStore.currentSession) {
    await execute(chatStore.currentSession, content);
  }
};
</script>

<template>
  <div class="chat-input" :class="{ 'keyboard-open': isKeyboardVisible }">
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

    <div class="input-container">
      <textarea
        v-model="inputText"
        class="text-area"
        rows="1"
        placeholder="输入消息 (Ctrl+Enter 发送)..."
        @keydown="handleKeyDown"
      ></textarea>

      <button
        class="send-btn"
        :disabled="!inputText.trim() || chatStore.isSending"
        @click="handleSend"
      >
        <Loader2 v-if="chatStore.isSending" class="animate-spin" :size="20" />
        <Send v-else :size="20" />
      </button>
    </div>
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

.input-container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--el-fill-color-light);
  border-radius: 20px;
  padding: 4px 4px 4px 12px;
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
