<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessageNode } from "../types";
import { User, Bot } from "lucide-vue-next";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useChatSettings } from "../composables/useChatSettings";
import { useI18n } from "@/i18n";
import MessageContent from "./MessageContent.vue";
import MessageMenubar from "./MessageMenubar.vue";
import BranchSwitcher from "./BranchSwitcher.vue";

const props = defineProps<{
  message: ChatMessageNode;
  isActive?: boolean;
}>();

const emit = defineEmits<{
  (e: "click"): void;
  (e: "close"): void;
  (e: "copy", message: ChatMessageNode): void;
  (e: "edit", message: ChatMessageNode): void;
  (e: "regenerate", message: ChatMessageNode): void;
  (e: "delete", message: ChatMessageNode): void;
  (
    e: "switch-sibling",
    message: ChatMessageNode,
    direction: "prev" | "next"
  ): void;
  (e: "switch-branch", nodeId: string): void;
}>();

const chatStore = useLlmChatStore();
const { settings } = useChatSettings();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.llm-chat.TokenUsage.${key}`);
const tokenLabel = computed(() => {
  if (props.message.metadata?.contentTokenSource === "api") return t("实际");
  if (props.message.metadata?.contentTokenSource === "fallback")
    return t("字符估算");
  return t("o200k 预估");
});
</script>

<template>
  <div
    class="message-item"
    :class="[message.role, message.status, { 'is-active': isActive }]"
  >
    <!-- 头部：头像 + 信息 -->
    <div class="message-header">
      <div class="avatar">
        <User v-if="message.role === 'user'" :size="14" />
        <Bot v-else :size="14" />
      </div>
      <div
        v-if="
          message.role === 'assistant' && message.metadata?.modelDisplayName
        "
        class="model-info"
      >
        {{ message.metadata.modelDisplayName }}
      </div>
    </div>

    <div class="message-container">
      <div
        class="content-body"
        @click="
          (e) => {
            e.stopPropagation();
            emit('click');
          }
        "
      >
        <MessageContent :message="message" />
      </div>

      <!-- 分支切换器 -->
      <BranchSwitcher :message="message" />

      <div
        v-if="
          settings.uiPreferences.showTokenCount &&
          message.metadata?.contentTokens !== undefined
        "
        class="token-info"
      >
        <span v-if="message.metadata.contentTokenSource !== 'api'">~</span
        >{{ message.metadata.contentTokens.toLocaleString() }} tokens ·
        {{ tokenLabel }}
      </div>

      <!-- 悬挂操作栏 -->
      <transition name="fade">
        <div v-if="isActive" class="menubar-wrapper">
          <MessageMenubar
            :session="chatStore.currentSession"
            :message="message"
            @close="emit('close')"
            @copy="emit('copy', message)"
            @edit="emit('edit', message)"
            @regenerate="emit('regenerate', message)"
            @delete="emit('delete', message)"
            @switch-sibling="
              (direction) => emit('switch-sibling', message, direction)
            "
            @switch-branch="(nodeId) => emit('switch-branch', nodeId)"
          />
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  flex-direction: column;
  padding: 16px;
  max-width: 100%;
  position: relative;
  transition: background-color 0.2s;
}

.message-item.is-active {
  background-color: var(--el-fill-color-lighter);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  width: 100%;
}

.user .message-header {
  flex-direction: row-reverse;
}

.avatar {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.user .avatar {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.message-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.content-body {
  position: relative;
  transition: all 0.2s ease;
  width: 100%;
  line-height: 1.6;
}

.user .content-body {
  padding: 12px 16px;
  border-radius: 16px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  width: auto;
  align-self: flex-end;
  max-width: 92%;
}

.assistant .content-body {
  padding: 0;
  background: transparent;
  border: none;
  color: var(--el-text-color-primary);
  font-size: 1.05rem; /* AI 消息稍微大一点，方便阅读长文 */
}

.message-item.is-active .content-body {
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}

.message-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.user .message-footer {
  justify-content: flex-end;
}

.model-info {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  opacity: 0.9;
}

.token-info {
  margin-top: 4px;
  color: var(--color-on-surface-variant);
  font-size: 0.7rem;
}

/* 悬挂操作栏布局 */
.menubar-wrapper {
  margin-top: 4px;
  display: flex;
}

.user .menubar-wrapper {
  justify-content: flex-end;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
