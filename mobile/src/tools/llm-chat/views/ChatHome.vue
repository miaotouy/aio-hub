<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { MessageSquare, Users, UserCircle, Plus } from 'lucide-vue-next';
import { useLlmChatStore } from '../stores/llmChatStore';
import { useLlmProfilesStore } from '../../llm-api/stores/llmProfiles';

const router = useRouter();
const chatStore = useLlmChatStore();
const profilesStore = useLlmProfilesStore();

onMounted(async () => {
  if (!profilesStore.isLoaded) {
    await profilesStore.init();
  }
  
  // 确保有选中的模型且模型有效
  chatStore.syncSelectedModel();
});

const handleNewChat = () => {
  const sessionId = chatStore.createSession();
  router.push(`/tools/llm-chat/chat/${sessionId}`);
};

const goToSessions = () => {
  router.push('/tools/llm-chat/sessions');
};
</script>

<template>
  <div class="chat-home">
    <div class="header">
      <h1>AI 对话</h1>
      <p>开始一段新的对话或继续历史会话</p>
    </div>

    <div class="action-grid">
      <div class="action-card primary" @click="handleNewChat">
        <div class="icon-box">
          <Plus :size="32" />
        </div>
        <div class="text-box">
          <h3>开启新对话</h3>
          <p>即刻开始即时交流</p>
        </div>
      </div>

      <div class="action-card" @click="goToSessions">
        <div class="icon-box">
          <MessageSquare :size="24" />
        </div>
        <div class="text-box">
          <h3>历史会话</h3>
          <p>查看并继续之前的交流</p>
        </div>
      </div>

      <div class="action-card disabled">
        <div class="icon-box">
          <Users :size="24" />
        </div>
        <div class="text-box">
          <h3>Agent 仓库</h3>
          <p>敬请期待</p>
        </div>
      </div>

      <div class="action-card disabled">
        <div class="icon-box">
          <UserCircle :size="24" />
        </div>
        <div class="text-box">
          <h3>用户档案</h3>
          <p>敬请期待</p>
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
  font-size: 1.8rem;
  margin-bottom: 8px;
  color: var(--el-text-color-primary);
}

.header p {
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.action-card {
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: transform 0.2s, background-color 0.2s;
}

.action-card:active {
  transform: scale(0.98);
  background-color: var(--el-fill-color-light);
}

.action-card.primary {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
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
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.text-box h3 {
  margin: 0 0 4px 0;
  font-size: 1.1rem;
}

.text-box p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}
</style>