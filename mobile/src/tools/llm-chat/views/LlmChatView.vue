<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";
import { useChatExecutor } from "../composables/useChatExecutor";
import { useNodeManager } from "../composables/useNodeManager";
import { useChatSettings } from "../composables/useChatSettings";
import { confirmDeleteMessage, showChatSuccess } from "../utils/chatFeedback";
import type { ChatMessageNode } from "../types";
import { ChevronLeft } from "lucide-vue-next";
import { useRouter } from "vue-router";
import MessageList from "../components/MessageList.vue";
import ChatInput from "../components/ChatInput.vue";
const route = useRoute();
const router = useRouter();
const chatStore = useLlmChatStore();
const profilesStore = useLlmProfilesStore();
const { isKeyboardVisible } = useKeyboardAvoidance();
const { regenerate } = useChatExecutor();
const nodeManager = useNodeManager();
const { settings, loadSettings } = useChatSettings();

const messageListRef = ref<any>(null);
const editingMessage = ref<ChatMessageNode | null>(null);
const editContent = ref("");
const showEditDialog = ref(false);

// 初始化会话
onMounted(async () => {
  if (!profilesStore.isLoaded) {
    await profilesStore.init();
  }

  await loadSettings();

  // 初始化聊天 Store (加载索引等)
  if (!chatStore.isLoaded) {
    await chatStore.init();
  }

  const sessionId = route.params.id as string;
  if (sessionId) {
    await chatStore.switchSession(sessionId);
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

const handleRegenerate = async (message: ChatMessageNode) => {
  if (chatStore.currentSession) {
    await regenerate(chatStore.currentSession, message);
  }
};

const handleDelete = async (message: ChatMessageNode) => {
  if (chatStore.currentSession) {
    if (settings.value.messageManagement.confirmBeforeDeleteMessage) {
      const confirmed = await confirmDeleteMessage();
      if (!confirmed) return;
    }

    nodeManager.hardDeleteNode(chatStore.currentSession, message.id);
    await chatStore.persistCurrentSession();
    showChatSuccess("消息已删除");
  }
};

const handleCopy = () => {
  showChatSuccess("已复制内容");
};

const handleEdit = (message: ChatMessageNode) => {
  editingMessage.value = message;
  editContent.value = message.content;
  showEditDialog.value = true;
};

const handleSaveEdit = async () => {
  if (!editingMessage.value) return;
  await chatStore.editMessage(editingMessage.value.id, editContent.value);
  showEditDialog.value = false;
  showChatSuccess("消息已更新");
};

const handleSaveEditAsBranch = async () => {
  if (!editingMessage.value) return;
  const branch = await chatStore.saveEditAsBranch(
    editingMessage.value.id,
    editContent.value
  );
  showEditDialog.value = false;
  if (branch) {
    showChatSuccess("已保存为新分支");
  }
};

const handleSwitchSibling = async (
  message: ChatMessageNode,
  direction: "prev" | "next"
) => {
  await chatStore.switchSibling(message.id, direction);
};

const handleSwitchBranch = async (nodeId: string) => {
  await chatStore.switchBranch(nodeId);
};

const goToChatHome = () => {
  router.push("/tools/llm-chat/home");
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
          @click="goToChatHome"
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
        @copy="handleCopy"
        @edit="handleEdit"
        @regenerate="handleRegenerate"
        @delete="handleDelete"
        @switch-sibling="handleSwitchSibling"
        @switch-branch="handleSwitchBranch"
      />

      <ChatInput class="chat-input-area" />
    </div>

    <var-dialog
      v-model:show="showEditDialog"
      title="编辑消息"
      :close-on-click-overlay="true"
      :show-cancel-button="false"
      :show-confirm-button="false"
    >
      <div class="edit-dialog-body">
        <textarea
          v-model="editContent"
          class="edit-textarea"
          rows="8"
          placeholder="输入消息内容"
        ></textarea>
        <div class="edit-actions">
          <var-button text @click="showEditDialog = false">取消</var-button>
          <var-button type="primary" plain @click="handleSaveEditAsBranch">
            另存为分支
          </var-button>
          <var-button type="primary" @click="handleSaveEdit"> 保存 </var-button>
        </div>
      </div>
    </var-dialog>
  </div>
</template>

<style scoped>
.llm-chat-view {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg-color);
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

.edit-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.edit-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 180px;
  max-height: 42vh;
  resize: vertical;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-color);
  padding: 12px;
  font-size: 0.95rem;
  line-height: 1.55;
  outline: none;
}

.edit-textarea:focus {
  border-color: var(--el-color-primary);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
