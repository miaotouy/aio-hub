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

import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import { computed } from "vue";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useVcpStore } from "@/tools/vcp-connector/stores/vcpConnectorStore";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import {
  isSameHost,
  resolveChannelToolHandling,
} from "@/tools/llm-chat/core/tool-calling/channel-tool-handling";

export { isSameHost };

/**
 * 检测当前渠道是否由 VCP 后端按文本协议消费工具调用。
 *
 * LLM Profile 中的显式工具处理声明优先；未配置的旧 Profile 才回退到
 * API 地址与 VCP WebSocket 同主机的兼容期启发式。该判断不推导 Prompt
 * 中是否已注入任何 VCP 或 AIO 工具定义。
 */
export function useIsVcpChannel(
  overrideProfileId?: string | import("vue").Ref<string | undefined>
) {
  const { currentAgentId } = useLlmChatUiState();
  const agentStore = useAgentStore();
  const vcpStore = useVcpStore();
  const { getProfileById } = useLlmProfiles();

  const channelToolHandling = computed(() => {
    const profileId =
      typeof overrideProfileId === "object"
        ? overrideProfileId.value
        : overrideProfileId;
    const targetProfileId =
      profileId ||
      (currentAgentId.value
        ? agentStore.getAgentById(currentAgentId.value)?.profileId
        : undefined);
    const profile = targetProfileId
      ? getProfileById(targetProfileId)
      : undefined;

    return resolveChannelToolHandling(profile, vcpStore.config.wsUrl);
  });

  const isVcpChannel = computed(
    () => channelToolHandling.value.isVcpTextChannel
  );

  return { isVcpChannel, channelToolHandling };
}
