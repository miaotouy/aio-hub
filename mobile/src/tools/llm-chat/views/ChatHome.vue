<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  MessageSquare,
  Users,
  UserCircle,
  BookOpen,
  Plus,
  Settings,
  ChevronLeft,
} from "lucide-vue-next";
import { useI18n } from "@/i18n";
import SafeTop from "@/components/SafeTop.vue";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import { useChatSettings } from "../composables/useChatSettings";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const chatStore = useLlmChatStore();
const profilesStore = useLlmProfilesStore();
const { settings, loadSettings } = useChatSettings();

onMounted(async () => {
  // 加载设置
  await loadSettings();

  if (!profilesStore.isLoaded) {
    await profilesStore.init();
  }

  if (!chatStore.isLoaded) {
    await chatStore.init();
  }

  // 确保有选中的模型且模型有效
  chatStore.syncSelectedModel(settings.value.modelPreferences.defaultModel);

  const agentId =
    typeof route.query.agentId === "string" ? route.query.agentId : null;
  if (agentId) {
    const sessionId = await chatStore.createSession("New Chat", agentId);
    await router.replace(`/tools/llm-chat/chat/${sessionId}`);
  }
});

const handleNewChat = async () => {
  const sessionId = await chatStore.createSession();
  router.push(`/tools/llm-chat/chat/${sessionId}`);
};

const goToSessions = () => {
  router.push("/tools/llm-chat/sessions");
};

const goToSettings = () => {
  router.push("/tools/llm-chat/settings");
};

const goToAgents = () => {
  router.push("/tools/agent-manager/list");
};

const goToUserProfiles = () => {
  router.push("/tools/llm-chat/profiles");
};

const goToWorldbooks = () => {
  router.push("/tools/llm-chat/worldbooks");
};

const goHome = () => {
  router.push("/");
};
</script>

<template>
  <div class="chat-home" data-testid="chat-home">
    <safe-top />
    <div class="header">
      <div class="header-main">
        <div class="header-title">
          <var-button round text color="transparent" @click="goHome">
            <ChevronLeft :size="24" />
          </var-button>
          <h1>{{ t("tools.llm-chat.common.AI 对话") }}</h1>
        </div>
        <var-button round text color="transparent" @click="goToSettings">
          <Settings :size="24" />
        </var-button>
      </div>
      <p>
        {{ t("tools.llm-chat.ChatHome.开始一段新的对话或继续历史会话") }}
      </p>
    </div>

    <div class="action-grid">
      <div
        class="action-card primary"
        role="button"
        tabindex="0"
        data-testid="chat-new"
        @click="handleNewChat"
        @keydown.enter="handleNewChat"
      >
        <div class="icon-box">
          <Plus :size="32" />
        </div>
        <div class="text-box">
          <h3>{{ t("tools.llm-chat.ChatHome.开启新对话") }}</h3>
          <p>{{ t("tools.llm-chat.ChatHome.即刻开始即时交流") }}</p>
        </div>
      </div>

      <div
        class="action-card"
        role="button"
        tabindex="0"
        data-testid="chat-sessions"
        @click="goToSessions"
        @keydown.enter="goToSessions"
      >
        <div class="icon-box">
          <MessageSquare :size="24" />
        </div>
        <div class="text-box">
          <h3>{{ t("tools.llm-chat.common.历史会话") }}</h3>
          <p>{{ t("tools.llm-chat.ChatHome.查看并继续之前的交流") }}</p>
        </div>
      </div>

      <div
        class="action-card"
        data-testid="chat-agent-hall"
        @click="goToAgents"
      >
        <div class="icon-box">
          <Users :size="24" />
        </div>
        <div class="text-box">
          <h3>{{ t("tools.llm-chat.ChatHome.角色大厅") }}</h3>
          <p>{{ t("tools.llm-chat.ChatHome.选择智能体并开始对话") }}</p>
        </div>
      </div>

      <div
        class="action-card"
        role="button"
        tabindex="0"
        data-testid="chat-user-profiles"
        @click="goToUserProfiles"
        @keydown.enter="goToUserProfiles"
      >
        <div class="icon-box">
          <UserCircle :size="24" />
        </div>
        <div class="text-box">
          <h3>{{ t("tools.llm-chat.ChatHome.用户档案") }}</h3>
          <p>{{ t("tools.llm-chat.ChatHome.管理用户档案") }}</p>
        </div>
      </div>

      <div
        class="action-card"
        role="button"
        tabindex="0"
        data-testid="chat-worldbooks"
        @click="goToWorldbooks"
        @keydown.enter="goToWorldbooks"
      >
        <div class="icon-box">
          <BookOpen :size="24" />
        </div>
        <div class="text-box">
          <h3>{{ t("tools.llm-chat.ChatHome.世界书") }}</h3>
          <p>{{ t("tools.llm-chat.ChatHome.管理世界书") }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-home {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.header h1 {
  font-size: var(--font-size-2xl);
  margin: 0;
  color: var(--text-color);
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  gap: 12px;
}

.header-main :deep(.var-button) {
  min-width: 44px;
  min-height: 44px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.header p {
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.action-card {
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-xl);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition:
    transform 0.2s,
    background-color 0.2s;
}

.action-card:active {
  transform: scale(0.98);
  background-color: var(--input-bg);
}

.action-card.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.action-card.primary .icon-box,
.action-card.primary .text-box h3,
.action-card.primary .text-box p {
  color: white;
}

.action-card.disabled {
  opacity: 0.6;
  filter: grayscale(1);
}

.icon-box {
  color: var(--primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

.text-box h3 {
  margin: 0 0 4px 0;
  font-size: var(--font-size-lg);
}

.text-box p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-color-light);
}
</style>
