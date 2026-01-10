<script setup lang="ts">
import { ref } from "vue";
import { Send, Loader2 } from "lucide-vue-next";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";
import { useChatExecutor } from "../composables/useChatExecutor";
import LlmModelSelector from "../../llm-api/components/LlmModelSelector.vue";

const chatStore = useLlmChatStore();
const { execute } = useChatExecutor();
const { isKeyboardVisible } = useKeyboardAvoidance();

const inputText = ref("");

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
    </div>

    <div class="input-container">
      <textarea
        v-model="inputText"
        class="text-area"
        rows="1"
        placeholder="输入消息..."
        @keydown.enter.prevent="handleSend"
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
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 键盘弹出时，由 useKeyboardAvoidance 调整整体高度，此处不再需要安全区域 padding */
  padding-bottom: calc(12px + var(--safe-bottom-dynamic, env(safe-area-inset-bottom)));
  transition: padding-bottom 0.2s;
}

.chat-input.keyboard-open {
  --safe-bottom-dynamic: 0px;
  padding-bottom: 8px; /* 键盘打开时稍微收紧 */
}

.toolbar {
  display: flex;
  align-items: center;
}

.toolbar :deep(.llm-model-selector) {
  max-width: 180px;
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
