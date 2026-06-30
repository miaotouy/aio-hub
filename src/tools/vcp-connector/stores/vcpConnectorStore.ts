import { defineStore } from "pinia";
import { ref, computed, shallowRef, watch } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createConfigManager } from "@/utils/configManager";
import {
  VcpMessage,
  VcpMessageType,
  ConnectionState,
  FilterState,
  MessageStats,
  VcpConfig,
  RagRetrievalMessage,
  ThinkingChainMessage,
  AgentChatPreviewMessage,
  AiMemoRetrievalMessage,
  PluginStepStatusMessage,
  VcpLogMessage,
} from "../types/protocol";
import { VcpNodeProtocol } from "../services/vcpNodeProtocol";
import { vcpBridgeFactory } from "../services/VcpBridgeFactory";
import { useVcpDistributedStore } from "./vcpDistributedStore";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useToolCallingStore } from "@/tools/llm-chat/stores/toolCallingStore";
import { useNotification } from "@/composables/useNotification";
import { customMessage } from "@/utils/customMessage";
import {
  loadFromDisk as loadEmoticonFromDisk,
  refresh as refreshEmoticonLibrary,
  clearLibrary as clearEmoticonLibrary,
} from "../services/vcpEmoticonService";
import { tryParseStructuredContent } from "../utils/contentFormatter";

const logger = createModuleLogger("vcp-connector/store");

const DEFAULT_MAX_HISTORY = 500;
const PING_INTERVAL = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

// 配置管理器：负责基础配置
const configManager = createConfigManager<VcpConfig>({
  moduleName: "vcp-connector",
  fileName: "config.json",
  createDefault: () => ({
    wsUrl: "",
    vcpKey: "",
    vcpPath: "",
    autoConnect: false,
    maxHistory: DEFAULT_MAX_HISTORY,
    mode: "both",
    vcpChatKey: "",
    vcpImageKey: "",
    vcpFileKey: "",
  }),
});

// 消息管理器：负责历史消息持久化
const messagesManager = createConfigManager<{ list: VcpMessage[] }>({
  moduleName: "vcp-connector",
  fileName: "messages.json",
  createDefault: () => ({ list: [] }),
});

export const useVcpStore = defineStore("vcp-connector", () => {
  const bus = useWindowSyncBus();

  // 检查是否为分离的消息监控窗口
  // 路径格式通常为 /detached-component/vcp-connector:monitor
  const isDetachedMonitor = window.location.pathname.includes(
    "vcp-connector:monitor"
  );

  // 标记监控面板是否在主窗口中已经分离（由主窗口维护）
  const isMonitorDetached = ref(false);

  // 监听全局分离状态，同步 isMonitorDetached
  const { detachedComponents } = useDetachedManager();
  watch(
    () => detachedComponents.value,
    (list) => {
      isMonitorDetached.value = list.includes("vcp-connector:monitor");
    },
    { immediate: true }
  );

  // 初始化完成的 Promise，供外部等待配置加载
  let _initResolve!: () => void;
  const initPromise = new Promise<void>((resolve) => {
    _initResolve = resolve;
  });

  const config = ref<VcpConfig>({
    wsUrl: "",
    vcpKey: "",
    vcpPath: "",
    autoConnect: false,
    maxHistory: DEFAULT_MAX_HISTORY,
    mode: "both",
    vcpChatKey: "",
    vcpImageKey: "",
    vcpFileKey: "",
  });

  const connection = ref<ConnectionState>({
    status: "disconnected",
    reconnectAttempts: 0,
  });

  const messages = ref<VcpMessage[]>([]);

  // 协议处理器
  const nodeProtocol = shallowRef<VcpNodeProtocol | null>(null);

  // WebSocket 内部状态
  const ws = ref<WebSocket | null>(null);
  const distributedWs = ref<WebSocket | null>(null);
  const vcpLogWs = ref<WebSocket | null>(null);
  const isConnecting = ref(false);
  const isDistributedConnecting = ref(false);
  const isVcpLogConnecting = ref(false);
  const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = ref<ReturnType<typeof setInterval> | null>(null);
  const pendingPingTime = ref<number | null>(null);
  let reconnectDelay = INITIAL_RECONNECT_DELAY;

  const filter = ref<FilterState>({
    types: [
      "RAG_RETRIEVAL_DETAILS",
      "META_THINKING_CHAIN",
      "AGENT_PRIVATE_CHAT_PREVIEW",
      "AI_MEMO_RETRIEVAL",
      "PLUGIN_STEP_STATUS",
      "vcp_log",
    ],
    keyword: "",
    paused: false,
  });

  const stats = ref<MessageStats>({
    totalCount: 0,
    ragCount: 0,
    chainCount: 0,
    agentCount: 0,
    memoCount: 0,
    pluginCount: 0,
    logCount: 0,
    messagesPerMinute: 0,
  });

  let statsStartTime = Date.now();
  let statsMessageCountAtMinute = 0;
  let statsInterval: ReturnType<typeof setInterval> | null = null;

  function calculateInitialStats() {
    const s = stats.value;
    s.totalCount = messages.value.length;
    s.ragCount = messages.value.filter(
      (m) => m.type === "RAG_RETRIEVAL_DETAILS"
    ).length;
    s.chainCount = messages.value.filter(
      (m) => m.type === "META_THINKING_CHAIN"
    ).length;
    s.agentCount = messages.value.filter(
      (m) => m.type === "AGENT_PRIVATE_CHAT_PREVIEW"
    ).length;
    s.memoCount = messages.value.filter(
      (m) => m.type === "AI_MEMO_RETRIEVAL"
    ).length;
    s.pluginCount = messages.value.filter(
      (m) => m.type === "PLUGIN_STEP_STATUS"
    ).length;
    s.logCount = messages.value.filter((m) => m.type === "vcp_log").length;
  }

  function startStatsTimer() {
    statsStartTime = Date.now();
    statsMessageCountAtMinute = stats.value.totalCount;
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(() => {
      const elapsedMinutes = (Date.now() - statsStartTime) / 60000;
      if (elapsedMinutes >= 1) {
        stats.value.messagesPerMinute =
          stats.value.totalCount - statsMessageCountAtMinute;
        statsStartTime = Date.now();
        statsMessageCountAtMinute = stats.value.totalCount;
      }
    }, 1000);
  }

  function stopStatsTimer() {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  }

  function matchesKeyword(text: string | undefined, keyword: string): boolean {
    return text?.toLowerCase().includes(keyword) ?? false;
  }

  const filteredMessages = computed(() => {
    let result = messages.value;

    if (filter.value.types.length > 0) {
      result = result.filter((msg) => filter.value.types.includes(msg.type));
    }

    if (filter.value.keyword) {
      const keyword = filter.value.keyword.toLowerCase();
      result = result.filter((msg) => {
        switch (msg.type) {
          case "RAG_RETRIEVAL_DETAILS": {
            const m = msg as RagRetrievalMessage;
            return (
              matchesKeyword(m.query, keyword) ||
              matchesKeyword(m.dbName, keyword) ||
              m.results?.some((r) => matchesKeyword(r.text, keyword))
            );
          }
          case "META_THINKING_CHAIN": {
            const m = msg as ThinkingChainMessage;
            return (
              matchesKeyword(m.query, keyword) ||
              matchesKeyword(m.chainName, keyword)
            );
          }
          case "AGENT_PRIVATE_CHAT_PREVIEW": {
            const m = msg as AgentChatPreviewMessage;
            return (
              matchesKeyword(m.agentName, keyword) ||
              matchesKeyword(m.query, keyword) ||
              matchesKeyword(m.response, keyword)
            );
          }
          case "AI_MEMO_RETRIEVAL": {
            const m = msg as AiMemoRetrievalMessage;
            return matchesKeyword(m.extractedMemories, keyword);
          }
          case "PLUGIN_STEP_STATUS": {
            const m = msg as PluginStepStatusMessage;
            return (
              matchesKeyword(m.pluginName, keyword) ||
              matchesKeyword(m.stepName, keyword)
            );
          }
          case "vcp_log": {
            const m = msg as VcpLogMessage;
            return (
              matchesKeyword(m.data?.content, keyword) ||
              matchesKeyword(m.data?.tool_name, keyword) ||
              matchesKeyword(m.data?.source, keyword)
            );
          }
          default:
            return false;
        }
      });
    }

    return result;
  });

  function updateConfig(newConfig: Partial<VcpConfig>) {
    const oldUrl = config.value.wsUrl;
    const oldKey = config.value.vcpKey;
    const oldMaxHistory = config.value.maxHistory;

    config.value = { ...config.value, ...newConfig };
    configManager.saveDebounced(config.value);

    // 如果 vcpPath 或 vcpImageKey 变化，重新刷新表情包清单
    if (
      (newConfig.vcpPath !== undefined &&
        newConfig.vcpPath !== config.value.vcpPath) ||
      (newConfig.vcpImageKey !== undefined &&
        newConfig.vcpImageKey !== config.value.vcpImageKey) ||
      (newConfig.wsUrl !== undefined && newConfig.wsUrl !== config.value.wsUrl)
    ) {
      clearEmoticonLibrary();
      if (
        config.value.vcpPath &&
        config.value.vcpImageKey &&
        config.value.wsUrl
      ) {
        refreshEmoticonLibrary(config.value).catch(() => {});
      }
    }

    // 如果 maxHistory 变小，立即裁剪现有消息
    if (
      newConfig.maxHistory !== undefined &&
      newConfig.maxHistory < oldMaxHistory
    ) {
      if (messages.value.length > newConfig.maxHistory) {
        const excess = messages.value.length - newConfig.maxHistory;
        messages.value.splice(0, excess);
        messagesManager.saveDebounced({ list: messages.value });
        logger.info(`Trimmed ${excess} messages due to maxHistory change`);
      }
    }

    // 如果关键配置变化且当前已连接，则重连
    if (
      (newConfig.wsUrl !== undefined && newConfig.wsUrl !== oldUrl) ||
      (newConfig.vcpKey !== undefined && newConfig.vcpKey !== oldKey)
    ) {
      if (connection.value.status === "connected") {
        reconnect();
      }
    }
  }

  function setConnectionStatus(status: ConnectionState["status"]) {
    connection.value.status = status;
    logger.info(`Connection status changed: ${status}`);
    if (status === "connected") {
      connection.value.reconnectAttempts = 0;
      startStatsTimer();
    } else if (status === "disconnected") {
      stopStatsTimer();
    }
  }

  function setPingLatency(latency: number) {
    connection.value.lastPingLatency = latency;
    connection.value.lastPingTime = Date.now();
  }

  // --- WebSocket 核心逻辑 ---

  function parseMessage(rawData: unknown): VcpMessage | null {
    if (!rawData || typeof rawData !== "object") return null;

    const data = rawData as Record<string, unknown>;
    const type = data.type as string | undefined;
    if (!type) return null;

    const validTypes: VcpMessageType[] = [
      "RAG_RETRIEVAL_DETAILS",
      "META_THINKING_CHAIN",
      "AGENT_PRIVATE_CHAT_PREVIEW",
      "AI_MEMO_RETRIEVAL",
      "PLUGIN_STEP_STATUS",
      "vcp_log",
    ];

    if (!validTypes.includes(type as VcpMessageType)) return null;

    return {
      ...data,
      type: type as VcpMessageType,
      timestamp:
        typeof data.timestamp === "number" ? data.timestamp : Date.now(),
      // 不存 raw：...data 已展开所有字段，raw 是完全冗余的副本，会使序列化体积翻倍
      // JsonViewer 使用 `msg.raw || msg` fallback，不受影响
    } as VcpMessage;
  }

  function startPingTimer() {
    stopPingTimer();
    pingTimer.value = setInterval(() => {
      if (ws.value?.readyState === WebSocket.OPEN) {
        pendingPingTime.value = Date.now();
        ws.value.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL);
  }

  function stopPingTimer() {
    if (pingTimer.value) {
      clearInterval(pingTimer.value);
      pingTimer.value = null;
    }
  }

  function attemptConnect() {
    const { wsUrl, vcpKey, mode = "observer" } = config.value;
    if (!wsUrl || !vcpKey) {
      setConnectionStatus("disconnected");
      if (isDetachedMonitor) {
        customMessage.warning(
          "WebSocket URL 或 VCP Key 为空，请先在主窗口配置"
        );
      }
      return;
    }

    // 如果是分离的消息监控模式，强制只连接 Observer
    if (isDetachedMonitor) {
      logger.info("Detached monitor mode: connecting to Observer only");
      connectObserver(wsUrl, vcpKey);
      connectVcpLog(wsUrl, vcpKey);
      return;
    }

    // 1. 连接观察者端点 (Observer / VCPInfo)
    // 如果主窗口中监控已分离，主窗口可以选择不连 Observer 以节省资源
    if (!isMonitorDetached.value && (mode === "observer" || mode === "both")) {
      connectObserver(wsUrl, vcpKey);
    }

    // 2. 连接 VCPLog 端点（接收普通日志和审批请求）
    if (mode === "observer" || mode === "both") {
      connectVcpLog(wsUrl, vcpKey);
    }

    // 3. 连接分布式节点端点 (Distributed)
    if (mode === "distributed" || mode === "both") {
      connectDistributed(wsUrl, vcpKey);
    }
  }

  function connectObserver(baseUrl: string, vcpKey: string) {
    if (ws.value?.readyState === WebSocket.OPEN || isConnecting.value) return;

    let fullUrl = baseUrl;
    if (!fullUrl.includes("VCP_Key=")) {
      if (!fullUrl.includes("/vcpinfo")) {
        fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}vcpinfo`;
      }
      fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}VCP_Key=${vcpKey}`;
    }

    try {
      isConnecting.value = true;
      setConnectionStatus("connecting");
      ws.value = new WebSocket(fullUrl);

      ws.value.onopen = () => {
        isConnecting.value = false;
        setConnectionStatus("connected");
        reconnectDelay = INITIAL_RECONNECT_DELAY;
        startPingTimer();

        // 连接成功后重扫表情包清单（保证与当前 VCP 一致）
        refreshEmoticonLibrary(config.value).catch(() => {});
      };

      ws.value.onclose = (event) => {
        isConnecting.value = false;
        stopPingTimer();
        setConnectionStatus("disconnected");
        if (!event.wasClean && config.value.autoConnect) {
          scheduleReconnect();
        }
      };

      ws.value.onerror = () => {
        // 连接失败通常是因为后端没开，降级为 warn 且不打印堆栈
        logger.warn(
          "Observer WebSocket connection failed (VCP backend might be offline)"
        );
        setConnectionStatus("error");
        if (config.value.autoConnect) {
          scheduleReconnect();
        }
      };

      ws.value.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          // 处理 pong 响应
          if (rawData.type === "pong") {
            const latency = pendingPingTime.value
              ? Date.now() - pendingPingTime.value
              : 0;
            setPingLatency(latency);
            pendingPingTime.value = null;
          } else {
            const message = parseMessage(rawData);
            if (message) addMessage(message);
          }
        } catch (e) {
          logger.warn("Failed to parse observer message", e);
        }
      };
    } catch (error) {
      logger.error("Failed to setup observer WebSocket", error);
      isConnecting.value = false;
      setConnectionStatus("error");
      if (config.value.autoConnect) {
        scheduleReconnect();
      }
    }
  }

  /**
   * 处理通过 VCPLog 频道收到的工具审批请求
   * 审批响应直接通过 VCPLog 连接发回（VCP 后端在通用消息处理中接收 tool_approval_response）
   */
  async function handleVcpLogApprovalRequest(data: any) {
    const { requestId, toolName, maid, args } = data;
    const toolCallingStore = useToolCallingStore();

    // 转换为 AIO 内部格式
    const parsedRequest = {
      requestId,
      toolId: toolName,
      methodName: (args?.command as string) || "",
      toolName: toolName,
      methodDisplayName: `${toolName}${args?.command ? "." + args.command : ""}`,
      rawBlock: JSON.stringify(args, null, 2),
      args: args || {},
    };

    // 映射 sessionId
    const sessionId = `vcp-${maid || "unknown"}`;

    // 调用 toolCallingStore 弹出审批 UI 并等待用户操作
    const result = await toolCallingStore.requestApproval(
      sessionId,
      parsedRequest as any,
      requestId
    );

    // 通过 VCPLog 连接发送审批响应回 VCP
    const approved = result === "approved";
    logger.info(
      `Tool approval response: ${requestId} -> ${approved ? "APPROVED" : "REJECTED"}`
    );

    if (vcpLogWs.value?.readyState === WebSocket.OPEN) {
      vcpLogWs.value.send(
        JSON.stringify({
          type: "tool_approval_response",
          data: { requestId, approved },
        })
      );
    } else {
      logger.warn("VCPLog WebSocket not open, cannot send approval response");
    }
  }

  function connectVcpLog(baseUrl: string, vcpKey: string) {
    if (
      vcpLogWs.value?.readyState === WebSocket.OPEN ||
      isVcpLogConnecting.value
    )
      return;

    let fullUrl = baseUrl;
    if (!fullUrl.includes("/VCPlog/")) {
      fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}VCPlog/VCP_Key=${vcpKey}`;
    } else if (!fullUrl.includes("VCP_Key=")) {
      fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}VCP_Key=${vcpKey}`;
    }

    try {
      isVcpLogConnecting.value = true;
      vcpLogWs.value = new WebSocket(fullUrl);

      vcpLogWs.value.onopen = () => {
        isVcpLogConnecting.value = false;
        logger.info("VCPLog WebSocket connected");
      };

      vcpLogWs.value.onclose = (event) => {
        isVcpLogConnecting.value = false;
        logger.info("VCPLog WebSocket closed", event.code);
        if (!event.wasClean && config.value.autoConnect) {
          // 依赖主 Observer 的重连逻辑，VCPLog 会在 attemptConnect 中一起重连
        }
      };

      vcpLogWs.value.onerror = () => {
        logger.warn("VCPLog WebSocket connection failed");
        isVcpLogConnecting.value = false;
      };

      vcpLogWs.value.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);

          // 处理工具审批请求
          if (rawData.type === "tool_approval_request") {
            logger.info(
              "Received tool_approval_request via VCPLog channel",
              rawData.data
            );
            handleVcpLogApprovalRequest(rawData.data);
            return;
          }

          // 处理连接确认
          if (rawData.type === "connection_ack") {
            logger.debug("VCPLog connection acknowledged");
            return;
          }

          // 其他消息走正常的消息解析流程
          const message = parseMessage(rawData);
          if (message) addMessage(message);
        } catch (e) {
          logger.warn("Failed to parse VCPLog message", e);
        }
      };
    } catch (e) {
      isVcpLogConnecting.value = false;
      logger.error("Failed to connect VCPLog WebSocket", e);
    }
  }

  function connectDistributed(baseUrl: string, vcpKey: string) {
    if (
      distributedWs.value?.readyState === WebSocket.OPEN ||
      isDistributedConnecting.value
    )
      return;

    let fullUrl = baseUrl;
    // 分布式节点端点格式: /vcp-distributed-server/VCP_Key=<key>
    if (!fullUrl.includes("/vcp-distributed-server/")) {
      fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}vcp-distributed-server/VCP_Key=${vcpKey}`;
    } else if (!fullUrl.includes("VCP_Key=")) {
      fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}VCP_Key=${vcpKey}`;
    }

    try {
      isDistributedConnecting.value = true;
      const distStore = useVcpDistributedStore();
      distStore.setStatus("connecting");
      distStore.clearExposedTools();
      distributedWs.value = new WebSocket(fullUrl);

      distributedWs.value.onopen = () => {
        isDistributedConnecting.value = false;
        logger.info("Distributed WebSocket connected");

        // 初始化协议处理器
        nodeProtocol.value = new VcpNodeProtocol((data) => {
          if (distributedWs.value?.readyState === WebSocket.OPEN) {
            distributedWs.value.send(JSON.stringify(data));
          }
        });

        distStore.setStatus("connected");

        // 初始化桥接工厂
        vcpBridgeFactory.setSendFunction((data) => {
          if (distributedWs.value?.readyState === WebSocket.OPEN) {
            distributedWs.value.send(JSON.stringify(data));
          }
        });

        if (distStore.config.enableBridge) {
          // 延迟一小会儿再请求，给 VCP 一点准备时间
          setTimeout(() => {
            vcpBridgeFactory.refresh().catch((err) => {
              logger.error("Failed to refresh VCP bridged tools", err);
            });
          }, 500);
        }
      };

      distributedWs.value.onclose = (event) => {
        isDistributedConnecting.value = false;
        logger.info("Distributed WebSocket closed", event.code);

        const distStore = useVcpDistributedStore();
        distStore.setStatus("disconnected");
        distStore.setNodeId(null);
        distStore.clearExposedTools();
        nodeProtocol.value = null;

        // 清理桥接工厂
        vcpBridgeFactory.teardown().catch((err) => {
          logger.error("Failed to teardown VCP bridge factory", err);
        });

        if (!event.wasClean && config.value.autoConnect) {
          scheduleReconnect();
        }
      };
      distributedWs.value.onerror = () => {
        // 连接失败通常是因为后端没开，降级为 warn 且不打印堆栈
        logger.warn(
          "Distributed WebSocket connection failed (VCP backend might be offline)"
        );
        isDistributedConnecting.value = false;

        const distStore = useVcpDistributedStore();
        distStore.setStatus("error");
        distStore.setNodeId(null);
        distStore.clearExposedTools();
      };

      distributedWs.value.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          handleDistributedMessage(rawData);
        } catch (e) {
          logger.warn("Failed to parse distributed message", e);
        }
      };
    } catch (e) {
      isDistributedConnecting.value = false;
      logger.error("Failed to connect distributed WebSocket", e);
      const distStore = useVcpDistributedStore();
      distStore.setStatus("error");
      distStore.setNodeId(null);
      distStore.clearExposedTools();
    }
  }
  function handleDistributedMessage(data: any) {
    logger.debug("Received distributed message", data);

    // 统一 ID 提取助手
    const extractNodeId = (msg: any) => {
      return (
        msg.nodeId ||
        msg.serverId ||
        msg.clientId ||
        msg.data?.nodeId ||
        msg.data?.serverId ||
        msg.data?.clientId ||
        msg.data?.id
      );
    };

    if (data.type === "connection_ack") {
      logger.info(
        "Distributed connection acknowledged",
        data.data || data.message || data
      );
      const distStore = useVcpDistributedStore();
      const nodeId = extractNodeId(data);
      if (nodeId) {
        distStore.setNodeId(nodeId);
      }
    } else if (data.type === "register_tools_ack") {
      logger.info("Tools registered successfully to VCP");
      const distStore = useVcpDistributedStore();
      distStore.confirmPendingExposedTools();
      const nodeId = extractNodeId(data);
      if (nodeId) {
        distStore.setNodeId(nodeId);
      }
    } else if (data.type === "execute_tool") {
      nodeProtocol.value?.handleExecuteTool(data.data);
    } else if (data.type === "tool_approval_request") {
      nodeProtocol.value?.handleToolApprovalRequest(data.data);
    } else if (data.type === "tool_approval_response") {
      const { requestId, approved } = data.data;
      const toolCallingStore = useToolCallingStore();
      toolCallingStore.handleExternalResponse(requestId, approved);
    } else if (data.type === "vcp_manifest_response") {
      nodeProtocol.value?.handleVcpManifestsResponse(data.data);
    } else if (data.type === "vcp_tool_result") {
      nodeProtocol.value?.handleVcpToolResult(data.data);
    } else if (data.type === "vcp_tool_status") {
      nodeProtocol.value?.handleVcpToolStatus(data.data);
    } else if (data.type === "assign_node_id") {
      const distStore = useVcpDistributedStore();
      const nodeId = extractNodeId(data);
      if (nodeId) {
        distStore.setNodeId(nodeId);
      }
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer.value) return;
    connection.value.reconnectAttempts += 1;

    // 增加一点随机抖动 (Jitter)，避免多个连接同时重连
    const jitter = Math.random() * 1000;
    const delay = reconnectDelay + jitter;

    logger.info(
      `Scheduling reconnect in ${Math.round(delay)}ms (Attempt ${connection.value.reconnectAttempts})`
    );

    reconnectTimer.value = setTimeout(() => {
      reconnectTimer.value = null;
      attemptConnect();
    }, delay);

    // 指数退避
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  function connect() {
    // 移除对 ws.value 的全局守卫，因为 connectObserver 和 connectDistributed 内部有各自的精细守卫
    // 这样可以实现在 Observer 已连的情况下，单独触发 Distributed 的连接
    attemptConnect();
  }

  function disconnect() {
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value);
      reconnectTimer.value = null;
    }
    stopPingTimer();

    if (ws.value) {
      ws.value.close(1000, "Client disconnect");
      ws.value = null;
    }

    if (vcpLogWs.value) {
      vcpLogWs.value.close(1000, "Client disconnect");
      vcpLogWs.value = null;
    }

    if (distributedWs.value) {
      distributedWs.value.close(1000, "Client disconnect");
      distributedWs.value = null;
    }

    setConnectionStatus("disconnected");
    connection.value.reconnectAttempts = 0;
  }

  function reconnect() {
    disconnect();
    connect();
  }

  function addMessage(msg: VcpMessage) {
    if (filter.value.paused) return;

    messages.value.push(msg);

    // 如果监控已分离，主窗口停止向本地文件写入，防止文件竞争
    if (isMonitorDetached.value && !isDetachedMonitor) {
      return;
    }
    stats.value.totalCount += 1;

    switch (msg.type) {
      case "RAG_RETRIEVAL_DETAILS":
        stats.value.ragCount += 1;
        break;
      case "META_THINKING_CHAIN":
        stats.value.chainCount += 1;
        break;
      case "AGENT_PRIVATE_CHAT_PREVIEW":
        stats.value.agentCount += 1;
        break;
      case "AI_MEMO_RETRIEVAL":
        stats.value.memoCount += 1;
        break;
      case "PLUGIN_STEP_STATUS":
        stats.value.pluginCount += 1;
        break;
      case "vcp_log":
        stats.value.logCount += 1;
        handleVcpLogNotification(msg as VcpLogMessage);
        break;
    }

    // 批量裁剪到限制大小
    if (messages.value.length > config.value.maxHistory) {
      const excess = messages.value.length - config.value.maxHistory;
      messages.value.splice(0, excess);
    }

    messagesManager.saveDebounced({ list: messages.value });
  }

  /**
   * 把 VCP 日志内容压成单行摘要，避免文件原文等长内容把浮动提示撑成满屏文字墙。
   * - 去除所有换行/制表符
   * - 压缩多余空白
   * - 截断到 maxLen 字符（默认 80），溢出加省略号
   */
  function summarizeLogContent(content: string, maxLen = 80): string {
    if (!content) return "";
    const flat = content.replace(/\s+/g, " ").trim();
    if (flat.length <= maxLen) return flat;
    return flat.slice(0, maxLen) + "…";
  }

  function handleVcpLogNotification(msg: VcpLogMessage) {
    const content = msg.data?.content || "";
    const toolName = msg.data?.tool_name;
    const status = msg.data?.status;

    // 0. 尝试解析 [模块名] JSON 格式，格式化为可读文本
    const structured = tryParseStructuredContent(content);
    // 用于通知中心的详情文本：优先使用格式化后的文本
    const displayContent = structured?.formatted ?? content;
    // 用于浮动提示的摘要：优先使用提取的文本内容，否则回退到原始 content
    const summarySource = structured?.textContent ?? content;
    // 状态：结构化解析的 status 可以补充后端未提供的状态
    const effectiveStatus = status ?? structured?.status;
    // 工具前缀：优先使用 toolName，其次使用解析出的模块名
    const effectiveToolName = toolName ?? structured?.moduleName;

    // 1. 提取任务 ID (兼容 "task_id: 123" 和 "任务 123")
    const searchText = structured?.textContent ?? content;
    const taskIdMatch = searchText.match(/(?:task_id|任务)\s*[:：]?\s*(\d+)/i);
    const taskId = taskIdMatch ? taskIdMatch[1] : null;

    // 2. 智能路由
    const notify = useNotification();
    const toolPrefix = effectiveToolName ? `[${effectiveToolName}] ` : "";
    const summary = summarizeLogContent(summarySource);

    // 3. 决定通知类型
    let notifyType: "success" | "error" | "warning" | "info" = "info";
    if (effectiveStatus === "error") {
      notifyType = "error";
    } else if (effectiveStatus === "success") {
      notifyType = "success";
    } else if (effectiveStatus === "warning") {
      notifyType = "warning";
    } else {
      // 根据内容关键字兜底判断类型
      const lowerSearchText = searchText.toLowerCase();
      if (
        lowerSearchText.includes("error") ||
        lowerSearchText.includes("failed") ||
        lowerSearchText.includes("错误") ||
        lowerSearchText.includes("失败")
      ) {
        notifyType = "error";
      } else if (
        lowerSearchText.includes("warning") ||
        lowerSearchText.includes("警告")
      ) {
        notifyType = "warning";
      } else if (
        lowerSearchText.includes("success") ||
        lowerSearchText.includes("成功") ||
        lowerSearchText.includes("完成") ||
        lowerSearchText.includes("归档")
      ) {
        notifyType = "success";
      }
    }

    // 4. 弹出即时浮动提示 (ElMessage / customMessage)
    // 只有在有明确状态，或者包含重要关键字时才弹出浮动提示，避免刷屏
    const hasStatus = !!effectiveStatus;
    const isImportant =
      searchText.includes("归档") ||
      searchText.includes("完成") ||
      searchText.includes("成功") ||
      searchText.includes("错误") ||
      searchText.includes("失败") ||
      taskId;

    if (hasStatus || isImportant) {
      if (notifyType === "error") {
        customMessage.error(`${toolPrefix}${summary || "执行错误"}`);
      } else if (notifyType === "warning") {
        customMessage.warning(`${toolPrefix}${summary}`);
      } else if (notifyType === "success") {
        customMessage.success(`${toolPrefix}${summary}`);
      } else {
        customMessage.info(`${toolPrefix}${summary}`);
      }
    }

    // 5. 全量推送到通知中心
    // 只要有工具名称，或者有内容，就应该推送到通知中心，不能漏掉任何工具消息！
    const title = taskId
      ? `VCP 任务通知 (ID: ${taskId})`
      : notifyType === "error"
        ? "VCP 执行错误"
        : notifyType === "success"
          ? "VCP 工具执行完成"
          : "VCP 运行日志";

    // 调用通知系统
    notify[notifyType](title, `${toolPrefix}${displayContent}`, {
      source: "VCP",
    });
  }

  function clearMessages() {
    messages.value = [];
    messagesManager.save({ list: [] });
    stats.value = {
      totalCount: 0,
      ragCount: 0,
      chainCount: 0,
      agentCount: 0,
      memoCount: 0,
      pluginCount: 0,
      logCount: 0,
      messagesPerMinute: 0,
    };
    statsStartTime = Date.now();
    statsMessageCountAtMinute = 0;
  }

  function setFilter(newFilter: Partial<FilterState>) {
    filter.value = { ...filter.value, ...newFilter };
  }

  function togglePause() {
    filter.value.paused = !filter.value.paused;
  }

  function exportMessages(): string {
    return JSON.stringify(filteredMessages.value, null, 2);
  }

  /**
   * 重新从磁盘加载消息（用于窗口回归时同步数据）
   */
  async function reloadMessages() {
    logger.info("Reloading messages from disk...");
    const loadedMessages = await messagesManager.load();
    messages.value = loadedMessages.list || [];
    calculateInitialStats();
  }

  // --- 窗口同步逻辑 ---

  function broadcastState() {
    // 只有主窗口负责广播状态给分离窗口
    if (bus.windowType === "main") {
      bus.syncState(
        "vcp-connector" as any,
        {
          status: connection.value.status,
          config: config.value,
        },
        0,
        true
      );
    }
  }

  const unlistenFns: (() => void)[] = [];

  async function setupSync() {
    // 监听状态同步
    const unlistenSync = bus.onMessage("state-sync", (payload: any) => {
      if (payload.stateType === "vcp-connector") {
        const { status: mainStatus, config: syncedConfig } = payload.data;

        // 同步配置
        if (syncedConfig) {
          config.value = { ...config.value, ...syncedConfig };

          // 分离窗口收到配置同步后，从磁盘加载表情包清单
          if (isDetachedMonitor) {
            loadEmoticonFromDisk(config.value).catch(() => {});
          }
        }

        // 如果是分离窗口，且收到主窗口已连接的消息，且自己还没连，则自动连接
        if (
          isDetachedMonitor &&
          mainStatus === "connected" &&
          connection.value.status === "disconnected"
        ) {
          logger.info("收到主窗口已连接信号，分离窗口自动建立观察者连接");
          connect();
        }
      }
    });
    unlistenFns.push(unlistenSync);

    // 主窗口监听初始状态请求
    if (bus.windowType === "main") {
      const unlistenInitial = bus.onInitialStateRequest(() => {
        logger.info("响应初始状态请求，广播 VCP 当前状态");
        broadcastState();
      });
      unlistenFns.push(unlistenInitial);

      // 监听连接状态变化并广播
      watch(
        () => connection.value.status,
        () => broadcastState()
      );
    } else {
      // 分离窗口请求初始状态
      setTimeout(() => {
        bus.requestInitialState();
      }, 500);
    }
  }

  // 初始化逻辑
  async function init() {
    // 加载配置
    const loadedConfig = await configManager.load();
    config.value = loadedConfig;

    // --- 表情包清单初始化 ---
    // 1. 从磁盘加载旧清单（快速恢复，让 resolveAsset 立即有数据）
    await loadEmoticonFromDisk(config.value);
    // 2. 如果 vcpPath/vcpImageKey 有值，后台异步重扫（不阻塞 init）
    if (
      config.value.vcpPath &&
      config.value.vcpImageKey &&
      config.value.wsUrl
    ) {
      refreshEmoticonLibrary(config.value).catch(() => {
        // 错误已在 service 内部处理
      });
    }

    // 加载消息
    const loadedMessages = await messagesManager.load();
    messages.value = loadedMessages.list || [];

    calculateInitialStats();

    // 设置同步逻辑
    await setupSync();

    if (config.value.autoConnect) {
      connect();
    }

    // 标记初始化完成
    _initResolve();
  }

  init();

  return {
    config,
    isDetachedMonitor,
    isMonitorDetached,
    connection,
    messages,
    filteredMessages,
    filter,
    stats,
    nodeProtocol,
    initPromise,
    updateConfig,
    connect,
    disconnect,
    reconnect,
    isConnecting,
    isDistributedConnecting,
    distributedWs,
    addMessage,
    clearMessages,
    setFilter,
    togglePause,
    exportMessages,
    reloadMessages,
  };
});
