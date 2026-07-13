// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
