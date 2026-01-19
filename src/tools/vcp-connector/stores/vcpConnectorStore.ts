import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
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

const errorHandler = createModuleErrorHandler("vcp-connector/store");
const logger = createModuleLogger("vcp-connector/store");

const STORAGE_KEY_CONFIG = "vcp-connector-config";
const STORAGE_KEY_MESSAGES = "vcp-connector-messages";
const DEFAULT_MAX_HISTORY = 500;
const PING_INTERVAL = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

function loadConfigFromStorage(): VcpConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    errorHandler.handle(e as Error, {
      userMessage: "Failed to load config from storage",
      showToUser: false,
    });
  }
  return {
    wsUrl: "",
    vcpKey: "",
    vcpPath: "",
    autoConnect: false,
    maxHistory: DEFAULT_MAX_HISTORY,
  };
}

function saveConfigToStorage(config: VcpConfig) {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  } catch (e) {
    errorHandler.handle(e as Error, {
      userMessage: "Failed to save config to storage",
      showToUser: false,
    });
  }
}

function loadMessagesFromStorage(): VcpMessage[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    logger.warn("Failed to load messages from storage", e);
  }
  return [];
}

function saveMessagesToStorage(messages: VcpMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
  } catch (e) {
    // 如果超出配额，尝试只保存最近的 100 条
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      try {
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages.slice(-100)));
      } catch (e2) {
        logger.error("Failed to save messages even after truncation", e2);
      }
    } else {
      logger.error("Failed to save messages to storage", e);
    }
  }
}

export const useVcpStore = defineStore("vcp-connector", () => {
  const config = ref<VcpConfig>(loadConfigFromStorage());

  const connection = ref<ConnectionState>({
    status: "disconnected",
    reconnectAttempts: 0,
  });

  const messages = ref<VcpMessage[]>(loadMessagesFromStorage());

  // WebSocket 内部状态
  const ws = ref<WebSocket | null>(null);
  const isConnecting = ref(false);
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
    saveConfigToStorage(config.value);

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
    const { wsUrl, vcpKey } = config.value;
    if (!wsUrl || !vcpKey) {
      setConnectionStatus("disconnected");
      return;
    }

    let fullUrl = wsUrl;
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
        if (!event.wasClean) {
          scheduleReconnect();
        }
      };

      ws.value.onerror = (err) => {
        logger.error("WebSocket error", err);
        setConnectionStatus("error");
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
            logger.warn("Failed to parse message", e);
          }
        }
      };
    } catch (e) {
      isConnecting.value = false;
      setConnectionStatus("error");
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer.value) return;
    connection.value.reconnectAttempts += 1;
    reconnectTimer.value = setTimeout(() => {
      reconnectTimer.value = null;
      attemptConnect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  function connect() {
    if (ws.value?.readyState === WebSocket.OPEN || isConnecting.value) return;
    disconnect();
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
    saveMessagesToStorage(messages.value);
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
    saveMessagesToStorage([]);
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
  calculateInitialStats();
  if (config.value.autoConnect) {
    connect();
  }

  return {
    config,
    connection,
    messages,
    filteredMessages,
    filter,
    stats,
    updateConfig,
    connect,
    disconnect,
    reconnect,
    isConnecting,
    addMessage,
    clearMessages,
    setFilter,
    togglePause,
    exportMessages,
  };
});
