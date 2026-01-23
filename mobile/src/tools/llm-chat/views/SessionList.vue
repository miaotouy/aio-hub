<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useLlmChatStore } from "../stores/llmChatStore";
import { MessageSquare, ChevronRight, Trash2, ChevronLeft } from "lucide-vue-next";

const router = useRouter();
const chatStore = useLlmChatStore();

onMounted(async () => {
  if (!chatStore.isLoaded) {
    await chatStore.init();
  }
});

const goToChat = async (id: string) => {
  await chatStore.switchSession(id);
  router.push(`/tools/llm-chat/chat/${id}`);
};

const deleteSession = async (event: Event, id: string) => {
  event.stopPropagation();
  await chatStore.deleteSession(id);
};
</script>

<template>
  <div class="session-list-view">
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
          @click="router.back()"
        >
          <ChevronLeft :size="24" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="list-container">
      <div v-if="chatStore.sessionMetas.length === 0" class="empty-state">
        <MessageSquare :size="48" />
        <p>暂无历史会话</p>
      </div>

      <div
        v-for="session in chatStore.sessionMetas"
        :key="session.id"
        class="session-item"
        @click="goToChat(session.id)"
      >
        <div class="session-icon">
          <MessageSquare :size="20" />
        </div>
        <div class="session-info">
          <div class="session-name">{{ session.name }}</div>
          <div class="session-time">{{ new Date(session.updatedAt).toLocaleString() }}</div>
        </div>
        <div class="actions">
          <button class="delete-btn" @click="deleteSession($event, session.id)">
            <Trash2 :size="18" />
          </button>
          <ChevronRight :size="20" />
        </div>
      </div>
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
