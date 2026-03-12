<script setup lang="ts">
import { computed } from "vue";
import type { SessionVariableSnapshot } from "@/tools/llm-chat/types/sessionVariable";

const props = defineProps<{
  nodeId: string;
  name: string;
  op: string;
  value: string;
  generationMeta?: {
    sessionVariableSnapshot?: SessionVariableSnapshot;
  };
}>();

// 查找当前节点对应的具体变更记录
const changeInfo = computed(() => {
  const snapshot = props.generationMeta?.sessionVariableSnapshot;
  if (!snapshot || !snapshot.changes) return null;

  // 查找匹配当前路径的变更（由于一条消息可能有多个 svar 标签，我们按顺序匹配）
  // 注意：这里的匹配逻辑可能比较简单，但在大多数情况下是够用的
  return snapshot.changes.find((c) => c.path === props.name && String(c.opValue) === String(props.value));
});

const displayValue = computed(() => {
  if (changeInfo.value) {
    return `${changeInfo.value.oldValue} → ${changeInfo.value.newValue}`;
  }
  return `${props.op}${props.value}`;
});

const tooltipContent = computed(() => {
  if (changeInfo.value) {
    return `变量变更: ${props.name}\n操作: ${changeInfo.value.op} ${changeInfo.value.opValue}\n历史: ${changeInfo.value.oldValue} 到 ${changeInfo.value.newValue}`;
  }
  return `变量: ${props.name}\n操作: ${props.op} ${props.value}`;
});
</script>

<template>
  <el-tooltip effect="dark" :content="tooltipContent" placement="top" :show-after="500">
    <span class="svar-badge">
      <span class="svar-name">{{ props.name }}</span>
      <span class="svar-value">{{ displayValue }}</span>
    </span>
  </el-tooltip>
</template>

<style scoped>
.svar-badge {
  display: inline-flex;
  align-items: center;
  gap: 0;
  margin: 0 4px;
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  line-height: 1;
  vertical-align: middle;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--el-color-primary-light-5);
  background: var(--card-bg);
  cursor: help;
  transition: all 0.2s ease;
}

.svar-badge:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 8px rgba(var(--el-color-primary-rgb), 0.3);
}

.svar-name {
  padding: 2px 6px;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  font-weight: bold;
}

.svar-value {
  padding: 2px 6px;
  background: var(--card-bg);
  color: var(--el-text-color-primary);
}
</style>
