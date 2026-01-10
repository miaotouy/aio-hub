<script setup lang="ts">
import type { ChatMessageNode } from '../types';
import { User, Bot } from 'lucide-vue-next';
import { useLlmChatStore } from '../stores/llmChatStore';
import MessageContent from './MessageContent.vue';
import MessageMenubar from './MessageMenubar.vue';

defineProps<{
  message: ChatMessageNode;
  isActive?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'close'): void;
}>();

const chatStore = useLlmChatStore();
</script>

<template>
  <div
    class="message-item"
    :class="[message.role, message.status, { 'is-active': isActive }]"
  >
    <div class="avatar">
      <User v-if="message.role === 'user'" :size="20" />
      <Bot v-else-if="message.role === 'assistant'" :size="20" />
    </div>
    
    <div class="message-container">
      <div class="bubble" @click="emit('click')">
        <MessageContent :message="message" />
      </div>
      
      <div class="message-footer">
        <div v-if="message.metadata?.modelDisplayName" class="model-info">
          {{ message.metadata.modelDisplayName }}
        </div>
      </div>

      <!-- 悬挂操作栏 -->
      <transition name="fade">
        <div v-if="isActive" class="menubar-wrapper">
          <MessageMenubar
            :session="chatStore.currentSession"
            :message="message"
            @close="emit('close')"
          />
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  max-width: 100%;
  position: relative;
}

.message-item.user {
  flex-direction: row-reverse;
  align-self: flex-end;
  margin-left: auto;
}

.message-item.assistant {
  align-self: flex-start;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
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
  gap: 4px;
  max-width: calc(100% - 48px);
}

.bubble {
  padding: 10px 14px;
  border-radius: 16px;
  position: relative;
  transition: all 0.2s ease;
}

.user .bubble {
  background: var(--el-color-primary);
  color: white;
  border-top-right-radius: 4px;
}

.assistant .bubble {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--el-text-color-primary);
  border-top-left-radius: 4px;
}

.message-item.is-active .bubble {
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
  font-size: 0.65rem;
  color: var(--el-text-color-placeholder);
  padding: 0 4px;
  opacity: 0.8;
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
  transition: opacity 0.2s, transform 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>