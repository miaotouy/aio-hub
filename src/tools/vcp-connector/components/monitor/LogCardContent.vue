<template>
  <div class="log-card-content">
    <div class="log-main">
      <div class="log-header">
        <span v-if="message.data.tool_name" class="tool-name">
          {{ message.data.tool_name }}
        </span>
        <span v-if="message.data.source" class="source-tag">
          {{ message.data.source }}
        </span>
        <el-tag v-if="message.data.status" :type="statusTagType" size="small" effect="plain" class="status-tag">
          {{ message.data.status }}
        </el-tag>
      </div>
      <div class="content-text" :class="{ 'is-error': message.data.status === 'error' }">
        {{ message.data.content }}
      </div>
    </div>
    <div class="log-actions">
      <el-button size="small" text @click="$emit('show-json', message)"> 查看 JSON </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { VcpLogMessage } from "../../types/protocol";

const props = defineProps<{
  message: VcpLogMessage;
}>();

defineEmits<{
  "show-json": [message: VcpLogMessage];
}>();

const statusTagType = computed(() => {
  switch (props.message.data.status) {
    case "success":
      return "success";
    case "error":
      return "danger";
    default:
      return "info";
  }
});
</script>

<style scoped lang="css">
.log-card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.tool-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
}

.source-tag {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono);
}

.status-tag {
  text-transform: uppercase;
  font-weight: bold;
}

.content-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-all;
  padding: 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
}

.content-text.is-error {
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 5%, transparent);
  border-color: color-mix(in srgb, var(--el-color-danger) 20%, transparent);
}

.log-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
