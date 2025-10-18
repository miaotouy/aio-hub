<script setup lang="ts">
import { onMounted, computed, watch } from 'vue';
import { useLlmChatStore } from './store';
import { useAgentStore } from './agentStore';
import { useDetachedComponents } from '@/composables/useDetachedComponents';
import { listen } from '@tauri-apps/api/event';
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import ChatArea from './components/ChatArea.vue';
import SessionsSidebar from './components/SessionsSidebar.vue';
import LeftSidebar from './components/LeftSidebar.vue';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('LlmChat');
const store = useLlmChatStore();
const agentStore = useAgentStore();

// 分离组件管理
const {
  initializeListeners,
  isComponentDetached,
  detachedComponentLabels,
  labelToComponentId
} = useDetachedComponents();

// 对话区域是否已分离的状态
const isChatAreaDetached = computed(() => {
  const result = isComponentDetached('chat-area');
  logger.info('ChatArea 分离状态检查', { isDetached: result });
  return result;
});

// 向分离窗口推送数据
const pushDataToDetachedWindow = async () => {
  if (!isChatAreaDetached.value) return;
  
  try {
    const windows = await getAllWebviewWindows();
    
    // 找到 chat-area 对应的窗口标签
    let chatAreaLabel: string | null = null;
    for (const label of detachedComponentLabels.value) {
      if (labelToComponentId.value.get(label) === 'chat-area') {
        chatAreaLabel = label;
        break;
      }
    }
    
    if (!chatAreaLabel) {
      logger.warn('未找到 ChatArea 窗口标签', {
        detachedLabels: Array.from(detachedComponentLabels.value),
        labelMap: Array.from(labelToComponentId.value.entries())
      });
      return;
    }
    
    // 查找对应的窗口对象
    const chatAreaWindow = windows.find(w => w.label === chatAreaLabel);
    
    if (chatAreaWindow) {
      const currentAgent = currentAgentId.value ? agentStore.getAgentById(currentAgentId.value) : null;
      
      const syncData = {
        messages: store.currentMessageChain,
        isSending: store.isSending,
        disabled: !store.currentSession,
        currentAgentId: currentAgentId.value,
        currentModelId: currentAgent?.modelId,
      };
      
      // 发送到特定窗口
      await chatAreaWindow.emit('chat-area-sync-data', syncData);
      logger.info('推送数据到分离窗口', {
        windowLabel: chatAreaWindow.label,
        messageCount: syncData.messages.length,
        isSending: syncData.isSending,
        currentAgentId: syncData.currentAgentId
      });
    } else {
      logger.warn('未找到 ChatArea 分离窗口对象', {
        chatAreaLabel,
        availableWindows: windows.map(w => w.label)
      });
    }
  } catch (error) {
    logger.error('推送数据到分离窗口失败', { error });
  }
};

// 组件挂载时加载会话和智能体
onMounted(async () => {
  agentStore.loadAgents();
  store.loadSessions();
  
  // 初始化分离组件监听器
  await initializeListeners();
  
  // 监听分离窗口的消息发送事件（来自 ChatArea 或 MessageInput）
  await listen<{ content: string }>('chat-area-send', (event) => {
    logger.info('收到 ChatArea 分离窗口的发送消息事件', { content: event.payload.content });
    handleSendMessage(event.payload.content);
  });
  
  await listen<{ content: string }>('chat-input-send', (event) => {
    logger.info('收到 MessageInput 分离窗口的发送消息事件', { content: event.payload.content });
    handleSendMessage(event.payload.content);
  });
  
  // 监听分离窗口的中止事件（来自 ChatArea 或 MessageInput）
  await listen('chat-area-abort', () => {
    logger.info('收到 ChatArea 分离窗口的中止事件');
    handleAbortSending();
  });
  
  await listen('chat-input-abort', () => {
    logger.info('收到 MessageInput 分离窗口的中止事件');
    handleAbortSending();
  });
  
  // 监听分离窗口的删除消息事件（来自 ChatArea）
  await listen<{ messageId: string }>('chat-area-delete-message', (event) => {
    logger.info('收到分离窗口的删除消息事件', { messageId: event.payload.messageId });
    handleDeleteMessage(event.payload.messageId);
  });
  
  // 监听分离窗口的重新生成事件（来自 ChatArea）
  await listen('chat-area-regenerate', () => {
    logger.info('收到分离窗口的重新生成事件');
    handleRegenerate();
  });
  
  logger.info('LLM Chat 模块已加载', {
    sessionCount: store.sessions.length,
    agentCount: agentStore.agents.length,
  });
  
  // 如果没有会话，尝试使用默认智能体创建一个
  if (store.sessions.length === 0) {
    const defaultAgent = agentStore.defaultAgent;
    if (defaultAgent) {
      handleNewSession({ agentId: defaultAgent.id });
    }
  }
  
  // 监听会话选择变化，推送数据到分离窗口
  watch(
    () => store.currentSessionId,
    async () => {
      logger.info('会话切换，推送数据到分离窗口');
      await pushDataToDetachedWindow();
    }
  );
  
  // 监听消息链变化，推送数据到分离窗口
  watch(
    () => store.currentMessageChain,
    async () => {
      logger.info('消息链变化，推送数据到分离窗口');
      await pushDataToDetachedWindow();
    },
    { deep: true }
  );
  
  // 监听发送状态变化，推送数据到分离窗口
  watch(
    () => store.isSending,
    async () => {
      logger.info('发送状态变化，推送数据到分离窗口');
      await pushDataToDetachedWindow();
    }
  );
  
  // 监听智能体变化，推送数据到分离窗口
  watch(
    () => currentAgentId.value,
    async () => {
      logger.info('智能体变化，推送数据到分离窗口');
      await pushDataToDetachedWindow();
    }
  );
  
  // 监听组件分离事件，立即推送数据
  await listen<{ label: string; componentId: string }>('component-detached', async (event) => {
    if (event.payload.componentId === 'chat-area') {
      logger.info('ChatArea 组件已分离，立即推送数据', { label: event.payload.label });
      // 等待一小段时间确保分离窗口已完全初始化
      setTimeout(async () => {
        await pushDataToDetachedWindow();
      }, 500);
    }
  });
  
  // 监听组件附着事件
  await listen<{ label: string; componentId: string }>('component-attached', (event) => {
    if (event.payload.componentId === 'chat-area') {
      logger.info('ChatArea 组件已重新附着', { label: event.payload.label });
    }
  });
});

// 当前会话的智能体ID
const currentAgentId = computed(() => store.currentSession?.currentAgentId || '');

// 当前会话的参数覆盖
const parameterOverrides = computed(() => store.currentSession?.parameterOverrides);
const systemPromptOverride = computed(() => store.currentSession?.systemPromptOverride);

// 处理发送消息
const handleSendMessage = async (content: string) => {
  if (!store.currentSession) {
    logger.warn('发送消息失败：没有活动会话');
    return;
  }
  
  await store.sendMessage(content);
};

// 处理中止发送
const handleAbortSending = () => {
  store.abortSending();
};

// 处理重新生成
const handleRegenerate = async () => {
  await store.regenerateLastMessage();
};

// 处理删除消息
const handleDeleteMessage = (messageId: string) => {
  store.deleteMessage(messageId);
};

// 处理新建会话
const handleNewSession = (data: { agentId: string; name?: string }) => {
  store.createSession(data.agentId, data.name);
  logger.info('创建新会话', data);
};

// 处理切换会话
const handleSwitchSession = (sessionId: string) => {
  store.switchSession(sessionId);
};

// 处理删除会话
const handleDeleteSession = (sessionId: string) => {
  store.deleteSession(sessionId);
};

// 处理切换智能体
const handleChangeAgent = (agentId: string) => {
  if (!store.currentSession) return;
  
  store.updateSession(store.currentSession.id, {
    currentAgentId: agentId,
    // 清除参数和系统提示词覆盖
    parameterOverrides: undefined,
    systemPromptOverride: undefined,
  });
  
  logger.info('切换智能体', { agentId });
};

// 处理更新参数覆盖
const handleUpdateParameterOverrides = (params: any) => {
  if (!store.currentSession) return;
  
  store.updateSession(store.currentSession.id, {
    parameterOverrides: params,
  });
};

// 处理更新系统提示词覆盖
const handleUpdateSystemPromptOverride = (prompt: string | undefined) => {
  if (!store.currentSession) return;
  
  store.updateSession(store.currentSession.id, {
    systemPromptOverride: prompt,
  });
};

// 处理 Profile 更新
const handleUpdateProfileId = (profileId: string) => {
  if (!currentAgentId.value) return;
  agentStore.updateAgent(currentAgentId.value, { profileId });
  logger.info('更新智能体 Profile', { agentId: currentAgentId.value, profileId });
};

// 处理 Model 更新
const handleUpdateModelId = (modelId: string) => {
  if (!currentAgentId.value) return;
  agentStore.updateAgent(currentAgentId.value, { modelId });
  logger.info('更新智能体 Model', { agentId: currentAgentId.value, modelId });
};
</script>

<template>
  <div class="llm-chat-container">
    <!-- 左侧边栏：智能体选择和参数设置 -->
    <div class="left-panel">
      <LeftSidebar
        v-if="store.currentSession"
        :current-agent-id="currentAgentId"
        :parameter-overrides="parameterOverrides"
        :system-prompt-override="systemPromptOverride"
        @change-agent="handleChangeAgent"
        @update:parameter-overrides="handleUpdateParameterOverrides"
        @update:system-prompt-override="handleUpdateSystemPromptOverride"
        @update:profile-id="handleUpdateProfileId"
        @update:model-id="handleUpdateModelId"
      />
    </div>

    <!-- 中间主内容区 -->
    <div class="middle-panel">
      <!-- ChatArea 组件 - 仅在未分离时显示 -->
      <ChatArea
        v-if="!isChatAreaDetached"
        :messages="store.currentMessageChain"
        :is-sending="store.isSending"
        :disabled="!store.currentSession"
        :current-agent-id="currentAgentId"
        :current-model-id="store.currentSession?.currentAgentId ? agentStore.getAgentById(store.currentSession.currentAgentId)?.modelId : undefined"
        @send="handleSendMessage"
        @abort="handleAbortSending"
        @delete-message="handleDeleteMessage"
        @regenerate="handleRegenerate"
      />
      
      <!-- 分离后的占位提示 -->
      <div v-else class="detached-placeholder">
        <div class="placeholder-content">
          <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/>
            <path d="M9 3v18M3 9h18M3 15h6M15 15h6" stroke-width="2"/>
          </svg>
          <h3 class="placeholder-title">对话区域已分离</h3>
          <p class="placeholder-description">对话区域已在独立窗口中打开</p>
        </div>
      </div>
    </div>

    <!-- 右侧边栏：会话列表 -->
    <div class="right-panel">
      <SessionsSidebar
        :sessions="store.sessions"
        :current-session-id="store.currentSessionId"
        :current-agent-id="currentAgentId"
        @switch="handleSwitchSession"
        @delete="handleDeleteSession"
        @new-session="handleNewSession"
      />
    </div>
  </div>
</template>

<style scoped>
.llm-chat-container {
  display: flex;
  height: 100%;
  box-sizing: border-box;
  gap: 16px;
  padding: 20px;
  background-color: var(--bg-color);
  overflow: hidden;
}

.left-panel {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.middle-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

/* 分离后的占位样式 */
.detached-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.placeholder-content {
  text-align: center;
  padding: 48px 24px;
  max-width: 400px;
}

.placeholder-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  color: var(--text-secondary);
  opacity: 0.6;
}

.placeholder-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.placeholder-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

.right-panel {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}


/* 自定义滚动条样式 */
.left-panel::-webkit-scrollbar,
.right-panel::-webkit-scrollbar {
  width: 6px;
}

.left-panel::-webkit-scrollbar-track,
.right-panel::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 3px;
}

.left-panel::-webkit-scrollbar-thumb,
.right-panel::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.left-panel::-webkit-scrollbar-thumb:hover,
.right-panel::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>