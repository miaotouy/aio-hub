<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useChatSettings } from "../composables/useChatSettings";
import {
  searchChatMessages,
  type ChatSearchResult,
} from "../services/chatStorageService";
import {
  DEFAULT_SESSION_SORT,
  sortSessionMetas,
  type SessionSortOption,
} from "../utils/sessionSorting";
import { customDialog, customMessage } from "@/utils/feedback";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useI18n } from "@/i18n";
import {
  MessageSquare,
  ChevronRight,
  Trash2,
  Trash,
  ArrowUpDown,
  ChevronLeft,
  Search,
  LoaderCircle,
  X,
} from "lucide-vue-next";

const router = useRouter();
const chatStore = useLlmChatStore();
const { settings, loadSettings } = useChatSettings();
const { t } = useI18n();
const moduleErrorHandler = createModuleErrorHandler("llm-chat/session-list");
const searchQuery = ref("");
const searchResults = ref<ChatSearchResult[]>([]);
const searchLoading = ref(false);
const searchError = ref<string | null>(null);
const isMutatingSessions = ref(false);
const sessionSortOptions = {
  "updatedAt:desc": DEFAULT_SESSION_SORT,
  "updatedAt:asc": { field: "updatedAt", direction: "asc" },
  "createdAt:desc": { field: "createdAt", direction: "desc" },
  "createdAt:asc": { field: "createdAt", direction: "asc" },
  "messageCount:desc": { field: "messageCount", direction: "desc" },
  "messageCount:asc": { field: "messageCount", direction: "asc" },
  "name:asc": { field: "name", direction: "asc" },
  "name:desc": { field: "name", direction: "desc" },
} as const satisfies Record<string, SessionSortOption>;
const sessionSort = ref<keyof typeof sessionSortOptions>("updatedAt:desc");
const sortedSessionMetas = computed(() =>
  sortSessionMetas(
    chatStore.sessionMetas,
    sessionSortOptions[sessionSort.value]
  )
);
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
      title: t("tools.llm-chat.SessionList.删除会话"),
      message: t("tools.llm-chat.SessionList.删除会话提示").replace(
        "{name}",
        session.name
      ),
      confirmButtonText: t("tools.llm-chat.SessionList.删除"),
      cancelButtonText: t("tools.llm-chat.SessionList.取消"),
    });
    if (!confirmed) return;
  }

  isMutatingSessions.value = true;
  try {
    await chatStore.deleteSession(session.id);
    customMessage(t("tools.llm-chat.SessionList.会话已删除"), "success");
  } catch (error) {
    showMutationError(error, t("tools.llm-chat.SessionList.删除会话失败"));
  } finally {
    isMutatingSessions.value = false;
  }
};

const clearAllSessions = async () => {
  if (isMutatingSessions.value || chatStore.sessionMetas.length === 0) return;

  if (settings.value.messageManagement.confirmBeforeClearAll) {
    const confirmed = await customDialog({
      title: t("tools.llm-chat.SessionList.清空所有会话"),
      message: t("tools.llm-chat.SessionList.清空所有会话提示"),
      confirmButtonText: t("tools.llm-chat.SessionList.清空"),
      cancelButtonText: t("tools.llm-chat.SessionList.取消"),
    });
    if (!confirmed) return;
  }

  isMutatingSessions.value = true;
  try {
    const clearedCount = await chatStore.clearAllSessions();
    customMessage(
      t("tools.llm-chat.SessionList.已清空会话").replace(
        "{count}",
        String(clearedCount)
      ),
      "success"
    );
  } catch (error) {
    showMutationError(error, t("tools.llm-chat.SessionList.清空会话失败"));
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
      :title="t('tools.llm-chat.common.历史会话')"
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
          :aria-label="t('tools.llm-chat.SessionList.清空所有会话')"
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
          :placeholder="t('tools.llm-chat.SessionList.搜索消息')"
          :aria-label="t('tools.llm-chat.SessionList.搜索消息')"
        />
        <button
          v-if="searchQuery"
          type="button"
          :aria-label="t('tools.llm-chat.SessionList.清除搜索')"
          @click="clearSearch"
        >
          <X :size="16" />
        </button>
      </label>

      <div v-if="searchQuery.trim()" class="search-results" aria-live="polite">
        <div v-if="searchLoading" class="search-state">
          <LoaderCircle class="spin" :size="20" />
          <span>{{ t("tools.llm-chat.SessionList.搜索中") }}</span>
        </div>
        <div v-else-if="searchError" class="search-state error-state">
          <span>{{ searchError }}</span>
        </div>
        <div v-else-if="searchResults.length === 0" class="search-state">
          <MessageSquare :size="24" />
          <span>{{ t("tools.llm-chat.SessionList.暂无匹配消息") }}</span>
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
        <div
          v-if="chatStore.sessionMetas.length > 0"
          class="session-list-toolbar"
        >
          <label class="session-sort-control">
            <ArrowUpDown :size="16" aria-hidden="true" />
            <select
              v-model="sessionSort"
              data-testid="chat-session-sort"
              :aria-label="t('tools.llm-chat.SessionList.排序方式')"
            >
              <option value="updatedAt:desc">
                {{ t("tools.llm-chat.SessionList.最近更新") }}
              </option>
              <option value="updatedAt:asc">
                {{ t("tools.llm-chat.SessionList.最早更新") }}
              </option>
              <option value="createdAt:desc">
                {{ t("tools.llm-chat.SessionList.最近创建") }}
              </option>
              <option value="createdAt:asc">
                {{ t("tools.llm-chat.SessionList.最早创建") }}
              </option>
              <option value="messageCount:desc">
                {{ t("tools.llm-chat.SessionList.消息最多") }}
              </option>
              <option value="messageCount:asc">
                {{ t("tools.llm-chat.SessionList.消息最少") }}
              </option>
              <option value="name:asc">
                {{ t("tools.llm-chat.SessionList.名称正序") }}
              </option>
              <option value="name:desc">
                {{ t("tools.llm-chat.SessionList.名称倒序") }}
              </option>
            </select>
          </label>
        </div>

        <div v-if="chatStore.sessionMetas.length === 0" class="empty-state">
          <MessageSquare :size="48" />
          <p>{{ t("tools.llm-chat.SessionList.暂无历史会话") }}</p>
        </div>

        <div
          v-for="session in sortedSessionMetas"
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
              :aria-label="t('tools.llm-chat.SessionList.删除会话')"
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
  background-color: var(--bg-color);
}

.nav-bar {
  background-color: var(--bg-color) !important;
  backdrop-filter: blur(var(--ui-blur));
  color: var(--text-color) !important;
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
  color: var(--text-color-light);
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
}

.search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--text-color);
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
  color: var(--text-color-light);
  font-size: 0.86rem;
}

.error-state {
  color: var(--danger-color);
  overflow-wrap: anywhere;
  text-align: center;
}

.search-result {
  min-width: 0;
  display: block;
  padding: 12px 14px;
  text-align: left;
  color: var(--text-color);
  background: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
}

.search-result:active {
  background: var(--input-bg);
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
  color: var(--text-color-light);
  font-size: 0.68rem;
}

.search-result p {
  display: -webkit-box;
  margin: 7px 0 0;
  overflow: hidden;
  color: var(--text-color-light);
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

.session-list-toolbar {
  display: flex;
  justify-content: flex-end;
  margin: 0 0 12px;
}

.session-sort-control {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 10px;
  color: var(--text-color-light);
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
}

.session-sort-control select {
  max-width: min(46vw, 220px);
  border: 0;
  outline: 0;
  color: var(--text-color);
  background: transparent;
  font: inherit;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-light);
  gap: 12px;
}

.session-item {
  background: var(--container-bg);
  border: 1.5px solid var(--border-color);
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s ease;
}

.session-item:active {
  background-color: var(--input-bg);
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
  color: var(--text-color-light);
  opacity: 0.7;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-light);
}

.delete-btn {
  border: none;
  background: none;
  color: var(--danger-color);
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.delete-btn:active {
  background: color-mix(in srgb, var(--danger-color) 8%, var(--card-bg));
}
</style>
