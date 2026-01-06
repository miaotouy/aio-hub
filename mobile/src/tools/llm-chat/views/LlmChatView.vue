<script setup lang="ts">
import { ref } from 'vue'
import { MessageSquare } from 'lucide-vue-next'

const title = ref('AI Chat Placeholder')
</script>

<template>
  <div class="llm-chat-placeholder">
    <div class="content">
      <MessageSquare :size="48" class="icon" />
      <h2>{{ title }}</h2>
      <p>AI 对话功能正在开发中...</p>
      <el-button type="primary" plain @click="$router.back()">返回首页</el-button>
    </div>
  </div>
</template>

<style scoped>
.llm-chat-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  background-color: var(--card-bg);
  color: var(--el-text-color-primary);
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
  font-size: 14px;
}
</style>