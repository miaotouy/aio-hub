<script setup lang="ts">
import { ref } from 'vue'
import { MessageSquare } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()
const title = ref('AI Chat Placeholder')
</script>

<template>
  <div class="app-view app-view--safe-top llm-chat-placeholder">
    <div class="content">
      <MessageSquare :size="48" class="icon" />
      <h2>{{ title }}</h2>
      <p>AI 对话功能正在开发中...</p>
      <var-button type="primary" @click="router.back()">返回首页</var-button>
    </div>
  </div>
</template>

<style scoped>
.llm-chat-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-color);
}

.content {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px;
}

.icon {
  color: var(--el-color-primary);
  opacity: 0.8;
}

h2 {
  margin: 0;
  font-weight: 600;
}

p {
  margin: 0;
  opacity: 0.6;
  font-size: 1rem;
}
</style>