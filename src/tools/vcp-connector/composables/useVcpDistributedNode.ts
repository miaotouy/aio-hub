import { ref, watch } from "vue";
import { useVcpStore } from "../stores/vcpConnectorStore";
import { useVcpDistributedStore } from "../stores/vcpDistributedStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { toolRegistryManager } from "@/services/registry";
import { invoke } from "@tauri-apps/api/core";
import { createToolDiscoveryService } from "../../tool-calling/core/discovery";
import {
  buildMethodDescription,
  TOOL_DEFINITION_START,
  TOOL_DEFINITION_END,
} from "../../tool-calling/core/protocols/vcp-protocol";
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
  const lastReportedIPs = ref<string>("");

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

    // 按 toolId 分组收集方法
    const toolMethodsMap = new Map<string, any[]>();

    // 1. 处理自动发现的
    if (autoRegister) {
      for (const tool of discovered) {
        for (const method of tool.methods) {
          const fullId = `${tool.toolId}:${method.name}`;
          // 排除掉在黑名单中的工具
          if (!disabledIds.has(fullId)) {
            if (!toolMethodsMap.has(tool.toolId)) {
              toolMethodsMap.set(tool.toolId, []);
            }
            toolMethodsMap.get(tool.toolId)!.push(method);
          }
        }
      }
    }

    // 2. 处理手动指定的 (exposedToolIds)
    for (const fullId of exposedIds) {
      const [toolId, methodName] = fullId.split(":");
      try {
        const registry = toolRegistryManager.getRegistry(toolId);
        const metadata = registry.getMetadata?.();
        const method = metadata?.methods.find((m) => m.name === methodName);
        if (method) {
          if (!toolMethodsMap.has(toolId)) {
            toolMethodsMap.set(toolId, []);
          }
          // 避免重复添加
          const methods = toolMethodsMap.get(toolId)!;
          if (!methods.some((m) => m.name === method.name)) {
            methods.push(method);
          }
        }
      } catch (e) {
        logger.warn(`Failed to resolve manual tool: ${fullId}`);
      }
    }

    // 3. 转换为 VcpToolManifest（每个 toolId 一个 manifest，包含多个 command）
    const manifest: VcpToolManifest[] = [];
    for (const [toolId, methods] of toolMethodsMap.entries()) {
      manifest.push(convertToManifest(toolId, methods));
    }

    // 4. 处理内置工具 (强制暴露)
    for (const tool of BUILTIN_VCP_TOOLS) {
      if (!manifest.some((m) => m.name === tool.name)) {
        manifest.push(tool);
      }
    }

    return manifest;
  }

  /**
   * 将一个工具的多个方法转换为单个 VcpToolManifest
   */
  function convertToManifest(toolId: string, methods: any[]): VcpToolManifest {
    // 构建所有命令的 invocationCommands
    const invocationCommands = methods.map((method) => {
      const commandName = method.protocolConfig?.vcpCommand?.trim() || method.name;

      // 使用 VCP 协议统一的描述生成逻辑
      const body = buildMethodDescription(method, toolId);
      const description = [method.description || "无描述", TOOL_DEFINITION_START, body, TOOL_DEFINITION_END].join("\n");

      // 构建调用示例（使用标准的 tool_name + command 格式）
      const exampleArgs = method.parameters.map((p: any) => {
        const val = p.defaultValue !== undefined ? String(p.defaultValue) : p.type === "string" ? `[${p.name}]` : "0";
        return `${p.name}:「始」${val}「末」`;
      });

      const example = [
        "<<<[TOOL_REQUEST]>>>",
        `tool_name:「始」${toolId}「末」,`,
        `command:「始」${commandName}「末」,`,
        ...exampleArgs.map((line: string, i: number) => (i === exampleArgs.length - 1 ? line : `${line},`)),
        "<<<[END_TOOL_REQUEST]>>>",
      ].join("\n");

      return {
        command: commandName,
        description: description,
        example: example,
      };
    });

    // 合并所有方法的参数定义
    const allParameters = new Map<string, any>();
    const allRequired = new Set<string>();

    for (const method of methods) {
      for (const p of method.parameters) {
        if (!allParameters.has(p.name)) {
          allParameters.set(p.name, {
            type: p.type === "string" ? "string" : p.type === "number" ? "number" : "object",
            description: p.description || "",
          });
        }
        if (p.required !== false) {
          allRequired.add(p.name);
        }
      }
    }

    // 使用第一个方法的信息作为工具的主要描述
    const primaryMethod = methods[0];

    return {
      name: toolId, // 使用 toolId 作为工具名称
      displayName: `[AIO] ${toolId}`,
      description: primaryMethod.description || `AIO 工具: ${toolId}`,
      pluginType: "hybridservice",
      entryPoint: {
        script: `${toolId}.js`,
      },
      communication: {
        protocol: "direct",
      },
      capabilities: {
        invocationCommands: invocationCommands,
      },
      parameters: {
        type: "object",
        properties: Object.fromEntries(allParameters),
        required: Array.from(allRequired),
      },
    };
  }

  let reregisterTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 注册工具到 VCP (带防抖)
   */
  function reregisterTools() {
    if (reregisterTimer) clearTimeout(reregisterTimer);

    reregisterTimer = setTimeout(() => {
      if (distStore.status !== "connected" || !store.nodeProtocol) {
        logger.debug("Skip reregister: Not connected");
        return;
      }

      const tools = discoverTools();
      distStore.setExposedTools(tools);
      store.nodeProtocol.sendRegisterTools(distStore.config.serverName, tools);
      logger.info(`Requested registration of ${tools.length} tools`);
      reregisterTimer = null;
    }, 500); // 500ms 防抖，避开连接初期的多次状态抖动
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

      // 去重检测：只在 IP 列表变化时才上报
      const currentIPsHash = localIPs.sort().join(",");
      if (currentIPsHash !== lastReportedIPs.value) {
        store.nodeProtocol.sendReportIp({
          localIPs,
          publicIP: "",
          serverName: distStore.config.serverName,
        });
        lastReportedIPs.value = currentIPsHash;
        logger.debug("IP list changed, reported to VCP", { localIPs });
      }

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
    watch(
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
      { immediate: true },
    );

    // 监听配置变化自动重注册
    watch(
      [
        () => distStore.config.exposedToolIds,
        () => distStore.config.autoRegisterTools,
        () => distStore.config.disabledToolIds,
      ],
      () => {
        if (distStore.status === "connected") {
          reregisterTools();
        }
      },
      { deep: true },
    );
  }

  function stopDistributedNode() {
    isStarted.value = false;
    stopHeartbeat();
    lastReportedIPs.value = "";
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
