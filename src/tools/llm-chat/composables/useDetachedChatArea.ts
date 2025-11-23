/**
 * 分离的 ChatArea Composable (简化版)
 *
 * 这是一个纯粹的“数据读取器”和“操作代理器”。
 * 它假设 Pinia Store 中的数据已经由外部环境（如 useLlmChatStateConsumer）填充完毕。
 *
 * 核心职责：
 * 1. 从 Pinia Store 中读取数据，并将其包装为 computed properties。
 * 2. 提供一系列函数，将组件的操作请求通过 WindowSyncBus 代理到主窗口。
 * 3. 不再包含任何状态同步或数据填充逻辑。
 */
import { computed, onUnmounted } from 'vue';
import { useWindowSyncBus } from '@/composables/useWindowSyncBus';
import { useLlmChatStore } from '../store';
import { useAgentStore } from '../agentStore';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('DetachedChatArea');

export function useDetachedChatArea() {
  const bus = useWindowSyncBus();
  const store = useLlmChatStore();
  const agentStore = useAgentStore();

  logger.info('useDetachedChatArea 已初始化 (简化版)');

  // 1. 操作代理
  const sendMessage = (content: string) => {
    logger.info('代理发送消息操作', { content });
    return bus.requestAction('send-message', { content });
  };

  const abortSending = () => {
    logger.info('代理中止发送操作');
    return bus.requestAction('abort-sending', {});
  };

  const regenerateLastMessage = (messageId: string) => {
    logger.info('代理重新生成操作', { messageId });
    return bus.requestAction('regenerate-from-node', { messageId });
  };

  const deleteMessage = (messageId: string) => {
    logger.info('代理删除消息操作', { messageId });
    return bus.requestAction('delete-message', { messageId });
  };

  const switchSibling = (nodeId: string, direction: 'prev' | 'next') => {
    logger.info('代理切换兄弟分支操作', { nodeId, direction });
    return bus.requestAction('switch-sibling', { nodeId, direction });
  };

  const toggleEnabled = (nodeId: string) => {
    logger.info('代理切换节点启用状态操作', { nodeId });
    return bus.requestAction('toggle-enabled', { nodeId });
  };

  const editMessage = (nodeId: string, newContent: string) => {
    logger.info('代理编辑消息操作', { nodeId, contentLength: newContent.length });
    return bus.requestAction('edit-message', { nodeId, newContent });
  };

  const createBranch = (nodeId: string) => {
    logger.info('代理创建分支操作', { nodeId });
    return bus.requestAction('create-branch', { nodeId });
  };

  const abortNode = (nodeId: string) => {
    logger.info('代理中止节点生成操作', { nodeId });
    return bus.requestAction('abort-node', { nodeId });
  };

  // 4. 导出的计算属性和操作（现在可以直接从 Store 获取）
  // 使用全局的 currentAgentId，而不是会话的 displayAgentId
  // 这样即使切换到新会话，智能体信息也不会消失
  const currentAgentId = computed(() => agentStore.currentAgentId || undefined);
  const currentModelId = computed(() => {
    const agentId = agentStore.currentAgentId;
    return agentId ? agentStore.getAgentById(agentId)?.modelId : undefined;
  });

  onUnmounted(() => {
    logger.info('DetachedChatArea composable 已卸载');
  });

  return {
    // 状态（直接从 Store 读取）
    messages: computed(() => store.currentActivePathWithPresets),
    isSending: computed(() => store.isSending),
    disabled: computed(() => !store.currentSession),
    currentAgentId,
    currentModelId,

    // 操作代理
    sendMessage,
    abortSending,
    deleteMessage,
    regenerateLastMessage,
    switchSibling,
    toggleEnabled,
    editMessage,
    createBranch,
    abortNode,
  };
}