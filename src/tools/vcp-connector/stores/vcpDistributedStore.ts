import { defineStore } from "pinia";
import { ref } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createConfigManager } from "@/utils/configManager";
import type { VcpDistributedConfig, VcpToolManifest } from "../types/distributed";

const logger = createModuleLogger("vcp-connector/distributed-store");

const configManager = createConfigManager<VcpDistributedConfig>({
  moduleName: "vcp-connector",
  fileName: "distributed-config.json",
  createDefault: () => ({
    serverName: "AIO-Node",
    exposedToolIds: [],
    autoRegisterTools: true,
  }),
});

export const useVcpDistributedStore = defineStore("vcp-distributed", () => {
  const config = ref<VcpDistributedConfig>({
    serverName: "AIO-Node",
    exposedToolIds: [],
    autoRegisterTools: true,
  });

  const nodeId = ref<string | null>(null);
  const status = ref<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const exposedTools = ref<VcpToolManifest[]>([]);
  const lastHeartbeat = ref<number | null>(null);

  async function init() {
    config.value = await configManager.load();
  }

  function setNodeId(id: string | null) {
    nodeId.value = id;
    logger.info(`Node ID set to: ${id}`);
  }

  function setStatus(newStatus: typeof status.value) {
    status.value = newStatus;
  }

  function updateHeartbeat() {
    lastHeartbeat.value = Date.now();
  }

  function setExposedTools(tools: VcpToolManifest[]) {
    exposedTools.value = tools;
  }

  function updateConfig(newConfig: Partial<VcpDistributedConfig>) {
    config.value = { ...config.value, ...newConfig };
    configManager.saveDebounced(config.value);
  }

  /**
   * 注册工具到分布式暴露列表
   * 注意：这只是更新 Store 状态，实际协议发送由 composable/service 处理
   */
  function registerToolToVcp(toolId: string, methodName: string) {
    const fullId = `${toolId}:${methodName}`;
    if (!config.value.exposedToolIds.includes(fullId)) {
      config.value.exposedToolIds.push(fullId);
      configManager.saveDebounced(config.value);
    }
  }

  function unregisterToolFromVcp(toolId: string, methodName: string) {
    const fullId = `${toolId}:${methodName}`;
    config.value.exposedToolIds = config.value.exposedToolIds.filter(id => id !== fullId);
    configManager.saveDebounced(config.value);
  }

  // 初始化
  init();

  return {
    config,
    nodeId,
    status,
    exposedTools,
    lastHeartbeat,
    setNodeId,
    setStatus,
    updateHeartbeat,
    setExposedTools,
    updateConfig,
    registerToolToVcp,
    unregisterToolFromVcp,
  };
});