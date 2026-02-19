import { ref, watch, onUnmounted } from "vue";
import { useVcpStore } from "../stores/vcpConnectorStore";
import { useVcpDistributedStore } from "../stores/vcpDistributedStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { toolRegistryManager } from "@/services/registry";
import { invoke } from "@tauri-apps/api/core";
import { createToolDiscoveryService } from "../../tool-calling/core/discovery";
import type { MethodMetadata } from "@/services/types";
import type { VcpToolManifest } from "../types/distributed";

const logger = createModuleLogger("vcp-connector/useVcpDistributedNode");
const errorHandler = createModuleErrorHandler("vcp-connector/useVcpDistributedNode");

const HEARTBEAT_INTERVAL = 30000;
const INITIAL_RECONNECT_DELAY = 2000;

export function useVcpDistributedNode() {
  const store = useVcpStore();
  const distStore = useVcpDistributedStore();
  
  const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null);
  const reconnectDelay = ref(INITIAL_RECONNECT_DELAY);
  const isStarted = ref(false);

  /**
   * 发现并生成工具清单
   */
  function discoverTools(): VcpToolManifest[] {
    const discovery = createToolDiscoveryService();
    const exposedIds = distStore.config.exposedToolIds;
    const autoRegister = distStore.config.autoRegisterTools;

    // 使用 Discovery Service 统一过滤逻辑
    const discovered = discovery.getDiscoveredMethods((method: MethodMetadata) => {
      return method.distributedExposed === true;
    });

    const manifest: VcpToolManifest[] = [];

    // 1. 处理自动发现的 (distributedExposed)
    if (autoRegister) {
      for (const tool of discovered) {
        for (const method of tool.methods) {
          manifest.push(convertToManifest(tool.toolId, method));
        }
      }
    }

    // 2. 处理手动指定的 (exposedToolIds)
    // 避免重复
    const currentIds = new Set(manifest.map(m => m.name));
    for (const fullId of exposedIds) {
      if (currentIds.has(fullId)) continue;
      
      const [toolId, methodName] = fullId.split(":");
      try {
        const registry = toolRegistryManager.getRegistry(toolId);
        const metadata = registry.getMetadata?.();
        const method = metadata?.methods.find(m => m.name === methodName);
        if (method) {
          manifest.push(convertToManifest(toolId, method));
        }
      } catch (e) {
        logger.warn(`Failed to resolve manual tool: ${fullId}`);
      }
    }

    return manifest;
  }

  function convertToManifest(toolId: string, method: any): VcpToolManifest {
    return {
      name: `${toolId}:${method.name}`,
      description: method.description || "",
      parameters: {
        type: "object",
        properties: method.parameters.reduce((acc: any, p: any) => {
          acc[p.name] = {
            type: p.type === "string" ? "string" : (p.type === "number" ? "number" : "object"),
            description: p.description || ""
          };
          return acc;
        }, {} as any),
        required: method.parameters.filter((p: any) => p.required !== false).map((p: any) => p.name)
      }
    };
  }

  /**
   * 注册工具到 VCP
   */
  function reregisterTools() {
    if (store.connection.status !== "connected" || !(store as any).nodeProtocol) {
      logger.warn("Cannot register tools: VCP not connected");
      return;
    }

    const tools = discoverTools();
    distStore.setExposedTools(tools);
    (store as any).nodeProtocol.sendRegisterTools(tools);
    logger.info(`Requested registration of ${tools.length} tools`);
  }

  /**
   * 发送心跳
   */
  async function sendHeartbeat() {
    if (!(store as any).nodeProtocol || store.connection.status !== "connected") return;

    try {
      // 获取 IP 信息
      const localIPs = await errorHandler.wrapAsync(async () => {
        return await invoke<string[]>("get_local_ips");
      }) || ["127.0.0.1"];

      (store as any).nodeProtocol.sendReportIp({
        localIPs,
        publicIP: "",
        serverName: distStore.config.serverName
      });
      distStore.updateHeartbeat();
    } catch (e) {
      logger.error("Failed to send heartbeat", e);
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    sendHeartbeat();
    heartbeatTimer.value = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  }

  function stopHeartbeat() {
    if (heartbeatTimer.value) {
      clearInterval(heartbeatTimer.value);
      heartbeatTimer.value = null;
    }
  }

  /**
   * 启动分布式节点逻辑
   */
  function startDistributedNode() {
    if (isStarted.value) return;
    isStarted.value = true;
    
    logger.info("Starting VCP Distributed Node logic");
    
    // 监听连接状态
    const unwatchStatus = watch(
      () => store.connection.status,
      (status) => {
        if (status === "connected") {
          reconnectDelay.value = INITIAL_RECONNECT_DELAY;
          reregisterTools();
          startHeartbeat();
        } else {
          stopHeartbeat();
        }
      },
      { immediate: true }
    );

    // 监听配置变化自动重注册
    const unwatchConfig = watch(
      [() => distStore.config.exposedToolIds, () => distStore.config.autoRegisterTools],
      () => {
        if (store.connection.status === "connected") {
          reregisterTools();
        }
      },
      { deep: true }
    );

    onUnmounted(() => {
      unwatchStatus();
      unwatchConfig();
      stopDistributedNode();
    });
  }

  function stopDistributedNode() {
    isStarted.value = false;
    stopHeartbeat();
    logger.info("Stopped VCP Distributed Node logic");
  }

  return {
    isStarted,
    startDistributedNode,
    stopDistributedNode,
    reregisterTools,
    discoverTools
  };
}