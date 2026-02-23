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

/**
 * 内置工具列表，所有 VCP 节点强制暴露
 * 注意：这些名称遵循 VCP 协议约定，不使用 camelCase 风格
 */
export const BUILTIN_VCP_TOOLS: VcpToolManifest[] = [
  {
    name: "internal_request_file",
    displayName: "内置文件请求器",
    isInternal: true,
    description: "请求 AIO 节点上的文件内容 (Base64)",
    pluginType: "hybridservice",
    entryPoint: {
      script: "internal_request_file.js",
    },
    communication: {
      protocol: "direct",
    },
    parameters: {
      type: "object",
      properties: {
        fileUrl: {
          type: "string",
          description: "文件的 URL (file:// 或 appdata://)",
        },
      },
      required: ["fileUrl"],
    },
  },
];

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
    const exposedIds = distStore.config.exposedToolIds || [];
    const disabledIds = new Set(distStore.config.disabledToolIds || []);
    const autoRegister = distStore.config.autoRegisterTools;

    // 使用 Discovery Service 统一过滤逻辑
    // 自动发现所有标记为 agentCallable 的方法，无需工具显式感知 VCP
    const discovered = discovery.getDiscoveredMethods((method: MethodMetadata) => {
      return method.agentCallable === true || method.distributedExposed === true;
    });

    const manifest: VcpToolManifest[] = [];

    // 1. 处理自动发现的
    if (autoRegister) {
      for (const tool of discovered) {
        for (const method of tool.methods) {
          const fullId = `${tool.toolId}:${method.name}`;
          // 排除掉在黑名单中的工具
          if (!disabledIds.has(fullId)) {
            manifest.push(convertToManifest(tool.toolId, method));
          }
        }
      }
    }

    // 2. 处理内置工具 (强制暴露)
    for (const tool of BUILTIN_VCP_TOOLS) {
      if (!manifest.some((m) => m.name === tool.name)) {
        manifest.push(tool);
      }
    }

    // 3. 处理手动指定的 (exposedToolIds)
    // 避免重复
    const currentIds = new Set(manifest.map((m) => m.name));
    for (const fullId of exposedIds) {
      if (currentIds.has(fullId)) continue;

      const [toolId, methodName] = fullId.split(":");
      try {
        const registry = toolRegistryManager.getRegistry(toolId);
        const metadata = registry.getMetadata?.();
        const method = metadata?.methods.find((m) => m.name === methodName);
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
      displayName: `[AIO] ${method.displayName || method.name}`,
      description: method.description || "",
      pluginType: "hybridservice",
      entryPoint: {
        script: `${method.name}.js`,
      },
      communication: {
        protocol: "direct",
      },
      parameters: {
        type: "object",
        properties: method.parameters.reduce((acc: any, p: any) => {
          acc[p.name] = {
            type: p.type === "string" ? "string" : p.type === "number" ? "number" : "object",
            description: p.description || "",
          };
          return acc;
        }, {} as any),
        required: method.parameters.filter((p: any) => p.required !== false).map((p: any) => p.name),
      },
    };
  }

  /**
   * 注册工具到 VCP
   */
  function reregisterTools() {
    if (distStore.status !== "connected" || !store.nodeProtocol) {
      logger.warn("Cannot register tools: Distributed WS not connected or nodeProtocol missing");
      return;
    }

    const tools = discoverTools();
    distStore.setExposedTools(tools);
    store.nodeProtocol.sendRegisterTools(distStore.config.serverName, tools);
    logger.info(`Requested registration of ${tools.length} tools`);
  }

  /**
   * 发送心跳
   */
  async function sendHeartbeat() {
    if (!store.nodeProtocol || distStore.status !== "connected") return;

    try {
      // 获取 IP 信息
      const localIPs = (await errorHandler.wrapAsync(async () => {
        return await invoke<string[]>("get_local_ips");
      })) || ["127.0.0.1"];

      store.nodeProtocol.sendReportIp({
        localIPs,
        publicIP: "",
        serverName: distStore.config.serverName,
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

    // 监听分布式连接状态（而非 Observer 状态）
    const unwatchStatus = watch(
      () => distStore.status,
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
        if (distStore.status === "connected") {
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
    discoverTools,
  };
}
