<template>
  <div class="connection-panel">
    <div class="panel-section">
      <h4 class="section-title">连接配置</h4>

      <div class="form-item">
        <label class="form-label">VCP 目录</label>
        <div
          class="path-input-row"
          :class="{ 'drop-active': isDragOver }"
          @dragover.prevent="isDragOver = true"
          @dragleave="isDragOver = false"
          @drop.prevent="handleDrop"
        >
          <el-input
            :model-value="store.config.vcpPath"
            placeholder="选择或拖放 VCP 根目录"
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

      <!-- 渠道关联状态 -->
      <div class="form-item channel-link-item" v-if="store.config.wsUrl">
        <div v-if="matchedProfile" class="channel-status linked">
          <span class="channel-status-text">
            <el-icon><CircleCheck /></el-icon>
            已关联渠道：{{ matchedProfile.name }}
          </span>
          <el-button link type="primary" size="small" @click="goToEditProfile"> 编辑渠道 </el-button>
        </div>
        <div v-else class="channel-status unlinked">
          <span class="channel-status-text">
            <el-icon><CircleClose /></el-icon>
            未关联 LLM 渠道
          </span>
          <el-button link type="primary" size="small" :disabled="!store.config.vcpKey" @click="addAsLlmProfile">
            一键添加
          </el-button>
        </div>
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
        <el-button type="primary" size="small" :loading="isConnecting" @click="handleConnect" style="width: 100%">
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
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { CircleCheck, CircleClose } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import { useVcpStore } from "../../stores/vcpConnectorStore";
import { useVcpWebSocket } from "../../composables/useVcpWebSocket";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const store = useVcpStore();
const router = useRouter();
const { connect, disconnect, isConnecting, connectionStatus } = useVcpWebSocket();
const { profiles, saveProfile, generateId } = useLlmProfiles();

const isConnected = computed(() => connectionStatus.value === "connected");
const connection = computed(() => store.connection);
const isDragOver = ref(false);

/** 从 wsUrl 提取端口，匹配已有的本地 LLM 渠道 */
const matchedProfile = computed(() => {
  const wsUrl = store.config.wsUrl;
  if (!wsUrl) return null;
  const portMatch = wsUrl.match(/:(\d+)/);
  if (!portMatch) return null;
  const port = portMatch[1];
  return (
    profiles.value.find((p) => {
      const url = p.baseUrl || "";
      return url.includes(`localhost:${port}`) || url.includes(`127.0.0.1:${port}`);
    }) ?? null
  );
});

function handleConnect() {
  if (isConnected.value) {
    disconnect();
    customMessage.info("已断开连接");
  } else {
    connect();
    customMessage.info("正在连接...");
  }
}

/** 处理文件夹拖放 */
async function handleDrop(event: DragEvent) {
  isDragOver.value = false;
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  // Tauri 扩展了 File 对象，包含 path 属性
  const file = files[0] as File & { path?: string };
  const folderPath = file.path;
  if (!folderPath) return;
  store.updateConfig({ vcpPath: folderPath });
  await detectLocalVcp();
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

/** 将当前 VCP 配置一键添加为 LLM 渠道 */
async function addAsLlmProfile() {
  const wsUrl = store.config.wsUrl;
  const vcpKey = store.config.vcpKey;
  if (!wsUrl || !vcpKey) {
    customMessage.warning("请先解析 VCP 配置");
    return;
  }
  const portMatch = wsUrl.match(/:(\d+)/);
  if (!portMatch) {
    customMessage.warning("无法从 WebSocket 地址中提取端口");
    return;
  }
  const port = portMatch[1];
  await saveProfile({
    id: generateId(),
    name: "VCP",
    type: "openai",
    baseUrl: `http://localhost:${port}`,
    apiKeys: [vcpKey],
    enabled: true,
    models: [],
    icon: "/model-icons/vcpchat.png",
    networkStrategy: "auto",
    relaxIdCerts: false,
    http1Only: true,
    options: {},
  });
  customMessage.success("已添加 VCP 渠道");
}

/** 跳转到设置页面并定位到对应渠道 */
function goToEditProfile() {
  if (!matchedProfile.value) return;
  router.push({
    name: "Settings",
    query: {
      section: "llm-service",
      profileId: matchedProfile.value.id,
    },
  });
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
  border-radius: 6px;
  transition: box-shadow 0.2s;
}

.path-input-row.drop-active {
  box-shadow: 0 0 0 2px var(--el-color-primary);
}

.path-input-row :deep(.el-input) {
  flex: 1;
}

.channel-link-item {
  margin-top: -4px;
}

.channel-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 4px;
}

.channel-status.linked {
  background-color: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.1));
}

.channel-status.unlinked {
  background-color: rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.1));
}

.channel-status-text {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
}

.channel-status.linked .channel-status-text {
  color: var(--el-color-success);
}

.channel-status.unlinked .channel-status-text {
  color: var(--el-color-warning);
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
