<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";
import { ChevronLeft } from "lucide-vue-next";
import { useRouter } from "vue-router";
import MessageList from "../components/MessageList.vue";
import ChatInput from "../components/ChatInput.vue";
const route = useRoute();
const router = useRouter();
const chatStore = useLlmChatStore();
const profilesStore = useLlmProfilesStore();
const { isKeyboardVisible } = useKeyboardAvoidance();

const messageListRef = ref<any>(null);

// 初始化会话
onMounted(async () => {
  if (!profilesStore.isLoaded) {
    await profilesStore.init();
  }

  const sessionId = route.params.id as string;
  if (sessionId) {
    chatStore.switchSession(sessionId);
  }

  // 确保有选中的模型且模型有效
  chatStore.syncSelectedModel();
});

// 监听消息变化，自动滚动到底部
watch(
  () => chatStore.currentActivePath.length,
  () => {
    scrollToBottom();
  }
);

// 监听键盘状态，键盘弹出时也尝试滚动到底部
watch(isKeyboardVisible, (visible) => {
  if (visible) {
    setTimeout(scrollToBottom, 300);
  }
});

const scrollToBottom = () => {
  nextTick(() => {
    messageListRef.value?.scrollToBottom?.();
  });
};
</script>

<template>
  <div class="llm-chat-view" :class="{ 'keyboard-open': isKeyboardVisible }">
    <var-app-bar
      :title="chatStore.currentSession?.name || '对话'"
      title-size="1.1rem"
      safe-area
      fixed
      z-index="1000"
      class="nav-bar"
    >
      <template #left>
        <var-button
          round
          text
          color="transparent"
          text-color="var(--text-color)"
          @click="router.back()"
        >
          <ChevronLeft :size="24" />
        </var-button>
      </template>
    </var-app-bar>
    <div class="nav-bar-placeholder"></div>

    <div class="chat-container">
      <MessageList
        ref="messageListRef"
        :messages="chatStore.currentActivePath"
        class="message-list-area"
      />

      <ChatInput class="chat-input-area" />
    </div>
  </div>
</template>

<style scoped>
.llm-chat-view {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1001; /* 确保盖住底部导航栏 (AppBottomNav z-index 通常较低) */
  display: flex;
  flex-direction: column;
  height: var(--viewport-height, 100dvh);
  /* 显式设置 bottom 以防万一，但在键盘弹出时 height 会收缩 */
  bottom: auto;
  overflow: hidden;
  background-color: var(--bg-color);
  transition: height 0.15s ease-out; /* 缩短过渡时间，让反馈更及时 */
}

.nav-bar {
  background-color: var(--card-bg) !important;
  backdrop-filter: blur(var(--ui-blur));
  color: var(--text-color) !important;
}

.nav-bar-placeholder {
  height: 54px;
  padding-top: env(safe-area-inset-top);
  flex-shrink: 0;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.message-list-area {
  flex: 1;
}

.chat-input-area {
  flex-shrink: 0;
}
</style>
