<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { ChatMessageNode } from '../types';
import { useComponentDragging } from '@/composables/useComponentDragging';
import { useDetachedComponents } from '@/composables/useDetachedComponents';
import { useWindowResize } from '@/composables/useWindowResize';
import { createModuleLogger } from '@utils/logger';
import ComponentHeader from '@/components/ComponentHeader.vue';
import MessageList from './MessageList.vue';
import MessageInput from './MessageInput.vue';
import { useDetachedChatArea } from '../composables/useDetachedChatArea';

const logger = createModuleLogger('ChatArea');

interface Props {
  messages: ChatMessageNode[];
  isSending: boolean;
  disabled: boolean;
  isDetached?: boolean; // 是否在独立窗口中
  currentAgentId?: string; // 当前智能体 ID
  currentModelId?: string; // 当前模型 ID
}

interface Emits {
  (e: 'send', content: string): void;
  (e: 'abort'): void;
  (e: 'delete-message', messageId: string): void;
  (e: 'regenerate'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const containerRef = ref<HTMLDivElement>();

// 获取智能体和模型信息
import { useAgentStore } from '../agentStore';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useModelMetadata } from '@/composables/useModelMetadata';
const agentStore = useAgentStore();
const { getProfileById } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();

// 当前智能体信息
const currentAgent = computed(() => {
  if (!finalCurrentAgentId.value) return null;
  return agentStore.getAgentById(finalCurrentAgentId.value);
});

// 当前模型信息
const currentModel = computed(() => {
  if (!currentAgent.value) return null;
  const profile = getProfileById(currentAgent.value.profileId);
  if (!profile) return null;
  // 在分离模式下，我们可能没有完整的模型列表，所以需要处理
  const modelId = finalCurrentModelId.value || currentAgent.value.modelId;
  return profile.models.find(m => m.id === modelId);
});

// 模型图标
const modelIcon = computed(() => {
  if (!currentModel.value) return null;
  return getModelIcon(currentModel.value);
});

// ===== 拖拽功能 =====
const { startDrag } = useComponentDragging(
  {
    threshold: 10,
    finalizeThreshold: 100,
    enableThrottle: true,
  },
  {
    onCreatePreview: (e) => {
      const rect = containerRef.value?.getBoundingClientRect();
      if (!rect) {
        logger.error('无法获取容器尺寸');
        return null;
      }
  
      return {
        componentId: 'chat-area',
        displayName: '对话区域',
        width: rect.width + 80,
        height: rect.height + 80,
        mouseX: e.screenX,
        mouseY: e.screenY,
      };
    },
  }
);

// 处理拖拽开始
const handleDragStart = (e: MouseEvent) => {
  // 如果已经分离，则不执行任何操作，让Tauri的窗口拖拽接管
  if (props.isDetached) {
    return;
  }
  startDrag(e);
};

// ===== 窗口大小调整功能 =====
const { createResizeHandler } = useWindowResize();
const handleResizeStart = createResizeHandler('SouthEast');

// ===== 独立窗口功能 =====
const { initializeListeners, requestPreviewWindow, finalizePreviewWindow, isComponentDetached } = useDetachedComponents();

const isMessageInputDetached = computed(() => {
  const result = isComponentDetached('chat-input');
  logger.info('MessageInput 分离状态检查', { isDetached: result });
  return result;
});

// 初始化监听器以同步分离状态
onMounted(async () => {
  await initializeListeners();
  logger.info('ChatArea 分离组件监听器已初始化');
});

// 处理从菜单打开独立窗口
const handleDetach = async () => {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    logger.error('无法获取容器尺寸');
    return;
  }

  try {
    // 使用组件分离的正确流程
    const config = {
      componentId: 'chat-area',
      displayName: '对话区域',
      width: rect.width + 80,
      height: rect.height + 80,
      mouseX: rect.left + rect.width / 2,
      mouseY: rect.top + rect.height / 2,
    };

    logger.info('通过菜单创建独立窗口', { config });

    // 请求预览窗口
    const label = await requestPreviewWindow(config);

    if (label) {
      logger.info('预览窗口已创建，立即固定', { label });
      // 立即固定窗口（因为这是菜单点击，不是拖拽）
      const success = await finalizePreviewWindow(label);

      if (success) {
        logger.info('独立窗口创建成功', { label });
      } else {
        logger.error('固定预览窗口失败');
      }
    } else {
      logger.error('创建预览窗口失败');
    }
  } catch (error) {
    logger.error('通过菜单创建独立窗口失败', { error });
  }
};

// ===== 消息事件处理 =====
// 根据是否分离，决定是直接 emit 还是使用代理
let finalMessages = ref<ChatMessageNode[]>(props.messages);
let finalIsSending = ref(props.isSending);
let finalDisabled = ref(props.disabled);
let finalCurrentAgentId = ref(props.currentAgentId);
let finalCurrentModelId = ref(props.currentModelId);

let handleSendMessage = (content: string) => emit('send', content);
let handleAbort = () => emit('abort');
let handleDeleteMessage = (messageId: string) => emit('delete-message', messageId);
let handleRegenerate = () => emit('regenerate');

if (props.isDetached) {
  const detached = useDetachedChatArea();
  
  finalMessages = detached.messages;
  finalIsSending = detached.isSending;
  finalDisabled = detached.disabled;
  finalCurrentAgentId = detached.currentAgentId;
  finalCurrentModelId = detached.currentModelId;

  handleSendMessage = detached.sendMessage;
  handleAbort = detached.abortSending;
  handleDeleteMessage = detached.deleteMessage;
  handleRegenerate = detached.regenerateLastMessage;
  
  logger.info('ChatArea 运行在分离模式');
}
</script>

<template>
  <div ref="containerRef" :class="['chat-area-container', { 'detached-mode': isDetached }]">
    <!-- 头部区域 -->
    <div class="chat-header">
      <!-- 拖拽手柄 -->
      <ComponentHeader
        position="top"
        :drag-mode="isDetached ? 'window' : 'detach'"
        show-actions
        :collapsible="false"
        class="detachable-handle"
        @mousedown="handleDragStart"
        @detach="handleDetach"
      />

      <!-- 智能体和模型信息 -->
      <div class="agent-model-info">
        <div v-if="currentAgent" class="agent-info">
          <span class="agent-icon">{{ currentAgent.icon || '🤖' }}</span>
          <span class="agent-name">{{ currentAgent.name }}</span>
        </div>
        <div v-if="currentModel" class="model-info">
          <img v-if="modelIcon" :src="modelIcon" class="model-icon" :alt="currentModel.name || currentModel.id" />
          <span class="model-name">{{ currentModel.name || currentModel.id }}</span>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 对话内容区 -->
      <div class="chat-content">
        <!-- 消息列表 -->
        <MessageList
          :messages="finalMessages"
          :is-sending="finalIsSending"
          @delete-message="handleDeleteMessage"
          @regenerate="handleRegenerate"
        />

        <!-- 输入框 -->
        <MessageInput
          v-if="!isMessageInputDetached"
          :disabled="finalDisabled"
          :is-sending="finalIsSending"
          @send="handleSendMessage"
          @abort="handleAbort"
        />
      </div>
    </div>

    <!-- 右下角调整大小手柄，仅在分离模式下显示 -->
    <div
      v-if="isDetached"
      class="resize-handle"
      @mousedown="handleResizeStart"
      title="拖拽调整窗口大小"
    />
  </div>
</template>

<style scoped>
.chat-area-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

/* 分离模式下添加更强的阴影 */
.chat-area-container.detached-mode {
  height: 90vh;
  box-shadow:
    0 8px 16px rgba(0, 0, 0, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.15);
}

/* 头部区域 */
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  min-height: 42px;
}

/* 智能体和模型信息 */
.agent-model-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.agent-info,
.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.model-name {
  font-size: 13px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.main-content {
  display: flex;
  flex: 1;
  padding: 12px;
  min-width: 0;
  min-height: 0;
}

/* 分离手柄的特定样式 */
.detachable-handle {
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--border-color);
  background: transparent;
  cursor: move;
  border-radius: 8px;
}

/* 分离模式下，手柄也可以用于拖动窗口 */
.chat-area-container.detached-mode .detachable-handle {
  cursor: move;
}

.chat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 右下角调整大小手柄 */
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, var(--primary-color) 50%);
  border-radius: 0 0 8px 0;
  opacity: 0.5;
  transition: opacity 0.2s;
  z-index: 10;
}

.resize-handle:hover {
  opacity: 1;
  background: linear-gradient(135deg, transparent 50%, var(--primary-hover-color) 50%);
}

.resize-handle:active {
  opacity: 1;
  background: linear-gradient(135deg, transparent 50%, var(--primary-color) 50%);
}
</style>