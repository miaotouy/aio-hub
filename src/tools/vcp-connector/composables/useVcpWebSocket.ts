import { computed } from "vue";
import { useVcpStore } from "../stores/vcpConnectorStore";

/**
 * useVcpWebSocket Composable
 * 现在它只是 useVcpStore 的一个简单包装，
 * 核心 WebSocket 逻辑已移至 Store 以实现持久连接（即使组件卸载）。
 */
export function useVcpWebSocket() {
  const store = useVcpStore();

  return {
    connect: store.connect,
    disconnect: store.disconnect,
    reconnect: store.reconnect,
    isConnecting: computed(() => store.isConnecting),
    connectionStatus: computed(() => store.connection.status),
  };
}
