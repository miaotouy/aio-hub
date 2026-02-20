import { defineStore } from "pinia";
import { ref, computed, shallowRef } from "vue";
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
} from "../types/protocol";
import { VcpNodeProtocol } from "../services/vcpNodeProtocol";
import { useVcpDistributedStore } from "./vcpDistributedStore";

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
  }),
});

// 消息管理器：负责历史消息持久化
const messagesManager = createConfigManager<{ list: VcpMessage[] }>({
  moduleName: "vcp-connector",
  fileName: "messages.json",
  createDefault: () => ({ list: [] }),
});

export const useVcpStore = defineStore("vcp-connector", () => {
  const config = ref<VcpConfig>({
    wsUrl: "",
    vcpKey: "",
    vcpPath: "",
    autoConnect: false,
    maxHistory: DEFAULT_MAX_HISTORY,
    mode: "both",
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
  const isConnecting = ref(false);
  const isDistributedConnecting = ref(false);
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
    messagesPerMinute: 0,
  });

  let statsStartTime = Date.now();
  let statsMessageCountAtMinute = 0;
  let statsInterval: ReturnType<typeof setInterval> | null = null;

  function calculateInitialStats() {
    const s = stats.value;
    s.totalCount = messages.value.length;
    s.ragCount = messages.value.filter((m) => m.type === "RAG_RETRIEVAL_DETAILS").length;
    s.chainCount = messages.value.filter((m) => m.type === "META_THINKING_CHAIN").length;
    s.agentCount = messages.value.filter((m) => m.type === "AGENT_PRIVATE_CHAT_PREVIEW").length;
    s.memoCount = messages.value.filter((m) => m.type === "AI_MEMO_RETRIEVAL").length;
    s.pluginCount = messages.value.filter((m) => m.type === "PLUGIN_STEP_STATUS").length;
  }

  function startStatsTimer() {
    statsStartTime = Date.now();
    statsMessageCountAtMinute = stats.value.totalCount;
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(() => {
      const elapsedMinutes = (Date.now() - statsStartTime) / 60000;
      if (elapsedMinutes >= 1) {
        stats.value.messagesPerMinute = stats.value.totalCount - statsMessageCountAtMinute;
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
            return matchesKeyword(m.query, keyword) || matchesKeyword(m.chainName, keyword);
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
            return matchesKeyword(m.pluginName, keyword) || matchesKeyword(m.stepName, keyword);
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

    config.value = { ...config.value, ...newConfig };
    configManager.saveDebounced(config.value);

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
    ];

    if (!validTypes.includes(type as VcpMessageType)) return null;

    return {
      ...data,
      type: type as VcpMessageType,
      timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
      raw: rawData,
    } as VcpMessage;
  }

  function startPingTimer() {
    stopPingTimer();
    pingTimer.value = setInterval(() => {
      if (ws.value?.readyState === WebSocket.OPEN) {
        pendingPingTime.value = Date.now();
        ws.value.send("ping");
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
      return;
    }

    // 1. 连接观察者端点 (Observer)
    if (mode === "observer" || mode === "both") {
      connectObserver(wsUrl, vcpKey);
    }

    // 2. 连接分布式节点端点 (Distributed)
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
        logger.warn("Observer WebSocket connection failed (VCP backend might be offline)");
        setConnectionStatus("error");
        if (config.value.autoConnect) {
          scheduleReconnect();
        }
      };

      ws.value.onmessage = (event) => {
        if (event.data === "pong") {
          const latency = pendingPingTime.value ? Date.now() - pendingPingTime.value : 0;
          setPingLatency(latency);
          pendingPingTime.value = null;
        } else {
          try {
            const rawData = JSON.parse(event.data);
            const message = parseMessage(rawData);
            if (message) addMessage(message);
          } catch (e) {
            logger.warn("Failed to parse observer message", e);
          }
        }
      };
    } catch (e) {
      isConnecting.value = false;
      setConnectionStatus("error");
      if (config.value.autoConnect) {
        scheduleReconnect();
      }
    }
  }

  function connectDistributed(baseUrl: string, vcpKey: string) {
    if (distributedWs.value?.readyState === WebSocket.OPEN || isDistributedConnecting.value) return;

    let fullUrl = baseUrl;
    // 分布式节点端点格式: /vcp-distributed-server/VCP_Key=<key>
    if (!fullUrl.includes("/vcp-distributed-server/")) {
      fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}vcp-distributed-server/VCP_Key=${vcpKey}`;
    } else if (!fullUrl.includes("VCP_Key=")) {
      fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}VCP_Key=${vcpKey}`;
    }

    try {
      isDistributedConnecting.value = true;
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

        const distStore = useVcpDistributedStore();
        distStore.setStatus("connected");
      };

      distributedWs.value.onclose = (event) => {
        isDistributedConnecting.value = false;
        logger.info("Distributed WebSocket closed", event.code);

        const distStore = useVcpDistributedStore();
        distStore.setStatus("disconnected");
        distStore.setNodeId(null);
        nodeProtocol.value = null;

        if (!event.wasClean && config.value.autoConnect) {
          scheduleReconnect();
        }
      };
      distributedWs.value.onerror = () => {
        // 连接失败通常是因为后端没开，降级为 warn 且不打印堆栈
        logger.warn("Distributed WebSocket connection failed (VCP backend might be offline)");
        isDistributedConnecting.value = false;

        const distStore = useVcpDistributedStore();
        distStore.setStatus("error");
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
      logger.info("Distributed connection acknowledged", data.data || data.message || data);
      const distStore = useVcpDistributedStore();
      const nodeId = extractNodeId(data);
      if (nodeId) {
        distStore.setNodeId(nodeId);
      }
    } else if (data.type === "register_tools_ack") {
      logger.info("Tools registered successfully to VCP");
      const distStore = useVcpDistributedStore();
      const nodeId = extractNodeId(data);
      if (nodeId) {
        distStore.setNodeId(nodeId);
      }
    } else if (data.type === "execute_tool") {
      nodeProtocol.value?.handleExecuteTool(data.data);
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
    messagesManager.saveDebounced({ list: messages.value });
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
    }

    if (messages.value.length > config.value.maxHistory) {
      messages.value.shift();
    }
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

  // 初始化逻辑
  async function init() {
    // 加载配置
    const loadedConfig = await configManager.load();
    config.value = loadedConfig;

    // 加载消息
    const loadedMessages = await messagesManager.load();
    messages.value = loadedMessages.list || [];

    calculateInitialStats();

    if (config.value.autoConnect) {
      connect();
    }
  }

  init();

  return {
    config,
    connection,
    messages,
    filteredMessages,
    filter,
    stats,
    nodeProtocol,
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
  };
});
