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

/**
 * 分离的 MessageInput Composable
 *
 * 封装了 MessageInput 组件在悬浮窗中运行时的所有逻辑，
 * 主要包括状态消费和操作代理。
 */
import { computed } from "vue";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { createModuleLogger } from "@/utils/logger";
import { useChatSettings } from "../settings/useChatSettings";
import { useLlmChatStore } from "../../stores/llmChatStore";

const logger = createModuleLogger("DetachedChatInput");

export function useDetachedChatInput() {
  const bus = useWindowSyncBus();
  const store = useLlmChatStore();

  // 1. 消费聊天设置（包含流式输出开关）
  // 这个设置已经在 useLlmChatSync 中被同步了，这里只需要消费
  const { settings, isLoaded: settingsLoaded } = useChatSettings();

  // 计算流式输出状态
  const isStreamingEnabled = computed(() => {
    return settingsLoaded.value
      ? settings.value.uiPreferences.isStreaming
      : false;
  });

  logger.info("分离的 MessageInput 同步引擎已初始化", {
    isStreamingEnabled: isStreamingEnabled.value,
    settingsLoaded: settingsLoaded.value,
  });

  // 4. 操作代理
  const handleSendMessage = (content: string, attachments?: any[]) => {
    logger.info("代理发送消息操作", {
      content,
      attachmentCount: attachments?.length,
      sessionId: store.currentSessionId,
    });
    bus.requestAction("llm-chat:send-message", {
      content,
      options: {
        attachments,
        sessionId: store.currentSessionId,
      },
    });
  };

  const handleAbort = () => {
    logger.info("代理中止发送操作", { sessionId: store.currentSessionId });
    bus.requestAction("llm-chat:abort-sending", {
      sessionId: store.currentSessionId,
    });
  };

  // 5. 返回 props 和事件监听器（与 useDetachedChatArea 保持一致的结构）
  return {
    props: computed(() => ({
      isDetached: true,
      // 如果没有当前会话，则禁用输入框
      disabled: !store.currentSession,
      isSending: store.isCurrentSessionGenerating,
      // 注意：不需要在这里传递 isStreamingEnabled
      // MessageInput 组件内部会通过 useChatSettings() 自己读取
      // 但为了调试，我们在日志中输出当前值
    })),
    listeners: {
      send: handleSendMessage,
      abort: handleAbort,
    },
  };
}
