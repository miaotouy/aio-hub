<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useLlmChatStore } from '../stores/llmChatStore';
import { MessageSquare, ChevronRight, Trash2, ChevronLeft } from 'lucide-vue-next';

const router = useRouter();
const chatStore = useLlmChatStore();

const goToChat = (id: string) => {
  chatStore.switchSession(id);
  router.push(`/tools/llm-chat/chat/${id}`);
};

const deleteSession = (event: Event, id: string) => {
  event.stopPropagation();
  // TODO: 实现删除逻辑
  console.log('Delete session', id);
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
        <var-button round text color="transparent" text-color="var(--text-color)" @click="router.back()">
          <ChevronLeft :size="24" />
        </var-button>
      </template>
    </var-app-bar>
    <div class="nav-bar-placeholder"></div>
    
    <div class="list-container">
      <div v-if="chatStore.sessions.length === 0" class="empty-state">
        <MessageSquare :size="48" />
        <p>暂无历史会话</p>
      </div>

      <div 
        v-for="session in chatStore.sessions" 
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

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-secondary);
  gap: 12px;
}

.session-item {
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background-color 0.2s;
}

.session-item:active {
  background-color: var(--el-fill-color-light);
}

.session-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
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
  color: var(--el-text-color-secondary);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-placeholder);
}

.delete-btn {
  border: none;
  background: none;
  color: var(--el-color-danger);
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