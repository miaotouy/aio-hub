import { ref, onUnmounted, watch, computed } from "vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { useVcpStore } from "../stores/vcpStore";
import type { VcpMessage, VcpMessageType } from "../types/protocol";

const errorHandler = createModuleErrorHandler("vcp-connector/useVcpWebSocket");
const logger = createModuleLogger("vcp-connector/useVcpWebSocket");

interface UseVcpWebSocketOptions {
  pingInterval?: number;
  maxReconnectDelay?: number;
  initialReconnectDelay?: number;
}

const DEFAULT_PING_INTERVAL = 30000;
const DEFAULT_MAX_RECONNECT_DELAY = 30000;
const DEFAULT_INITIAL_RECONNECT_DELAY = 1000;

export function useVcpWebSocket(options: UseVcpWebSocketOptions = {}) {
  const pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
  const maxReconnectDelay =
    options.maxReconnectDelay ?? DEFAULT_MAX_RECONNECT_DELAY;
  const initialReconnectDelay =
    options.initialReconnectDelay ?? DEFAULT_INITIAL_RECONNECT_DELAY;

  const store = useVcpStore();

  const ws = ref<WebSocket | null>(null);
  const isConnecting = ref(false);
  const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = ref<ReturnType<typeof setInterval> | null>(null);
  const pendingPingTime = ref<number | null>(null);

  let reconnectDelay = initialReconnectDelay;

  function parseMessage(rawData: unknown): VcpMessage | null {
    if (!rawData || typeof rawData !== "object") {
      return null;
    }

    const data = rawData as Record<string, unknown>;
    const type = data.type as string | undefined;

    if (!type) {
      logger.warn("Received message without type field");
      return null;
    }

    const validTypes: VcpMessageType[] = [
      "RAG_RETRIEVAL_DETAILS",
      "META_THINKING_CHAIN",
      "AGENT_PRIVATE_CHAT_PREVIEW",
      "AI_MEMO_RETRIEVAL",
      "PLUGIN_STEP_STATUS",
    ];

    if (!validTypes.includes(type as VcpMessageType)) {
      logger.warn(`Received unknown message type: ${type}`);
      return null;
    }

    return {
      ...data,
      type: type as VcpMessageType,
      timestamp:
        typeof data.timestamp === "number" ? data.timestamp : Date.now(),
      raw: rawData,
    } as VcpMessage;
  }

  function handleOpen() {
    logger.info("WebSocket connected");
    store.setConnectionStatus("connected");
    reconnectDelay = initialReconnectDelay;
    startPingTimer();
  }

  function handleClose(event: CloseEvent) {
    logger.info(`WebSocket closed: code=${event.code}, reason=${event.reason}`);
    stopPingTimer();
    store.setConnectionStatus("disconnected");

    if (!event.wasClean) {
      logger.warn("Connection closed unexpectedly, attempting reconnect...");
      scheduleReconnect();
    }
  }

  function handleError(event: Event) {
    logger.error("WebSocket error", event);
    store.setConnectionStatus("error");
    errorHandler.handle(new Error("WebSocket error"), { showToUser: false });
  }

  function handleMessage(event: MessageEvent) {
    try {
      const rawData = JSON.parse(event.data);
      const message = parseMessage(rawData);

      if (message) {
        store.addMessage(message);
      }
    } catch (e) {
      logger.warn("Failed to parse message", e);
    }
  }

  function startPingTimer() {
    stopPingTimer();
    pingTimer.value = setInterval(() => {
      sendPing();
    }, pingInterval);
  }

  function stopPingTimer() {
    if (pingTimer.value) {
      clearInterval(pingTimer.value);
      pingTimer.value = null;
    }
  }

  function sendPing() {
    if (ws.value?.readyState === WebSocket.OPEN) {
      pendingPingTime.value = Date.now();
      ws.value.send("ping");
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer.value) return;

    store.incrementReconnectAttempts();
    store.setConnectionStatus("connecting");

    logger.info(`Scheduling reconnect in ${reconnectDelay}ms`);

    reconnectTimer.value = setTimeout(() => {
      reconnectTimer.value = null;
      attemptConnect();
    }, reconnectDelay);

    reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
  }

  function attemptConnect() {
    const { wsUrl, vcpKey } = store.config;

    if (!wsUrl || !vcpKey) {
      logger.warn("Cannot connect: missing wsUrl or vcpKey");
      store.setConnectionStatus("disconnected");
      return;
    }

    let fullUrl = wsUrl;
    if (!fullUrl.includes("VCP_Key=")) {
      if (!fullUrl.includes("/vcpinfo")) {
        fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}vcpinfo`;
      }
      fullUrl = `${fullUrl.endsWith("/") ? fullUrl : fullUrl + "/"}VCP_Key=${vcpKey}`;
    }

    logger.info(`Connecting to ${fullUrl}`);

    try {
      isConnecting.value = true;
      store.setConnectionStatus("connecting");
      ws.value = new WebSocket(fullUrl);

      ws.value.onopen = () => {
        isConnecting.value = false;
        handleOpen();
      };

      ws.value.onclose = (event) => {
        isConnecting.value = false;
        handleClose(event);
      };

      ws.value.onerror = handleError;

      ws.value.onmessage = (event) => {
        if (event.data === "pong") {
          const latency = pendingPingTime.value
            ? Date.now() - pendingPingTime.value
            : undefined;
          store.setPingLatency(latency ?? 0);
          pendingPingTime.value = null;
        } else {
          handleMessage(event);
        }
      };
    } catch (e) {
      isConnecting.value = false;
      errorHandler.handle(e as Error, {
        userMessage: "Failed to create WebSocket connection",
        showToUser: true,
      });
      scheduleReconnect();
    }
  }

  function disconnect() {
    stopReconnectTimer();
    stopPingTimer();

    if (ws.value) {
      ws.value.close(1000, "Client disconnect");
      ws.value = null;
    }

    store.setConnectionStatus("disconnected");
    store.resetReconnectAttempts();
  }

  function stopReconnectTimer() {
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value);
      reconnectTimer.value = null;
    }
  }

  function connect() {
    if (ws.value?.readyState === WebSocket.OPEN || isConnecting.value) {
      logger.info("Already connected or connecting");
      return;
    }

    disconnect();
    attemptConnect();
  }

  watch(
    () => [store.config.wsUrl, store.config.vcpKey],
    () => {
      if (store.connection.status === "connected") {
        disconnect();
        connect();
      }
    },
  );

  onUnmounted(() => {
    disconnect();
  });

  return {
    connect,
    disconnect,
    isConnecting,
    connectionStatus: computed(() => store.connection.status),
  };
}
