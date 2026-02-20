<template>
  <div class="node-status-panel">
    <div class="panel-section">
      <div class="section-header">
        <h4 class="section-title">节点配置与状态</h4>
        <el-tag :type="statusTagType" size="small" effect="light">{{ statusText }}</el-tag>
      </div>

      <div class="form-item">
        <label class="form-label">节点显示名称</label>
        <el-input
          :model-value="distStore.config.serverName"
          @update:model-value="distStore.updateConfig({ serverName: $event })"
          placeholder="给当前节点起个名字"
          size="small"
          clearable
        />
      </div>

      <div class="form-item">
        <label class="form-label">服务器地址</label>
        <el-input :model-value="store.config.wsUrl" size="small" readonly disabled>
          <template #prefix>
            <el-icon><Link /></el-icon>
          </template>
        </el-input>
      </div>

      <div class="config-row">
        <div class="form-item">
          <el-checkbox
            :model-value="store.config.autoConnect"
            @update:model-value="store.updateConfig({ autoConnect: $event })"
          >
            自动连接
          </el-checkbox>
        </div>
        <div class="form-item">
          <el-checkbox
            :model-value="distStore.config.autoRegisterTools"
            @update:model-value="distStore.updateConfig({ autoRegisterTools: $event })"
          >
            自动注册工具
          </el-checkbox>
        </div>
      </div>

      <div class="form-item">
        <div class="button-group">
          <el-button
            :type="isConnected ? 'danger' : 'primary'"
            size="small"
            :loading="isConnecting"
            @click="toggleConnection"
            style="flex: 2"
          >
            {{ isConnected ? "断连" : "连接" }}
          </el-button>
          <el-button size="small" :disabled="!isConnected" @click="reregisterTools" style="flex: 1">
            同步工具
          </el-button>
        </div>
      </div>

      <div class="connection-info">
        <div class="info-row">
          <span class="label">节点 ID:</span>
          <span class="value code">{{ distStore.nodeId || "未分配" }}</span>
        </div>
        <div class="info-row">
          <span class="label">最近心跳:</span>
          <span class="value">{{ lastHeartbeatText }}</span>
        </div>
        <div class="info-row" v-if="connection.lastPingLatency !== undefined">
          <span class="label">网络延迟:</span>
          <span class="value success">{{ connection.lastPingLatency }}ms</span>
        </div>
        <div class="info-row" v-if="connection.reconnectAttempts > 0">
          <span class="label">重连次数:</span>
          <span class="value warning">{{ connection.reconnectAttempts }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Link } from "lucide-vue-next";
import { useVcpStore } from "../../stores/vcpConnectorStore";
import { useVcpDistributedStore } from "../../stores/vcpDistributedStore";
import { useVcpWebSocket } from "../../composables/useVcpWebSocket";
import { useVcpDistributedNode } from "../../composables/useVcpDistributedNode";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

const store = useVcpStore();
const distStore = useVcpDistributedStore();
const { connect, disconnect, isConnecting } = useVcpWebSocket();
const { reregisterTools } = useVcpDistributedNode();

const isConnected = computed(() => distStore.status === "connected");
const connection = computed(() => store.connection);

const statusTagType = computed(() => {
  switch (distStore.status) {
    case "connected":
      return "success";
    case "connecting":
      return "warning";
    case "error":
      return "danger";
    default:
      return "info";
  }
});

const statusText = computed(() => {
  switch (distStore.status) {
    case "connected":
      return "已就绪";
    case "connecting":
      return "连接中";
    case "error":
      return "连接异常";
    default:
      return "未连接";
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
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  margin-bottom: 16px;
  overflow: hidden;
}

.panel-section {
  padding: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.form-item {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.config-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.config-row .form-item {
  margin-bottom: 0;
}

.button-group {
  display: flex;
  gap: 8px;
}

.connection-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color);
}

.info-row {
  display: flex;
  justify-content: space-between;
}

.label {
  color: var(--el-text-color-tertiary);
}

.value {
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.value.code {
  font-family: var(--el-font-family-mono);
  font-size: 11px;
}

.value.success {
  color: var(--el-color-success);
}

.value.warning {
  color: var(--el-color-warning);
}
</style>
