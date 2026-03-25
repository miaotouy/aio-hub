import { defineStore } from "pinia";
import { ref } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createConfigManager } from "@/utils/configManager";
import type { VcpDistributedConfig, VcpToolManifest, VcpBridgeManifest } from "../types/distributed";

const logger = createModuleLogger("vcp-connector/distributed-store");

const configManager = createConfigManager<VcpDistributedConfig>({
  moduleName: "vcp-connector",
  fileName: "distributed-config.json",
  createDefault: () => ({
    serverName: "AIO-Node",
    exposedToolIds: [],
    disabledToolIds: [],
    autoRegisterTools: true,
    enableBridge: true,
    disabledBridgeToolIds: [],
  }),
});

export const useVcpDistributedStore = defineStore("vcp-distributed", () => {
  // 初始化完成的 Promise，供外部等待配置加载
  let _initResolve!: () => void;
  const initPromise = new Promise<void>((resolve) => {
    _initResolve = resolve;
  });

  const config = ref<VcpDistributedConfig>({
    serverName: "AIO-Node",
    exposedToolIds: [],
    disabledToolIds: [],
    autoRegisterTools: true,
    enableBridge: true,
    disabledBridgeToolIds: [],
  });

  const nodeId = ref<string | null>(null);
  const status = ref<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const exposedTools = ref<VcpToolManifest[]>([]);
  const lastHeartbeat = ref<number | null>(null);

  // 桥接相关的状态
  const bridgeManifests = ref<VcpBridgeManifest[]>([]);
  const bridgeStatus = ref<"idle" | "fetching" | "ready" | "error">("idle");

  async function init() {
    config.value = await configManager.load();
    _initResolve();
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

  function setBridgeManifests(manifests: VcpBridgeManifest[]) {
    bridgeManifests.value = manifests;
  }

  function setBridgeStatus(newStatus: typeof bridgeStatus.value) {
    bridgeStatus.value = newStatus;
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
    config.value.exposedToolIds = config.value.exposedToolIds.filter((id) => id !== fullId);
    configManager.saveDebounced(config.value);
  }

  /**
   * 禁用/启用某个工具的分布式暴露
   */
  function toggleToolDisabled(fullId: string, disabled: boolean) {
    const current = new Set(config.value.disabledToolIds || []);
    if (disabled) {
      current.add(fullId);
    } else {
      current.delete(fullId);
    }
    config.value.disabledToolIds = Array.from(current);
    configManager.saveDebounced(config.value);
  }

  /**
   * 禁用/启用某个桥接工具或命令的暴露
   */
  function toggleBridgeToolDisabled(id: string, disabled: boolean) {
    const current = new Set(config.value.disabledBridgeToolIds || []);
    if (disabled) {
      current.add(id);
    } else {
      current.delete(id);
    }
    config.value.disabledBridgeToolIds = Array.from(current);
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
    bridgeManifests,
    bridgeStatus,
    setNodeId,
    setStatus,
    updateHeartbeat,
    setExposedTools,
    setBridgeManifests,
    setBridgeStatus,
    initPromise,
    updateConfig,
    registerToolToVcp,
    unregisterToolFromVcp,
    toggleToolDisabled,
    toggleBridgeToolDisabled,
  };
});
