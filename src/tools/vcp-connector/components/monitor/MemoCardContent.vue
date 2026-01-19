<template>
  <div class="memo-card-content">
    <div class="memo-header">
      <span class="memo-mode">{{ message.mode }}</span>
      <el-tag size="small" type="info">
        {{ message.diaryCount }} 条记录
      </el-tag>
      <el-button
        link
        size="small"
        class="json-btn"
        @click.stop="$emit('show-json', message)"
        title="查看原始 JSON"
      >
        <el-icon><Document /></el-icon>
      </el-button>
    </div>

    <div class="memories-content">
      {{ truncateText(message.extractedMemories, 300) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { Document } from "@element-plus/icons-vue";
import type { AiMemoRetrievalMessage } from "../../types/protocol";

defineProps<{
  message: AiMemoRetrievalMessage;
}>();

defineEmits<{
  'show-json': [message: any];
}>();

function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
</script>

<style scoped lang="css">
.memo-card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memo-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.json-btn {
  margin-left: auto;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.json-btn:hover {
  opacity: 1;
}

.memo-mode {
  font-size: 12px;
  font-weight: 600;
  color: #1abc9c;
  padding: 2px 8px;
  background: rgba(26, 188, 156, 0.15);
  border-radius: 4px;
}

.memories-content {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  padding: 10px;
  background: var(--el-bg-color-page);
  border-radius: 4px;
  border-left: 2px solid #1abc9c;
}
</style>
