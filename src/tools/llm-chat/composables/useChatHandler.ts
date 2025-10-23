/**
 * 聊天处理 Composable
 * 负责核心聊天逻辑：发送消息、重新生成、流式响应处理
 */

import type { ChatSession, ChatMessageNode } from '../types';
import type { LlmMessageContent } from '@/llm-apis/common';
import { useAgentStore } from '../agentStore';
import { useNodeManager } from './useNodeManager';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/chat-handler');

/**
 * LLM 上下文构建结果
 */
interface LlmContextData {
  systemPrompt?: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string | LlmMessageContent[];
  }>;
  currentMessage: LlmMessageContent[];
}

export function useChatHandler() {
  /**
   * 构建 LLM 上下文
   * 从活动路径和智能体配置中提取系统提示、对话历史和当前消息
   */
  const buildLlmContext = (
    activePath: ChatMessageNode[],
    agentConfig: any,
    currentUserMessage: string
  ): LlmContextData => {
    // 过滤出有效的对话上下文（排除禁用节点和系统节点）
    const llmContext = activePath
      .filter((node) => node.isEnabled !== false)
      .filter((node) => node.role !== 'system')
      .filter((node) => node.role === 'user' || node.role === 'assistant')
      .map((node) => ({
        role: node.role as 'user' | 'assistant',
        content: node.content,
      }));

    // 处理预设消息
    const presetMessages = agentConfig.presetMessages || [];
    const enabledPresets = presetMessages.filter((msg: any) => msg.isEnabled !== false);

    // 提取 system 消息并合并为 systemPrompt
    const systemMessages = enabledPresets
      .filter((msg: any) => msg.role === 'system')
      .map((msg: any) => msg.content);
    const systemPrompt = systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined;

    // 提取对话消息（user 和 assistant）
    const presetConversation: Array<{
      role: 'user' | 'assistant';
      content: string | LlmMessageContent[];
    }> = enabledPresets
      .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

    // 合并预设对话和会话上下文（排除最后一条用户消息，因为那是当前要发送的）
    const sessionContext = llmContext.slice(0, -1);
    const conversationHistory = [...presetConversation, ...sessionContext];

    // 当前请求（最后一条用户消息）
    const currentMessage: LlmMessageContent[] = [
      {
        type: 'text' as const,
        text: currentUserMessage,
      },
    ];

    return { systemPrompt, conversationHistory, currentMessage };
  };

  /**
   * 处理流式响应更新
   */
  const handleStreamUpdate = (
    session: ChatSession,
    nodeId: string,
    chunk: string,
    isReasoning: boolean = false
  ): void => {
    const node = session.nodes[nodeId];
    if (!node) return;

    if (isReasoning) {
      // 推理内容流式更新
      if (!node.metadata) {
        node.metadata = {};
      }
      if (!node.metadata.reasoningContent) {
        node.metadata.reasoningContent = '';
        node.metadata.reasoningStartTime = Date.now();
        logger.info('🕐 推理开始时间已记录', {
          nodeId,
          startTime: node.metadata.reasoningStartTime,
        });
      }
      node.metadata.reasoningContent += chunk;
    } else {
      // 正文内容流式更新
      // 如果这是第一次接收正文内容，且之前有推理内容但还没记录结束时间
      if (
        node.content === '' &&
        node.metadata?.reasoningContent &&
        node.metadata?.reasoningStartTime &&
        !node.metadata?.reasoningEndTime
      ) {
        node.metadata.reasoningEndTime = Date.now();
        logger.info('🕐 推理结束时间已记录（正文开始）', {
          nodeId,
          startTime: node.metadata.reasoningStartTime,
          endTime: node.metadata.reasoningEndTime,
          duration: node.metadata.reasoningEndTime - node.metadata.reasoningStartTime,
        });
      }
      node.content += chunk;
    }
  };

  /**
   * 完成节点生成（更新最终状态和元数据）
   */
  const finalizeNode = (
    session: ChatSession,
    nodeId: string,
    response: any,
    agentId: string
  ): void => {
    const finalNode = session.nodes[nodeId];
    if (!finalNode) return;

    finalNode.content = response.content;
    finalNode.status = 'complete';

    // 保留流式更新时设置的推理内容和时间戳
    const existingReasoningContent = finalNode.metadata?.reasoningContent;
    const existingReasoningStartTime = finalNode.metadata?.reasoningStartTime;
    const existingReasoningEndTime = finalNode.metadata?.reasoningEndTime;

    logger.info('📊 更新最终元数据前', {
      nodeId,
      hasExistingReasoning: !!existingReasoningContent,
      existingStartTime: existingReasoningStartTime,
      existingEndTime: existingReasoningEndTime,
      responseReasoningContent: response.reasoningContent,
    });

    finalNode.metadata = {
      ...finalNode.metadata,
      usage: response.usage,
      reasoningContent: response.reasoningContent || existingReasoningContent,
    };

    // 如果有推理内容和开始时间，恢复时间戳
    if (finalNode.metadata.reasoningContent && existingReasoningStartTime) {
      finalNode.metadata.reasoningStartTime = existingReasoningStartTime;
      if (existingReasoningEndTime) {
        finalNode.metadata.reasoningEndTime = existingReasoningEndTime;
      } else {
        finalNode.metadata.reasoningEndTime = Date.now();
      }
      logger.info('🕐 推理时间戳已保存', {
        nodeId,
        startTime: finalNode.metadata.reasoningStartTime,
        endTime: finalNode.metadata.reasoningEndTime,
        duration: finalNode.metadata.reasoningEndTime - finalNode.metadata.reasoningStartTime,
      });
    }

    // 更新会话中的智能体使用统计
    if (!session.agentUsage) {
      session.agentUsage = {};
    }
    const currentCount = session.agentUsage[agentId] || 0;
    session.agentUsage[agentId] = currentCount + 1;
  };

  /**
   * 处理节点生成错误
   */
  const handleNodeError = (
    session: ChatSession,
    nodeId: string,
    error: unknown,
    context: string
  ): void => {
    const errorNode = session.nodes[nodeId];
    if (!errorNode) return;

    if (error instanceof Error && error.name === 'AbortError') {
      errorNode.status = 'error';
      errorNode.metadata = {
        ...errorNode.metadata,
        error: '已取消',
      };
      logger.info(`${context}已取消`, { nodeId });
    } else {
      errorNode.status = 'error';
      errorNode.metadata = {
        ...errorNode.metadata,
        error: error instanceof Error ? error.message : String(error),
      };
      logger.error(`${context}失败`, error as Error, { nodeId });
    }
  };

  /**
   * 发送消息
   */
  const sendMessage = async (
    session: ChatSession,
    content: string,
    activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>
  ): Promise<void> => {
    const agentStore = useAgentStore();

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      logger.error('发送消息失败：没有选中智能体', new Error('No agent selected'));
      throw new Error('请先选择一个智能体');
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      logger.error('发送消息失败：无法获取智能体配置', new Error('Agent config not found'));
      throw new Error('无法获取智能体配置');
    }

    // 使用节点管理器创建消息对
    const nodeManager = useNodeManager();
    const { assistantNode } = nodeManager.createMessagePair(session, content, session.activeLeafId);

    // 获取模型信息用于元数据
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);

    // 获取当前智能体信息
    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId);

    // 在生成开始时就设置基本的 metadata（包括 Agent 名称和图标的快照）
    assistantNode.metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
    };

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 创建节点级别的 AbortController
    const abortController = new AbortController();
    abortControllers.set(assistantNode.id, abortController);
    generatingNodes.add(assistantNode.id);

    try {
      const { sendRequest } = useLlmRequest();

      // 构建 LLM 上下文
      const { systemPrompt, conversationHistory, currentMessage } = buildLlmContext(
        activePath,
        agentConfig,
        content
      );

      logger.info('发送 LLM 请求', {
        sessionId: session.id,
        agentId: agentStore.currentAgentId,
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        historyMessageCount: conversationHistory.length,
        currentMessageLength: content.length,
      });

      // 发送请求（支持流式）
      const response = await sendRequest({
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        messages: currentMessage,
        conversationHistory,
        systemPrompt,
        temperature: agentConfig.parameters.temperature,
        maxTokens: agentConfig.parameters.maxTokens,
        topP: agentConfig.parameters.topP,
        topK: agentConfig.parameters.topK,
        frequencyPenalty: agentConfig.parameters.frequencyPenalty,
        presencePenalty: agentConfig.parameters.presencePenalty,
        stream: true,
        signal: abortController.signal,
        onStream: (chunk: string) => {
          handleStreamUpdate(session, assistantNode.id, chunk, false);
        },
        onReasoningStream: (chunk: string) => {
          handleStreamUpdate(session, assistantNode.id, chunk, true);
        },
      });

      // 完成节点生成
      finalizeNode(session, assistantNode.id, response, agentStore.currentAgentId);

      logger.info('消息发送成功', {
        sessionId: session.id,
        messageLength: response.content.length,
        usage: response.usage,
      });
    } catch (error) {
      handleNodeError(session, assistantNode.id, error, '消息发送');
      throw error;
    } finally {
      // 清理节点级别的状态
      abortControllers.delete(assistantNode.id);
      generatingNodes.delete(assistantNode.id);
    }
  };

  /**
   * 从指定节点重新生成
   */
  const regenerateFromNode = async (
    session: ChatSession,
    nodeId: string,
    activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>
  ): Promise<void> => {
    // 定位目标节点（要重新生成的助手消息）
    const targetNode = session.nodes[nodeId];
    if (!targetNode) {
      logger.warn('重新生成失败：目标节点不存在', { sessionId: session.id, nodeId });
      return;
    }

    if (!targetNode.parentId) {
      logger.warn('重新生成失败：目标节点没有父节点', { sessionId: session.id, nodeId });
      return;
    }

    const agentStore = useAgentStore();

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      logger.error('重新生成失败：没有选中智能体', new Error('No agent selected'));
      return;
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      logger.error('重新生成失败：无法获取智能体配置', new Error('Agent config not found'));
      return;
    }

    // 使用节点管理器创建重新生成分支
    const nodeManager = useNodeManager();
    const assistantNode = nodeManager.createRegenerateBranch(session, nodeId, targetNode.parentId);

    if (!assistantNode) {
      return;
    }

    // 获取父节点（用户的提问）
    const parentNode = session.nodes[targetNode.parentId];
    if (!parentNode) {
      logger.error('重新生成失败：父节点不存在', new Error('Parent node not found'));
      return;
    }

    // 获取模型信息用于元数据
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);

    // 获取当前智能体信息
    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId);

    // 在生成开始时就设置基本的 metadata（包括 Agent 名称和图标的快照）
    assistantNode.metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
    };

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 创建节点级别的 AbortController
    const abortController = new AbortController();
    abortControllers.set(assistantNode.id, abortController);
    generatingNodes.add(assistantNode.id);

    try {
      const { sendRequest } = useLlmRequest();

      // 构建 LLM 上下文
      const { systemPrompt, conversationHistory, currentMessage } = buildLlmContext(
        activePath,
        agentConfig,
        parentNode.content
      );

      logger.info('从节点重新生成', {
        sessionId: session.id,
        targetNodeId: nodeId,
        parentNodeId: parentNode.id,
        newNodeId: assistantNode.id,
        agentId: agentStore.currentAgentId,
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        historyMessageCount: conversationHistory.length,
      });

      const response = await sendRequest({
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        messages: currentMessage,
        conversationHistory,
        systemPrompt,
        temperature: agentConfig.parameters.temperature,
        maxTokens: agentConfig.parameters.maxTokens,
        topP: agentConfig.parameters.topP,
        topK: agentConfig.parameters.topK,
        frequencyPenalty: agentConfig.parameters.frequencyPenalty,
        presencePenalty: agentConfig.parameters.presencePenalty,
        stream: true,
        signal: abortController.signal,
        onStream: (chunk: string) => {
          handleStreamUpdate(session, assistantNode.id, chunk, false);
        },
        onReasoningStream: (chunk: string) => {
          handleStreamUpdate(session, assistantNode.id, chunk, true);
        },
      });

      // 完成节点生成
      finalizeNode(session, assistantNode.id, response, agentStore.currentAgentId);

      logger.info('从节点重新生成成功', {
        sessionId: session.id,
        newNodeId: assistantNode.id,
        messageLength: response.content.length,
        usage: response.usage,
      });
    } catch (error) {
      handleNodeError(session, assistantNode.id, error, '重新生成');
      throw error;
    } finally {
      // 清理节点级别的状态
      abortControllers.delete(assistantNode.id);
      generatingNodes.delete(assistantNode.id);
    }
  };

  return {
    sendMessage,
    regenerateFromNode,
  };
}