<script setup lang="ts">
import { computed } from "vue";
import type { ContextPreviewData } from "../../composables/chat/useChatHandler";
import { InfoFilled } from "@element-plus/icons-vue";

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

/**
 * 提取最新的变量快照
 */
const latestSnapshot = computed(() => {
  const history = props.contextData.chatHistory;
  if (!history || history.length === 0) return null;

  // 从后往前找最近的快照
  // 注意：ContextPreviewData 的 chatHistory 节点可能没有完整的 metadata，
  // 但我们在 variable-processor 中已经处理过 contextData.finalMessages。
  // 实际上，我们应该从最终构建的消息列表中提取快照。
  const finalMessages = props.contextData.finalMessages;
  for (let i = finalMessages.length - 1; i >= 0; i--) {
    const msg = finalMessages[i] as any;
    if (msg.metadata?.sessionVariableSnapshot) {
      return msg.metadata.sessionVariableSnapshot;
    }
  }
  return null;
});

const variables = computed(() => {
  const snapshot = latestSnapshot.value;
  if (!snapshot || !snapshot.values) return [];

  return Object.entries(snapshot.values).map(([path, value]) => ({
    path,
    value,
    type: typeof value
  }));
});
</script>

<template>
  <div class="variables-view">
    <div v-if="variables.length === 0" class="empty-state">
      <el-empty description="当前会话中没有活动的变量" />
    </div>
    
    <div v-else class="variables-container">
      <div class="header">
        <h3>当前变量状态</h3>
        <el-tag size="small" type="info">快照时间: {{ new Date(latestSnapshot?.timestamp || Date.now()).toLocaleString() }}</el-tag>
      </div>

      <el-table :data="variables" style="width: 100%" border stripe>
        <el-table-column prop="path" label="变量路径" width="200">
          <template #default="{ row }">
            <code class="variable-path">{{ row.path }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="value" label="当前值">
          <template #default="{ row }">
            <pre class="variable-value">{{ typeof row.value === 'object' ? JSON.stringify(row.value, null, 2) : row.value }}</pre>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'number' ? 'success' : 'warning'">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div class="info-tip">
        <el-icon><InfoFilled /></el-icon>
        <span>这些变量是通过解析消息中的 <svar /> 标签动态计算得出的。</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.variables-view {
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
}

.variables-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--el-text-color-primary);
}

.variable-path {
  color: var(--el-color-primary);
  font-weight: bold;
}

.variable-value {
  margin: 0;
  font-family: var(--el-font-family-mono);
  white-space: pre-wrap;
  word-break: break-all;
}

.info-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  background: var(--el-color-info-light-9);
  border-radius: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>