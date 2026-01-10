import { useLlmChatStore } from '../stores/llmChatStore';
import { useLlmRequest } from '../../llm-api/composables/useLlmRequest';
import { useLlmProfilesStore } from '../../llm-api/stores/llmProfiles';
import { useNodeManager } from './useNodeManager';
import type { ChatSession } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/useChatExecutor');

export function useChatExecutor() {
  const chatStore = useLlmChatStore();
  const llmRequest = useLlmRequest();
  const profilesStore = useLlmProfilesStore();
  const nodeManager = useNodeManager();

  /**
   * 执行对话请求
   */
  async function execute(session: ChatSession, userContent: string, parentNodeId?: string) {
    if (chatStore.isSending) return;

    // 解析当前选中的模型
    const [profileId, modelId] = chatStore.selectedModelValue.split(':');
    if (!profileId || !modelId) {
      logger.warn('No model selected');
      return;
    }

    const profile = profilesStore.profiles.find(p => p.id === profileId);
    
    // 校验渠道是否有效且启用
    if (!profile || !profile.enabled) {
      logger.warn('Selected profile is not found or disabled', { profileId });
      return;
    }

    const model = profile.models.find(m => m.id === modelId);
    if (!model) {
      logger.warn('Selected model is not found', { modelId });
      return;
    }

    // 1. 创建用户消息节点 (如果提供了 parentNodeId，说明是重试，不需要再创建用户节点)
    let currentUserNodeId = parentNodeId || '';
    if (!currentUserNodeId) {
      const userNode = nodeManager.createNode({
        role: 'user',
        content: userContent,
        parentId: session.activeLeafId,
      });
      nodeManager.addNodeToSession(session, userNode);
      currentUserNodeId = userNode.id;
    }

    // 2. 创建助手消息节点（初始状态为 generating）
    const assistantNode = nodeManager.createNode({
      role: 'assistant',
      content: '',
      parentId: currentUserNodeId,
      status: 'generating',
      metadata: {
        modelId: modelId,
        modelDisplayName: model?.name || modelId
      }
    });
    nodeManager.addNodeToSession(session, assistantNode);
    
    // 3. 更新活跃节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    chatStore.isSending = true;

    try {
      // 4. 构造上下文
      const context = chatStore.currentActivePath
        .map(n => ({
          role: n.role as 'user' | 'assistant' | 'system',
          content: n.content
        }))
        // 排除掉当前的助手节点（因为它还没内容）
        .filter(n => n.content || n.role === 'user');

      // 5. 发起请求
      const result = await llmRequest.sendRequest({
        profileId,
        modelId,
        messages: context,
        stream: true,
        onStream: (chunk) => {
          assistantNode.content += chunk;
          session.updatedAt = new Date().toISOString();
        }
      });

      // 如果返回 null，说明请求在底层被拦截或报错了（errorHandler 处理了）
      if (!result) {
        throw new Error('Request failed or was cancelled');
      }

      if (!result.isStream) {
        assistantNode.content = result.content || '';
      }

      assistantNode.status = 'complete';
    } catch (error: any) {
      logger.error('Chat execution failed', error);
      assistantNode.status = 'error';
      assistantNode.metadata = {
        ...assistantNode.metadata,
        error: error.message
      };
    } finally {
      chatStore.isSending = false;
      session.updatedAt = new Date().toISOString();
    }
  }

  return {
    execute
  };
}