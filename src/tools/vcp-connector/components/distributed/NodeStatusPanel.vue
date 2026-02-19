
<template>
  <div class="node-status-panel">
    <div class="status-header">
      <div class="node-info">
        <h3 class="node-name">{{ distStore.config.serverName }}</h3>
        <div class="node-id" v-if="distStore.nodeId">
          ID: <code>{{ distStore.nodeId }}</code>
        </div>
      </div>
      <el-tag :type="statusTagType" effect="dark">{{ statusText }}</el-tag>
    </div>

    <div class="status-grid">
      <div class="status-item">
        <span class="label">服务器地址</span>
        <span class="value">{{ store.config.wsUrl || '未配置' }}</span>
      </div>
      <div class="status-item">
        <span class="label">最近心跳</span>
        <span class="value">{{ lastHeartbeatText }}</span>
      </div>
      <div class="status-item">
        <span class="label">已注册工具</span>
        <span class="value">{{ distStore.exposedTools.length }}</span>
      </div>
    </div>

    <div class="actions">
      <el-button 
        :type="isConnected ? 'danger' : 'primary'" 
        size="small" 
        @click="toggleConnection"
      >
        {{ isConnected ? '断开连接' : '立即连接' }}
      </el-button>
      <el-button 
        size="small" 
        :disabled="!isConnected" 
        @click="reregisterTools"
      >
        重新注册工具
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useVcpStore } from "../../stores/vcpConnectorStore";
import { useVcpDistributedStore } from "../../stores/vcpDistributedStore";
import { useVcpWebSocket } from "../../composables/useVcpWebSocket";
import { useVcpDistributedNode } from "../../composables/useVcpDistributedNode";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

const store = useVcpStore();
const distStore = useVcpDistributedStore();
const { connect, disconnect } = useVcpWebSocket();
const { reregisterTools } = useVcpDistributedNode();

const isConnected = computed(() => distStore.status === "connected");

const statusTagType = computed(() => {
  switch (distStore.status) {
    case "connected": return "success";
    case "connecting": return "warning";
    case "error": return "danger";
    default: return "info";
  }
});

const statusText = computed(() => {
  switch (distStore.status) {
    case "connected": return "已连接";
    case "connecting": return "连接中";
    case "error": return "错误";
    default: return "未连接";
  }
});

const lastHeartbeatText = computed(() => {
  if (!distStore.lastHeartbeat) return "从未";
  return formatDistanceToNow(distStore.lastHeartbeat, { addSuffix: true, locale: zhCN });
});

function toggleConnection() {
  if (isConnected.value) {
    disconnect();
  } else {
    connect();
  }
}
</script>

<style scoped lang="css">
.node-status-panel {
  padding: 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  margin-bottom: 16px;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.node-name {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
}

.node-id {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.value {
  font-size: 14px;
  font-weight: 500;
  word-break: break-all;
}

.actions {
  display: flex;
  gap: 12px;
}
</style>
