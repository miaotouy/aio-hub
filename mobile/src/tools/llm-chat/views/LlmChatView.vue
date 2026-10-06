<script setup lang="ts">
import { computed, ref, onMounted, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import { useKeyboardAvoidance } from "@/composables/useKeyboardAvoidance";
import { useChatExecutor } from "../composables/useChatExecutor";
import { useNodeManager } from "../composables/useNodeManager";
import { useChatSettings } from "../composables/useChatSettings";
import {
  confirmDeleteMessage,
  showChatError,
  showChatSuccess,
} from "../utils/chatFeedback";
import type { ChatMessageNode, ChatMessageReference } from "../types";
import { createReplyReference } from "../utils/replyReference";
import { Check, ChevronDown, ChevronLeft } from "lucide-vue-next";
import { useRouter } from "vue-router";
import MessageList from "../components/MessageList.vue";
import ChatInput from "../components/ChatInput.vue";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useI18n } from "@/i18n";
const route = useRoute();
const router = useRouter();
const chatStore = useLlmChatStore();
const profilesStore = useLlmProfilesStore();
const agentStore = useAgentStore();
const { isKeyboardVisible } = useKeyboardAvoidance();
const { regenerate, continueGeneration } = useChatExecutor();
const nodeManager = useNodeManager();
const { settings, loadSettings } = useChatSettings();
const { t } = useI18n();

const messageListRef = ref<any>(null);
const editingMessage = ref<ChatMessageNode | null>(null);
const editContent = ref("");
const showEditDialog = ref(false);
const showAgentSelector = ref(false);
const replyTo = ref<ChatMessageReference | null>(null);
const activeAgent = computed(() =>
  agentStore.getAgentById(chatStore.currentSession?.displayAgentId)
);
const selectableAgents = computed(() => agentStore.sortedAgents);
const isAvatarImage = (agent: { avatarDataUrl?: string }) =>
  Boolean(agent.avatarDataUrl?.startsWith("data:image/"));
const avatarLabel = (agent: { icon?: string }) =>
  agent.icon?.length && agent.icon.length <= 4 ? agent.icon : "AI";

const activeAgentLabel = computed(
  () =>
    activeAgent.value?.displayName ||
    activeAgent.value?.name ||
    t("tools.llm-chat.ChatView.选择智能体")
);

async function handleSelectAgent(agentId: string) {
  const changed = await chatStore.setSessionAgent(agentId);
  if (!changed) return;
  showAgentSelector.value = false;
  showChatSuccess(t("tools.llm-chat.ChatView.已切换智能体"));
}

// 初始化会话
onMounted(async () => {
  if (!profilesStore.isLoaded) {
    await profilesStore.init();
  }
  if (!agentStore.isLoaded) {
    await agentStore.init();
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

  const messageId =
    typeof route.query.messageId === "string" ? route.query.messageId : null;
  if (messageId && (await chatStore.focusMessage(messageId))) {
    await nextTick();
    messageListRef.value?.scrollToMessage?.(messageId, "auto");
  }

  // 确保有选中的模型且模型有效
  chatStore.syncSelectedModel(settings.value.modelPreferences.defaultModel);
});

// 监听消息变化，自动滚动到底部
watch(
  () => chatStore.currentActivePath.length,
  () => {
    if (settings.value.uiPreferences.autoScroll) {
      scrollToBottom();
    }
  }
);

// 监听键盘状态，键盘弹出时也尝试滚动到底部
watch(isKeyboardVisible, (visible) => {
  if (visible && settings.value.uiPreferences.autoScroll) {
    setTimeout(scrollToBottom, 300);
  }
});

const scrollToBottom = () => {
  nextTick(() => {
    messageListRef.value?.scrollToBottom?.();
  });
};

const handleReply = (message: ChatMessageNode) => {
  replyTo.value = createReplyReference(message);
};

const handleRegenerate = async (message: ChatMessageNode) => {
  if (chatStore.currentSession) {
    await regenerate(chatStore.currentSession, message);
  }
};

const handleContinue = async (message: ChatMessageNode) => {
  if (chatStore.currentSession) {
    await continueGeneration(chatStore.currentSession, message);
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
    showChatSuccess(t("tools.llm-chat.ChatView.消息已删除"));
  }
};

const handleCopy = () => {
  showChatSuccess(t("tools.llm-chat.ChatView.已复制内容"));
};

const handleCopyError = () => {
  showChatError(t("tools.llm-chat.ChatView.复制失败"));
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
  showChatSuccess(t("tools.llm-chat.ChatView.消息已更新"));
};

const handleSaveEditAsBranch = async () => {
  if (!editingMessage.value) return;
  const branch = await chatStore.saveEditAsBranch(
    editingMessage.value.id,
    editContent.value
  );
  showEditDialog.value = false;
  if (branch) {
    showChatSuccess(t("tools.llm-chat.ChatView.已保存为新分支"));
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
  <div
    class="llm-chat-view"
    data-testid="chat-view"
    :class="{ 'keyboard-open': isKeyboardVisible }"
  >
    <var-app-bar
      :title="
        chatStore.currentSession?.name || t('tools.llm-chat.ChatView.对话')
      "
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
          data-testid="chat-back"
          @click="goToChatHome"
        >
          <ChevronLeft :size="24" />
        </var-button>
      </template>
      <template #right>
        <button
          class="active-agent"
          type="button"
          data-testid="chat-agent-selector-toggle"
          :title="t('tools.llm-chat.ChatView.切换智能体')"
          :aria-label="t('tools.llm-chat.ChatView.切换智能体')"
          :disabled="selectableAgents.length === 0 || chatStore.isSending"
          @click="showAgentSelector = true"
        >
          <span class="active-agent-avatar">
            <img
              v-if="activeAgent && isAvatarImage(activeAgent)"
              :src="activeAgent.avatarDataUrl"
              :alt="activeAgentLabel"
            />
            <span v-else>{{
              activeAgent ? avatarLabel(activeAgent) : "AI"
            }}</span>
          </span>
          <span class="active-agent-name">{{ activeAgentLabel }}</span>
          <ChevronDown :size="15" />
        </button>
      </template>
    </var-app-bar>
    <div class="nav-bar-placeholder"></div>

    <div class="chat-container">
      <MessageList
        ref="messageListRef"
        :messages="chatStore.currentActivePath"
        :auto-scroll="settings.uiPreferences.autoScroll"
        :font-size="settings.uiPreferences.fontSize"
        :show-navigator="settings.uiPreferences.showMessageNavigator"
        class="message-list-area"
        @copy="handleCopy"
        @copy-error="handleCopyError"
        @edit="handleEdit"
        @reply="handleReply"
        @regenerate="handleRegenerate"
        @continue="handleContinue"
        @delete="handleDelete"
        @switch-sibling="handleSwitchSibling"
        @switch-branch="handleSwitchBranch"
      />

      <ChatInput
        class="chat-input-area"
        :reply-to="replyTo"
        @clear-reply="replyTo = null"
      />
    </div>

    <var-popup v-model:show="showAgentSelector" position="bottom" round>
      <section class="agent-selector" data-testid="chat-agent-selector">
        <div class="drawer-handle"></div>
        <header class="agent-selector-header">
          <h2>{{ t("tools.llm-chat.ChatView.切换智能体") }}</h2>
          <span>{{ selectableAgents.length }}</span>
        </header>
        <div class="agent-selector-list">
          <button
            v-for="agent in selectableAgents"
            :key="agent.id"
            type="button"
            class="agent-selector-item"
            data-testid="chat-agent-selector-item"
            :data-agent-id="agent.id"
            :class="{
              active: agent.id === chatStore.currentSession?.displayAgentId,
            }"
            @click="handleSelectAgent(agent.id)"
          >
            <span class="agent-selector-avatar">
              <img
                v-if="isAvatarImage(agent)"
                :src="agent.avatarDataUrl"
                :alt="agent.displayName || agent.name"
              />
              <span v-else>{{ avatarLabel(agent) }}</span>
            </span>
            <span class="agent-selector-copy">
              <strong>{{ agent.displayName || agent.name }}</strong>
              <small>{{ agent.modelId }}</small>
            </span>
            <Check
              v-if="agent.id === chatStore.currentSession?.displayAgentId"
              :size="19"
              class="agent-selector-check"
            />
          </button>
          <p v-if="selectableAgents.length === 0" class="agent-selector-empty">
            {{ t("tools.llm-chat.ChatView.暂无可切换智能体") }}
          </p>
        </div>
      </section>
    </var-popup>

    <var-dialog
      v-model:show="showEditDialog"
      :title="t('tools.llm-chat.ChatView.编辑消息')"
      :close-on-click-overlay="true"
      :show-cancel-button="false"
      :show-confirm-button="false"
    >
      <div class="edit-dialog-body">
        <textarea
          v-model="editContent"
          class="edit-textarea"
          rows="8"
          :placeholder="t('tools.llm-chat.ChatView.输入消息内容')"
        ></textarea>
        <div class="edit-actions">
          <var-button text @click="showEditDialog = false">
            {{ t("tools.llm-chat.ChatView.取消") }}
          </var-button>
          <var-button type="primary" plain @click="handleSaveEditAsBranch">
            {{ t("tools.llm-chat.ChatView.另存为分支") }}
          </var-button>
          <var-button type="primary" @click="handleSaveEdit">
            {{ t("tools.llm-chat.ChatView.保存") }}
          </var-button>
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

.active-agent {
  max-width: 148px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--app-radius-md);
  color: inherit;
  background: transparent;
}
.active-agent:active:not(:disabled) {
  background: var(--input-bg);
}
.active-agent:disabled {
  opacity: 0.58;
}

.active-agent-avatar {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: grid;
  place-items: center;
  border-radius: var(--app-radius-md);
  background: var(--primary-color);
  color: white;
  font-size: var(--font-size-xs);
  font-weight: 700;
  overflow: hidden;
}
.active-agent-avatar img,
.agent-selector-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.active-agent-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--font-size-xs);
}

.agent-selector {
  max-height: min(68vh, 520px);
  display: flex;
  flex-direction: column;
  padding: 10px 14px calc(18px + env(safe-area-inset-bottom));
  color: var(--text-color);
  background: var(--card-bg);
}
.drawer-handle {
  width: 40px;
  height: 4px;
  align-self: center;
  margin-bottom: 12px;
  border-radius: 999px;
  background: var(--border-color);
}
.agent-selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 12px;
}
.agent-selector-header h2 {
  margin: 0;
  font-size: var(--font-size-md);
}
.agent-selector-header span {
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
}
.agent-selector-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.agent-selector-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  color: inherit;
  background: var(--input-bg);
  text-align: left;
}
.agent-selector-item.active {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, var(--input-bg));
}
.agent-selector-avatar {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  border-radius: var(--app-radius-md);
  color: white;
  background: var(--primary-color);
  font-size: var(--font-size-sm);
  font-weight: 700;
  overflow: hidden;
}
.agent-selector-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.agent-selector-copy strong,
.agent-selector-copy small {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.agent-selector-copy small {
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.agent-selector-check {
  flex: 0 0 auto;
  color: var(--primary-color);
}
.agent-selector-empty {
  margin: 16px 0;
  color: var(--text-color-light);
  text-align: center;
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
  border-radius: var(--app-radius-md);
  background: var(--input-bg);
  color: var(--text-color);
  padding: 12px;
  font-size: var(--font-size-md);
  line-height: 1.55;
  outline: none;
}

.edit-textarea:focus {
  border-color: var(--primary-color);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
