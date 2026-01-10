import { useLlmChatStore } from '../stores/llmChatStore';
import { useLlmRequest } from '../../llm-api/composables/useLlmRequest';
import { useLlmProfilesStore } from '../../llm-api/stores/llmProfiles';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessageNode, ChatSession } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/useChatExecutor');

export function useChatExecutor() {
  const chatStore = useLlmChatStore();
  const llmRequest = useLlmRequest();
  const profilesStore = useLlmProfilesStore();

  /**
   * 执行对话请求
   */
  async function execute(session: ChatSession, userContent: string) {
    if (chatStore.isSending) return;

    // 解析当前选中的模型
    const [profileId, modelId] = chatStore.selectedModelValue.split(':');
    if (!profileId || !modelId) {
      logger.warn('No model selected');
      return;
    }

    const profile = profilesStore.profiles.find(p => p.id === profileId);
    const model = profile?.models.find(m => m.id === modelId);

    // 1. 创建用户消息节点
    const userNodeId = uuidv4();
    const userNode: ChatMessageNode = {
      id: userNodeId,
      parentId: session.activeLeafId,
      childrenIds: [],
      content: userContent,
      role: 'user',
      status: 'complete',
      timestamp: new Date().toISOString()
    };

    // 2. 更新 Session 状态
    session.nodes[session.activeLeafId].childrenIds.push(userNodeId);
    session.nodes[userNodeId] = userNode;
    session.activeLeafId = userNodeId;

    // 3. 创建助手消息节点（初始状态为 generating）
    const assistantNodeId = uuidv4();
    const assistantNode: ChatMessageNode = {
      id: assistantNodeId,
      parentId: userNodeId,
      childrenIds: [],
      content: '',
      role: 'assistant',
      status: 'generating',
      timestamp: new Date().toISOString(),
      metadata: {
        modelId: modelId,
        modelDisplayName: model?.name || modelId
      }
    };

    session.nodes[userNodeId].childrenIds.push(assistantNodeId);
    session.nodes[assistantNodeId] = assistantNode;
    session.activeLeafId = assistantNodeId;
    session.updatedAt = new Date().toISOString();

    chatStore.isSending = true;

    try {
      // 4. 构造上下文
      const context = chatStore.currentActivePath
        .filter(n => n.role !== 'system')
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