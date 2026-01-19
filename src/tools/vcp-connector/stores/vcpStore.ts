import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  VcpMessage,
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
const DEFAULT_MAX_HISTORY = 500;

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

export const useVcpStore = defineStore("vcp-connector", () => {
  const config = ref<VcpConfig>(loadConfigFromStorage());

  const connection = ref<ConnectionState>({
    status: "disconnected",
    reconnectAttempts: 0,
  });

  const messages = ref<VcpMessage[]>([]);

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
    config.value = { ...config.value, ...newConfig };
    saveConfigToStorage(config.value);
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

  function incrementReconnectAttempts() {
    connection.value.reconnectAttempts += 1;
  }

  function resetReconnectAttempts() {
    connection.value.reconnectAttempts = 0;
  }

  function addMessage(msg: VcpMessage) {
    if (filter.value.paused) return;

    messages.value.push(msg);
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

  return {
    config,
    connection,
    messages,
    filteredMessages,
    filter,
    stats,
    updateConfig,
    setConnectionStatus,
    setPingLatency,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    addMessage,
    clearMessages,
    setFilter,
    togglePause,
    exportMessages,
  };
});
