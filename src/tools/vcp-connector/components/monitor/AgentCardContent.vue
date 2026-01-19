<template>
  <div class="agent-card-content">
    <div class="agent-header">
      <span class="agent-name">{{ message.agentName }}</span>
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

    <div class="message-pair">
      <div class="query-bubble">
        <div class="bubble-label">Query</div>
        <div class="bubble-text">{{ message.query }}</div>
      </div>

      <div class="response-bubble">
        <div class="bubble-label">Response</div>
        <div class="bubble-text">{{ truncateText(message.response, 200) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Document } from "@element-plus/icons-vue";
import type { AgentChatPreviewMessage } from "../../types/protocol";

defineProps<{
  message: AgentChatPreviewMessage;
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
.agent-card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.json-btn {
  opacity: 0.5;
  transition: opacity 0.2s;
}

.json-btn:hover {
  opacity: 1;
}

.agent-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding: 2px 8px;
  background: rgba(241, 196, 15, 0.15);
  color: #f1c40f;
  border-radius: 4px;
}

.message-pair {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.query-bubble,
.response-bubble {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.query-bubble {
  background: rgba(52, 152, 219, 0.1);
  border-left: 2px solid #3498db;
}

.response-bubble {
  background: var(--el-bg-color-page);
  border-left: 2px solid var(--el-border-color);
}

.bubble-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--el-text-color-tertiary);
  margin-bottom: 4px;
  text-transform: uppercase;
}

.bubble-text {
  color: var(--el-text-color-primary);
  line-height: 1.4;
}
</style>
