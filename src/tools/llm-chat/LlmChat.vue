<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useLlmChatStore } from './store';
import { useAgentStore } from './agentStore';
import { useDetachedComponents } from '@/composables/useDetachedComponents';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import ChatArea from './components/ChatArea.vue';
import SessionsSidebar from './components/SessionsSidebar.vue';
import LeftSidebar from './components/LeftSidebar.vue';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('LlmChat');
const store = useLlmChatStore();
const agentStore = useAgentStore();

// 分离组件管理
const { initializeListeners } = useDetachedComponents();

// 对话区域是否已分离的状态
const isChatAreaDetached = ref(false);

// 检查对话区域是否已分离
const checkChatAreaDetached = async () => {
  try {
    const components = await invoke<Array<{ label: string; componentId: string }>>('get_finalized_components');
    const chatAreaComponent = components.find(c => c.componentId === 'chat-area');
    if (chatAreaComponent) {
      isChatAreaDetached.value = true;
      logger.info('检测到对话区域已分离', { label: chatAreaComponent.label });
    }
  } catch (error) {
    logger.error('检查已固定组件失败', { error });
  }
};

// 组件挂载时加载会话和智能体
onMounted(async () => {
  agentStore.loadAgents();
  store.loadSessions();
  
  // 初始化分离组件监听器
  await initializeListeners();
  
  // 检查对话区域是否已分离（刷新页面时恢复状态）
  await checkChatAreaDetached();
  
  // 监听对话区域分离/回归事件
  await listen<{ label: string; componentId: string }>('component-detached', (event) => {
    if (event.payload.componentId === 'chat-area') {
      isChatAreaDetached.value = true;
      logger.info('对话区域已分离', { label: event.payload.label });
    }
  });
  
  await listen<{ label: string; componentId: string }>('component-attached', (event) => {
    if (event.payload.componentId === 'chat-area') {
      isChatAreaDetached.value = false;
      logger.info('对话区域已回归', { label: event.payload.label });
    }
  });
  
  // 监听分离窗口的消息发送事件
  await listen<{ content: string }>('chat-area-send', (event) => {
    logger.info('收到分离窗口的发送消息事件', { content: event.payload.content });
    handleSendMessage(event.payload.content);
  });
  
  // 监听分离窗口的中止事件
  await listen('chat-area-abort', () => {
    logger.info('收到分离窗口的中止事件');
    handleAbortSending();
  });
  
  // 监听分离窗口的删除消息事件
  await listen<{ messageId: string }>('chat-area-delete-message', (event) => {
    logger.info('收到分离窗口的删除消息事件', { messageId: event.payload.messageId });
    handleDeleteMessage(event.payload.messageId);
  });
  
  // 监听分离窗口的重新生成事件
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

    <!-- 中间主内容区 - 仅在未分离时显示 -->
    <div v-if="!isChatAreaDetached" class="middle-panel">
      <ChatArea
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