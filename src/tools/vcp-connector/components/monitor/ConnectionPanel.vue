<template>
  <div class="connection-panel">
    <div class="panel-section">
      <h4 class="section-title">连接配置</h4>

      <div class="form-item">
        <label class="form-label">VCP 目录</label>
        <div class="path-input-row">
          <el-input
            :model-value="store.config.vcpPath"
            placeholder="选择 VCP 根目录"
            size="small"
            readonly
            @click="selectVcpPath"
          >
            <template #append>
              <el-button size="small" @click="selectVcpPath">浏览</el-button>
            </template>
          </el-input>
          <el-button
            type="primary"
            size="small"
            :disabled="!store.config.vcpPath"
            @click="detectLocalVcp"
            title="从选择的目录解析配置"
          >
            解析
          </el-button>
        </div>
      </div>

      <div class="form-item">
        <label class="form-label">WebSocket 地址</label>
        <el-input
          :model-value="store.config.wsUrl"
          @update:model-value="store.updateConfig({ wsUrl: $event })"
          placeholder="ws://127.0.0.1:port/vcpinfo"
          size="small"
          clearable
        />
      </div>

      <div class="form-item">
        <label class="form-label">VCP Key</label>
        <el-input
          :model-value="store.config.vcpKey"
          @update:model-value="store.updateConfig({ vcpKey: $event })"
          type="password"
          placeholder="请输入 VCP Key"
          size="small"
          clearable
          show-password
        />
      </div>

      <div class="form-item">
        <el-checkbox
          :model-value="store.config.autoConnect"
          @update:model-value="store.updateConfig({ autoConnect: $event })"
        >
          自动连接
        </el-checkbox>
      </div>

      <div class="form-item">
        <el-button
          type="primary"
          size="small"
          :loading="isConnecting"
          @click="handleConnect"
          style="width: 100%"
        >
          {{ isConnected ? "断开连接" : "连接" }}
        </el-button>
      </div>

      <div class="connection-info" v-if="connection.lastPingLatency !== undefined">
        <span class="latency"> 延迟: {{ connection.lastPingLatency }}ms </span>
        <span class="reconnect" v-if="connection.reconnectAttempts > 0">
          重连次数: {{ connection.reconnectAttempts }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import { useVcpStore } from "../../stores/vcpConnectorStore";
import { useVcpWebSocket } from "../../composables/useVcpWebSocket";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const store = useVcpStore();
const { connect, disconnect, isConnecting, connectionStatus } = useVcpWebSocket();

const isConnected = computed(() => connectionStatus.value === "connected");
const connection = computed(() => store.connection);

function handleConnect() {
  if (isConnected.value) {
    disconnect();
    customMessage.info("已断开连接");
  } else {
    connect();
    customMessage.info("正在连接...");
  }
}

async function selectVcpPath() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 VCP 根目录",
    });

    if (selected && typeof selected === "string") {
      store.updateConfig({ vcpPath: selected });
      // 自动尝试解析一次
      await detectLocalVcp();
    }
  } catch (e) {
    console.error("Select VCP path failed:", e);
  }
}

async function detectLocalVcp() {
  const currentPath = store.config.vcpPath;
  if (!currentPath) {
    customMessage.warning("请先选择 VCP 目录");
    return;
  }

  try {
    // 规范化路径，确保包含 config.env
    const envPath = currentPath.endsWith("config.env")
      ? currentPath
      : `${currentPath}${currentPath.endsWith("/") || currentPath.endsWith("\\") ? "" : "/"}config.env`;

    const envContent = await invoke<string>("read_text_file_force", {
      path: envPath,
    });

    if (!envContent) {
      throw new Error("Empty config.env file");
    }

    // 解析 PORT 和 VCP_Key
    const portMatch = envContent.match(/PORT\s*=\s*(\d+)/);
    const keyMatch = envContent.match(/VCP_Key\s*=\s*([^\s#]+)/);

    if (portMatch && keyMatch) {
      const port = portMatch[1];
      const key = keyMatch[1];
      store.updateConfig({
        wsUrl: `ws://127.0.0.1:${port}`,
        vcpKey: key,
      });
      customMessage.success("成功探测到本地 VCP 配置");
    } else {
      customMessage.warning("在 config.env 中未找到 PORT 或 VCP_Key");
    }
  } catch (e) {
    console.error("Detect local VCP failed:", e);
    customMessage.error("自动探测失败，请确保目录下包含 config.env 文件");
  }
}
</script>

<style scoped lang="css">
.connection-panel {
  display: flex;
  flex-direction: column;
}

.panel-section {
  padding: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color);
}

.section-title {
  margin: 0 0 16px 0;
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

.path-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.path-input-row :deep(.el-input) {
  flex: 1;
}

.connection-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-tertiary);
  margin-top: 8px;
}

.latency {
  color: var(--el-color-success);
}

.reconnect {
  color: var(--el-color-warning);
}
</style>
