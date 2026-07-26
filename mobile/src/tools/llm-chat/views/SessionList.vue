<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useChatSettings } from "../composables/useChatSettings";
import {
  searchChatMessages,
  type ChatSearchResult,
} from "../services/chatStorageService";
import { customDialog, customMessage } from "@/utils/feedback";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useI18n } from "@/i18n";
import {
  MessageSquare,
  ChevronRight,
  Trash2,
  Trash,
  ChevronLeft,
  Search,
  LoaderCircle,
  X,
} from "lucide-vue-next";

const router = useRouter();
const chatStore = useLlmChatStore();
const { settings, loadSettings } = useChatSettings();
const { tRaw } = useI18n();
const moduleErrorHandler = createModuleErrorHandler("llm-chat/session-list");
const searchQuery = ref("");
const searchResults = ref<ChatSearchResult[]>([]);
const searchLoading = ref(false);
const searchError = ref<string | null>(null);
const isMutatingSessions = ref(false);
let searchSequence = 0;

onMounted(async () => {
  await loadSettings();
  if (!chatStore.isLoaded) {
    await chatStore.init();
  }
});

watch(searchQuery, (value, _oldValue, onCleanup) => {
  const sequence = ++searchSequence;
  const query = value.trim();
  searchError.value = null;
  if (!query) {
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }

  searchLoading.value = true;
  const timer = window.setTimeout(async () => {
    try {
      const results = await searchChatMessages({ query, limit: 50 });
      if (sequence === searchSequence) searchResults.value = results;
    } catch (cause) {
      if (sequence === searchSequence) {
        searchResults.value = [];
        searchError.value =
          cause instanceof Error ? cause.message : String(cause);
      }
    } finally {
      if (sequence === searchSequence) searchLoading.value = false;
    }
  }, 220);
  onCleanup(() => window.clearTimeout(timer));
});

const goToChat = async (id: string) => {
  await chatStore.switchSession(id);
  router.push(`/tools/llm-chat/chat/${id}`);
};

const openSearchResult = async (result: ChatSearchResult) => {
  await chatStore.switchSession(result.sessionId);
  await router.push({
    path: `/tools/llm-chat/chat/${result.sessionId}`,
    query: { messageId: result.messageId },
  });
};

const clearSearch = () => {
  searchQuery.value = "";
};

const showMutationError = (error: unknown, message: string) => {
  moduleErrorHandler.handle(error, {
    userMessage: message,
    showToUser: false,
  });
  customMessage(message, "error");
};

const deleteSession = async (
  event: Event,
  session: { id: string; name: string }
) => {
  event.stopPropagation();
  if (isMutatingSessions.value) return;

  if (settings.value.messageManagement.confirmBeforeDeleteSession) {
    const confirmed = await customDialog({
      title: tRaw("tools.llm-chat.SessionList.删除会话"),
      message: tRaw("tools.llm-chat.SessionList.删除会话提示").replace(
        "{name}",
        session.name
      ),
      confirmButtonText: tRaw("tools.llm-chat.SessionList.删除"),
      cancelButtonText: tRaw("tools.llm-chat.SessionList.取消"),
    });
    if (!confirmed) return;
  }

  isMutatingSessions.value = true;
  try {
    await chatStore.deleteSession(session.id);
    customMessage(tRaw("tools.llm-chat.SessionList.会话已删除"), "success");
  } catch (error) {
    showMutationError(error, tRaw("tools.llm-chat.SessionList.删除会话失败"));
  } finally {
    isMutatingSessions.value = false;
  }
};

const clearAllSessions = async () => {
  if (isMutatingSessions.value || chatStore.sessionMetas.length === 0) return;

  if (settings.value.messageManagement.confirmBeforeClearAll) {
    const confirmed = await customDialog({
      title: tRaw("tools.llm-chat.SessionList.清空所有会话"),
      message: tRaw("tools.llm-chat.SessionList.清空所有会话提示"),
      confirmButtonText: tRaw("tools.llm-chat.SessionList.清空"),
      cancelButtonText: tRaw("tools.llm-chat.SessionList.取消"),
    });
    if (!confirmed) return;
  }

  isMutatingSessions.value = true;
  try {
    const clearedCount = await chatStore.clearAllSessions();
    customMessage(
      tRaw("tools.llm-chat.SessionList.已清空会话").replace(
        "{count}",
        String(clearedCount)
      ),
      "success"
    );
  } catch (error) {
    showMutationError(error, tRaw("tools.llm-chat.SessionList.清空会话失败"));
  } finally {
    isMutatingSessions.value = false;
  }
};

const goToChatHome = () => {
  router.push("/tools/llm-chat/home");
};
</script>

<template>
  <div class="session-list-view" data-testid="chat-session-list">
    <var-app-bar
      title="历史会话"
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
      <template #right>
        <var-button
          round
          text
          color="transparent"
          :disabled="isMutatingSessions || chatStore.sessionMetas.length === 0"
          :aria-label="tRaw('tools.llm-chat.SessionList.清空所有会话')"
          data-testid="chat-sessions-clear-all"
          @click="clearAllSessions"
        >
          <Trash :size="21" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="list-container">
      <label class="search-field">
        <Search :size="18" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="搜索消息"
          aria-label="搜索消息"
        />
        <button
          v-if="searchQuery"
          type="button"
          aria-label="清除搜索"
          @click="clearSearch"
        >
          <X :size="16" />
        </button>
      </label>

      <div v-if="searchQuery.trim()" class="search-results" aria-live="polite">
        <div v-if="searchLoading" class="search-state">
          <LoaderCircle class="spin" :size="20" />
          <span>搜索中</span>
        </div>
        <div v-else-if="searchError" class="search-state error-state">
          <span>{{ searchError }}</span>
        </div>
        <div v-else-if="searchResults.length === 0" class="search-state">
          <MessageSquare :size="24" />
          <span>暂无匹配消息</span>
        </div>
        <button
          v-for="result in searchResults"
          v-else
          :key="`${result.sessionId}:${result.messageId}`"
          type="button"
          class="search-result"
          @click="openSearchResult(result)"
        >
          <div class="search-result-header">
            <strong>{{ result.sessionName }}</strong>
            <time :datetime="result.timestamp">{{
              new Date(result.timestamp).toLocaleString()
            }}</time>
          </div>
          <p>{{ result.snippet || result.content }}</p>
        </button>
      </div>

      <template v-else>
        <div v-if="chatStore.sessionMetas.length === 0" class="empty-state">
          <MessageSquare :size="48" />
          <p>暂无历史会话</p>
        </div>

        <div
          v-for="session in chatStore.sessionMetas"
          :key="session.id"
          class="session-item"
          data-testid="chat-session-row"
          :data-session-id="session.id"
          @click="goToChat(session.id)"
        >
          <div class="session-icon">
            <MessageSquare :size="20" />
          </div>
          <div class="session-info">
            <div class="session-name">{{ session.name }}</div>
            <div class="session-time">
              {{ new Date(session.updatedAt).toLocaleString() }}
            </div>
          </div>
          <div class="actions">
            <button
              class="delete-btn"
              data-testid="chat-session-delete"
              :disabled="isMutatingSessions"
              :aria-label="tRaw('tools.llm-chat.SessionList.删除会话')"
              @click="deleteSession($event, session)"
            >
              <Trash2 :size="18" />
            </button>
            <ChevronRight :size="20" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.session-list-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface);
}

.nav-bar {
  background-color: var(--color-surface) !important;
  backdrop-filter: blur(var(--ui-blur));
  color: var(--color-on-surface) !important;
}

.list-container {
  flex: 1;
  overflow-y: auto;
  /* 避让 fixed AppBar: 54px (AppBar) + 24px (间距) */
  padding: 16px;
  padding-top: calc(78px + env(safe-area-inset-top));
}

.search-field {
  min-height: 46px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 0 12px;
  color: var(--color-on-surface-variant);
  background: var(--color-surface-container-low);
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
}

.search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--color-on-surface);
  background: transparent;
  font: inherit;
}

.search-field button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex: 0 0 30px;
  border: 0;
  border-radius: 50%;
  color: inherit;
  background: transparent;
}

.search-results {
  display: grid;
  gap: 10px;
}

.search-state {
  min-height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-on-surface-variant);
  font-size: 0.86rem;
}

.error-state {
  color: var(--color-error);
  overflow-wrap: anywhere;
  text-align: center;
}

.search-result {
  min-width: 0;
  display: block;
  padding: 12px 14px;
  text-align: left;
  color: var(--color-on-surface);
  background: var(--color-surface-container);
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
}

.search-result:active {
  background: var(--color-surface-container-high);
}

.search-result-header {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.search-result-header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
}

.search-result-header time {
  flex: 0 0 auto;
  color: var(--color-on-surface-variant);
  font-size: 0.68rem;
}

.search-result p {
  display: -webkit-box;
  margin: 7px 0 0;
  overflow: hidden;
  color: var(--color-on-surface-variant);
  font-size: 0.82rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-on-surface-variant);
  gap: 12px;
}

.session-item {
  background: var(--color-surface-container);
  border: 1.5px solid var(--color-outline-variant);
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s ease;
}

.session-item:active {
  background-color: var(--color-surface-container-high);
  transform: scale(0.98);
}

.session-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-name {
  font-weight: 500;
  font-size: 1rem;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-time {
  font-size: 0.8rem;
  color: var(--color-on-surface-variant);
  opacity: 0.7;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-on-surface-variant);
}

.delete-btn {
  border: none;
  background: none;
  color: var(--color-error);
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.delete-btn:active {
  background: var(--el-color-danger-light-9);
}
</style>
