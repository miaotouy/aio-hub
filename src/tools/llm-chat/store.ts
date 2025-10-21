/**
 * LLM Chat 状态管理（树形历史结构）
 */

import { defineStore } from 'pinia';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useAgentStore } from './agentStore';
import { useNodeManager } from './composables/useNodeManager';
import { BranchNavigator } from './utils/BranchNavigator';
import { useChatStorage } from './composables/useChatStorage';
import type { ChatSession, ChatMessageNode, LlmParameters } from './types';
import type { LlmMessageContent } from '@/llm-apis/common';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('llm-chat/store');

interface LlmChatState {
  /** 所有会话列表 */
  sessions: ChatSession[];
  /** 当前活动会话 ID */
  currentSessionId: string | null;
  /** LLM 参数配置 */
  parameters: LlmParameters;
  /** 是否正在发送消息（全局锁，防止用户输入新消息） */
  isSending: boolean;
  /** 用于中止请求的控制器（按节点ID索引，支持并行生成） */
  abortControllers: Map<string, AbortController>;
  /** 正在生成的节点ID集合 */
  generatingNodes: Set<string>;
}

export const useLlmChatStore = defineStore('llmChat', {
  state: (): LlmChatState => ({
    sessions: [],
    currentSessionId: null,
    parameters: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    isSending: false,
    abortControllers: new Map(),
    generatingNodes: new Set(),
  }),

  getters: {
    /** 当前活动会话 */
    currentSession: (state): ChatSession | null => {
      if (!state.currentSessionId) return null;
      return state.sessions.find(s => s.id === state.currentSessionId) || null;
    },

    /**
     * 当前活动路径（UI 渲染数据源）
     * 注意：不过滤 isEnabled 状态，返回完整路径
     * 符合设计原则：activeLeafId 决定"看哪条分支"
     */
    currentActivePath(): ChatMessageNode[] {
      const session = this.currentSession;
      if (!session) return [];

      const path: ChatMessageNode[] = [];
      let currentId: string | null = session.activeLeafId;

      // 从活跃叶节点向上遍历到根节点
      while (currentId !== null) {
        const node: ChatMessageNode | undefined = session.nodes[currentId];
        if (!node) {
          logger.warn('活动路径中断：节点不存在', { sessionId: session.id, nodeId: currentId });
          break;
        }
        
        // ✅ 不过滤 isEnabled，返回完整路径供 UI 渲染
        path.unshift(node);
        
        currentId = node.parentId;
      }

      return path;
    },

    /**
     * LLM 上下文（过滤了 isEnabled === false 的节点）
     * 专门用于构建发送给 LLM 的消息列表
     * 符合设计原则：isEnabled 决定"这条分支上的哪句话要被 AI 忽略"
     */
    llmContext(): Array<{ role: 'user' | 'assistant'; content: string | LlmMessageContent[] }> {
      return this.currentActivePath
        .filter(node => node.isEnabled !== false)  // 过滤禁用节点
        .filter(node => node.role !== 'system')    // 排除系统根节点
        .filter(node => node.role === 'user' || node.role === 'assistant') // 只保留对话消息
        .map(node => ({
          role: node.role as 'user' | 'assistant',
          content: node.content,
        }));
    },

    /**
     * 获取某个节点的兄弟节点（包括自己）
     */
    getSiblings: (state) => (nodeId: string): ChatMessageNode[] => {
      const session = state.sessions.find(s => s.id === state.currentSessionId);
      if (!session) return [];

      const node = session.nodes[nodeId];
      if (!node || !node.parentId) {
        return node ? [node] : [];
      }

      const parent = session.nodes[node.parentId];
      if (!parent) return [node];

      return parent.childrenIds
        .map(id => session.nodes[id])
        .filter(Boolean);
    },

    /**
     /**
      * 判断节点是否在当前活动路径上
      */
     isNodeInActivePath: (state) => (nodeId: string): boolean => {
       const session = state.sessions.find(s => s.id === state.currentSessionId);
       if (!session) return false;
 
       let currentId: string | null = session.activeLeafId;
       while (currentId !== null) {
         if (currentId === nodeId) return true;
         const node: ChatMessageNode | undefined = session.nodes[currentId];
         if (!node) break;
         currentId = node.parentId;
       }
       return false;
     },
 
     /**
      * 判断某个节点是否正在生成
      */
     isNodeGenerating: (state) => (nodeId: string): boolean => {
       return state.generatingNodes.has(nodeId);
     },
    /**
     * 当前会话的消息数量（所有节点，包括禁用的）
     */
    currentMessageCount(): number {
      const session = this.currentSession;
      if (!session) return 0;
      return Object.keys(session.nodes).length;
    },
  },

  actions: {
    /**
     * 更新会话的 displayAgentId（内部辅助函数）
     * 从当前活动路径中找到最新的助手消息，获取其使用的智能体 ID
     */
    _updateSessionDisplayAgent(session: ChatSession): void {
      let currentId: string | null = session.activeLeafId;
      let foundAgentId: string | null = null;

      // 从活跃叶节点向上遍历，找到第一个助手消息
      while (currentId !== null) {
        const node: ChatMessageNode = session.nodes[currentId];
        if (!node) break;

        // 找到第一个助手角色的消息
        if (node.role === 'assistant' && node.metadata?.agentId) {
          foundAgentId = node.metadata.agentId;
          break;
        }

        currentId = node.parentId;
      }

      // 更新会话的 displayAgentId
      session.displayAgentId = foundAgentId;
    },

    /**
     * 创建新会话（使用智能体）
     */
    createSession(agentId: string, name?: string): string {
      const agentStore = useAgentStore();
      const agent = agentStore.getAgentById(agentId);
      
      if (!agent) {
        logger.error('创建会话失败：智能体不存在', new Error('Agent not found'), { agentId });
        throw new Error(`未找到智能体: ${agentId}`);
      }

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const rootNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      // 创建根节点（系统节点，不显示内容）
      const rootNode: ChatMessageNode = {
        id: rootNodeId,
        parentId: null,
        childrenIds: [],
        content: '',
        role: 'system',
        status: 'complete',
        isEnabled: true,
        timestamp: now,
      };

      // 生成会话名称（使用日期时间作为默认名称）
      let sessionName = name;
      if (!sessionName) {
        // 格式化当前时间为 "会话 YYYY-MM-DD HH:mm:ss"
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        sessionName = `会话 ${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }

      const session: ChatSession = {
        id: sessionId,
        name: sessionName,
        nodes: {
          [rootNodeId]: rootNode,
        },
        rootNodeId,
        activeLeafId: rootNodeId,
        createdAt: now,
        updatedAt: now,
      };

      this.sessions.push(session);
      this.currentSessionId = sessionId;
      this.persistSessions();

      // 更新智能体的最后使用时间
      agentStore.updateLastUsed(agentId);

      logger.info('创建新会话', {
        sessionId,
        agentId,
        agentName: agent.name,
        modelId: agent.modelId,
        sessionName: session.name,
      });

      return sessionId;
    },

    /**
     * 切换当前会话
     */
    switchSession(sessionId: string): void {
      const session = this.sessions.find(s => s.id === sessionId);
      if (!session) {
        logger.warn('切换会话失败：会话不存在', { sessionId });
        return;
      }

      this.currentSessionId = sessionId;
      logger.info('切换会话', { sessionId, sessionName: session.name });
    },

    /**
     * 删除会话
     */
    deleteSession(sessionId: string): void {
      const index = this.sessions.findIndex(s => s.id === sessionId);
      if (index === -1) {
        logger.warn('删除会话失败：会话不存在', { sessionId });
        return;
      }

      const session = this.sessions[index];
      this.sessions.splice(index, 1);

      // 如果删除的是当前会话，切换到第一个会话或清空
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = this.sessions[0]?.id || null;
      }

      this.persistSessions();
      logger.info('删除会话', { sessionId, sessionName: session.name });
    },

    /**
     * 更新会话信息
     */
    updateSession(sessionId: string, updates: Partial<ChatSession>): void {
      const session = this.sessions.find(s => s.id === sessionId);
      if (!session) {
        logger.warn('更新会话失败：会话不存在', { sessionId });
        return;
      }

      Object.assign(session, updates, { updatedAt: new Date().toISOString() });
      this.persistSessions();
      logger.info('更新会话', { sessionId, updates });
    },

    /**
     * 发送消息
     */
    async sendMessage(content: string): Promise<void> {
      const session = this.currentSession;
      if (!session) {
        logger.error('发送消息失败：没有活动会话', new Error('No active session'));
        throw new Error('请先创建或选择一个会话');
      }

      if (this.isSending) {
        logger.warn('发送消息失败：正在发送中', { sessionId: session.id });
        return;
      }

      const agentStore = useAgentStore();
      
      // 使用当前选中的智能体（独立于会话）
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

      this.isSending = true;

      // 使用节点管理器创建消息对
      const nodeManager = useNodeManager();
      const { assistantNode } = nodeManager.createMessagePair(
        session,
        content,
        session.activeLeafId
      );

      // 获取模型信息用于元数据（在生成前就设置基本信息）
      const { getProfileById } = useLlmProfiles();
      const profile = getProfileById(agentConfig.profileId);
      const model = profile?.models.find(m => m.id === agentConfig.modelId);

      // 在生成开始时就设置基本的 metadata，以便 UI 可以显示模型信息
      assistantNode.metadata = {
        agentId: agentStore.currentAgentId,
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        modelName: model?.name || model?.id,
      };

      // 更新活跃叶节点
      nodeManager.updateActiveLeaf(session, assistantNode.id);

      // 创建节点级别的 AbortController
      const abortController = new AbortController();
      this.abortControllers.set(assistantNode.id, abortController);
      this.generatingNodes.add(assistantNode.id);

      try {
        const { sendRequest } = useLlmRequest();

        // 使用新的 llmContext 构建上下文（已自动过滤禁用节点）
        const context = this.llmContext;
        
        // TODO: 临时兼容逻辑 - 将来应迁移到统一的"消息预处理"阶段
        // 当前实现：从预设消息中提取 system 消息合并为 systemPrompt，其他消息放入 conversationHistory
        // 迁移计划：开发消息预处理功能，支持用户自定义配置消息转换规则（如：合并 system、处理不支持中途 system 角色的模型等）
        const presetMessages = agentConfig.presetMessages || [];
        const enabledPresets = presetMessages.filter(msg => msg.isEnabled !== false);
        
        // 提取 system 消息并合并为 systemPrompt
        const systemMessages = enabledPresets
          .filter(msg => msg.role === 'system')
          .map(msg => msg.content);
        const systemPrompt = systemMessages.length > 0
          ? systemMessages.join('\n\n')
          : undefined;
        
        // 提取对话消息（user 和 assistant）
        const presetConversation: Array<{
          role: 'user' | 'assistant';
          content: string | LlmMessageContent[];
        }> = enabledPresets
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
        
        // 将会话上下文转换为对话历史格式（排除最后一条，因为那是当前要发送的用户消息）
        const sessionContext = context.slice(0, -1);
        
        // 合并预设对话和会话上下文
        const conversationHistory = [...presetConversation, ...sessionContext];
        
        // 当前请求（最后一条用户消息）
        const currentMessage: LlmMessageContent[] = [{
          type: 'text' as const,
          text: content,
        }];

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
            // 流式更新助手消息 - 通过 session 对象确保响应式更新
            const node = session.nodes[assistantNode.id];
            if (node) {
              node.content += chunk;
            }
          },
        });

        // 更新最终内容和元数据（合并已有的 metadata）
        // 通过 session.nodes 访问确保响应式更新
        const finalNode = session.nodes[assistantNode.id];
        if (finalNode) {
          finalNode.content = response.content;
          finalNode.status = 'complete';
          finalNode.metadata = {
            ...finalNode.metadata, // 保留生成前设置的基本信息
            usage: response.usage,
            reasoningContent: response.reasoningContent,
          };
        }

        // 更新会话中的智能体使用统计
        if (!session.agentUsage) {
          session.agentUsage = {};
        }
        const currentCount = session.agentUsage[agentStore.currentAgentId] || 0;
        session.agentUsage[agentStore.currentAgentId] = currentCount + 1;

        // 更新 displayAgentId
        this._updateSessionDisplayAgent(session);

        this.persistSessions();
        logger.info('消息发送成功', {
          sessionId: session.id,
          messageLength: response.content.length,
          usage: response.usage,
        });
      } catch (error) {
        // 通过 session.nodes 访问确保响应式更新
        const errorNode = session.nodes[assistantNode.id];
        if (errorNode) {
          // 如果是中止错误，标记为取消
          if (error instanceof Error && error.name === 'AbortError') {
            errorNode.status = 'error';
            errorNode.metadata = {
              ...errorNode.metadata, // 保留生成前设置的基本信息
              error: '已取消',
            };
            logger.info('消息发送已取消', { sessionId: session.id });
          } else {
            // 其他错误
            errorNode.status = 'error';
            errorNode.metadata = {
              ...errorNode.metadata, // 保留生成前设置的基本信息
              error: error instanceof Error ? error.message : String(error),
            };
            logger.error('消息发送失败', error as Error, {
              sessionId: session.id,
              agentId: agentStore.currentAgentId,
            });
          }
        }
        this.persistSessions();
      } finally {
        // 清理节点级别的状态
        this.abortControllers.delete(assistantNode.id);
        this.generatingNodes.delete(assistantNode.id);

        // 如果没有其他节点在生成，则解除全局锁
        if (this.generatingNodes.size === 0) {
          this.isSending = false;
        }
      }
    },

    /**
     * 中止当前发送（中止所有正在生成的节点）
     */
    abortSending(): void {
      if (this.abortControllers.size > 0) {
        this.abortControllers.forEach((controller, nodeId) => {
          controller.abort();
          logger.info('已中止节点生成', { nodeId });
        });
        this.abortControllers.clear();
        this.generatingNodes.clear();
        logger.info('已中止所有消息发送');
      }
    },

    /**
     /**
      * 中止指定节点的生成
      */
     abortNodeGeneration(nodeId: string): void {
       const controller = this.abortControllers.get(nodeId);
       if (controller) {
         controller.abort();
         this.abortControllers.delete(nodeId);
         this.generatingNodes.delete(nodeId);
         logger.info('已中止节点生成', { nodeId });
       }
     },
    /**
     * 从指定节点重新生成（创建新分支）
     * 这是实现树形对话历史的核心功能
     */
    async regenerateFromNode(nodeId: string): Promise<void> {
      const session = this.currentSession;
      if (!session) {
        logger.warn('重新生成失败：没有活动会话');
        return;
      }

      // 移除全局发送锁检查，允许并行生成多个分支
      // if (this.isSending) {
      //   logger.warn('重新生成失败：正在发送中', { sessionId: session.id });
      //   return;
      // }

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
      const assistantNode = nodeManager.createRegenerateBranch(
        session,
        nodeId,
        targetNode.parentId
      );

      if (!assistantNode) {
        // 创建分支失败（已记录日志）
        return;
      }

      // 获取父节点（用户的提问）
      const parentNode = session.nodes[targetNode.parentId];
      if (!parentNode) {
        logger.error('重新生成失败：父节点不存在', new Error('Parent node not found'));
        return;
      }

      // 获取模型信息用于元数据（在生成前就设置基本信息）
      const { getProfileById } = useLlmProfiles();
      const profile = getProfileById(agentConfig.profileId);
      const model = profile?.models.find(m => m.id === agentConfig.modelId);

      // 在生成开始时就设置基本的 metadata，以便 UI 可以显示模型信息
      assistantNode.metadata = {
        agentId: agentStore.currentAgentId,
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        modelName: model?.name || model?.id,
      };

      // 更新活跃叶节点
      nodeManager.updateActiveLeaf(session, assistantNode.id);

      // 创建节点级别的 AbortController
      const abortController = new AbortController();
      this.abortControllers.set(assistantNode.id, abortController);
      this.generatingNodes.add(assistantNode.id);

      try {
        const { sendRequest } = useLlmRequest();

        // 使用新的 llmContext 构建上下文（已自动过滤禁用节点）
        const context = this.llmContext;
        
        // TODO: 临时兼容逻辑 - 将来应迁移到统一的"消息预处理"阶段
        // 当前实现：从预设消息中提取 system 消息合并为 systemPrompt，其他消息放入 conversationHistory
        // 迁移计划：开发消息预处理功能，支持用户自定义配置消息转换规则（如：合并 system、处理不支持中途 system 角色的模型等）
        const presetMessages = agentConfig.presetMessages || [];
        const enabledPresets = presetMessages.filter(msg => msg.isEnabled !== false);
        
        // 提取 system 消息并合并为 systemPrompt
        const systemMessages = enabledPresets
          .filter(msg => msg.role === 'system')
          .map(msg => msg.content);
        const systemPrompt = systemMessages.length > 0
          ? systemMessages.join('\n\n')
          : undefined;
        
        // 提取对话消息（user 和 assistant）
        const presetConversation: Array<{
          role: 'user' | 'assistant';
          content: string | LlmMessageContent[];
        }> = enabledPresets
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
        
        // 将会话上下文转换为对话历史格式（排除最后一条，因为那是要重新生成的用户消息）
        const sessionContext = context.slice(0, -1);
        
        // 合并预设对话和会话上下文
        const conversationHistory = [...presetConversation, ...sessionContext];
        
        // 当前请求（父节点的用户消息）
        const currentMessage: LlmMessageContent[] = [{
          type: 'text' as const,
          text: parentNode.content,
        }];

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

        // 默认启用流式输出
        const enableStream = true;

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
          stream: enableStream,
          signal: abortController.signal,
          onStream: enableStream ? (chunk: string) => {
            // 流式更新 - 通过 session 对象确保响应式更新
            const node = session.nodes[assistantNode.id];
            if (node) {
              node.content += chunk;
            }
          } : undefined,
        });

        // 更新最终内容和元数据（合并已有的 metadata）
        // 通过 session.nodes 访问确保响应式更新
        const finalNode = session.nodes[assistantNode.id];
        if (finalNode) {
          finalNode.content = response.content;
          finalNode.status = 'complete';
          finalNode.metadata = {
            ...finalNode.metadata, // 保留生成前设置的基本信息
            usage: response.usage,
            reasoningContent: response.reasoningContent,
          };
        }

        // 更新会话中的智能体使用统计
        if (!session.agentUsage) {
          session.agentUsage = {};
        }
        const currentCount = session.agentUsage[agentStore.currentAgentId] || 0;
        session.agentUsage[agentStore.currentAgentId] = currentCount + 1;

        // 更新 displayAgentId
        this._updateSessionDisplayAgent(session);

        this.persistSessions();
        logger.info('从节点重新生成成功', {
          sessionId: session.id,
          newNodeId: assistantNode.id,
          messageLength: response.content.length,
          usage: response.usage,
        });
      } catch (error) {
        // 通过 session.nodes 访问确保响应式更新
        const errorNode = session.nodes[assistantNode.id];
        if (errorNode) {
          if (error instanceof Error && error.name === 'AbortError') {
            errorNode.status = 'error';
            errorNode.metadata = {
              ...errorNode.metadata, // 保留生成前设置的基本信息
              error: '已取消',
            };
            logger.info('重新生成已取消', { sessionId: session.id });
          } else {
            errorNode.status = 'error';
            errorNode.metadata = {
              ...errorNode.metadata, // 保留生成前设置的基本信息
              error: error instanceof Error ? error.message : String(error),
            };
            logger.error('重新生成失败', error as Error, {
              sessionId: session.id,
              agentId: agentStore.currentAgentId,
            });
          }
        }
        this.persistSessions();
      } finally {
        // 清理节点级别的状态
        this.abortControllers.delete(assistantNode.id);
        this.generatingNodes.delete(assistantNode.id);
        
        // 如果没有其他节点在生成，则解除全局锁
        if (this.generatingNodes.size === 0) {
          this.isSending = false;
        }
      }
    },

    /**
     * 重新生成最后一条助手消息（向后兼容）
     */
    async regenerateLastMessage(): Promise<void> {
      const session = this.currentSession;
      if (!session) {
        logger.warn('重新生成失败：没有活动会话');
        return;
      }

      const currentLeaf = session.nodes[session.activeLeafId];
      if (!currentLeaf) {
        logger.warn('重新生成失败：当前叶节点不存在', { sessionId: session.id });
        return;
      }

      // 如果当前叶节点是助手消息，回退到其父节点（用户消息）
      if (currentLeaf.role === 'assistant') {
        const parentNode = currentLeaf.parentId ? session.nodes[currentLeaf.parentId] : null;
        if (!parentNode || parentNode.role !== 'user') {
          logger.warn('重新生成失败：父节点不是用户消息', { sessionId: session.id });
          return;
        }
  
        // 将活跃叶节点回退到用户消息
        session.activeLeafId = parentNode.id;
  
        // 重新发送用户消息（会创建新的助手节点作为兄弟分支）
        await this.sendMessage(parentNode.content);
      } else {
        logger.warn('重新生成失败：当前叶节点不是助手消息', { 
          sessionId: session.id,
          currentRole: currentLeaf.role 
        });
      }
    },

    /**
     * 删除消息节点（软删除：通过 isEnabled 标记）
     */
    deleteMessage(nodeId: string): void {
      const session = this.currentSession;
      if (!session) return;

      const nodeManager = useNodeManager();
      const success = nodeManager.softDeleteNode(session, nodeId);
      
      if (success) {
        this._updateSessionDisplayAgent(session);
        this.persistSessions();
      }
    },

    /**
     * 切换到指定分支（将某个节点设为活跃叶节点）
     */
    switchBranch(nodeId: string): void {
      const session = this.currentSession;
      if (!session) return;

      const nodeManager = useNodeManager();
      const success = nodeManager.updateActiveLeaf(session, nodeId);
      
      if (success) {
        this._updateSessionDisplayAgent(session);
        this.persistSessions();
      }
    },

    /**
     * 切换到兄弟分支
     */
    switchToSiblingBranch(nodeId: string, direction: 'prev' | 'next'): void {
      const session = this.currentSession;
      if (!session) {
        logger.warn('切换兄弟分支失败：没有活动会话');
        return;
      }

      const newLeafId = BranchNavigator.switchToSibling(session, nodeId, direction);
      
      if (newLeafId !== session.activeLeafId) {
        session.activeLeafId = newLeafId;
        this._updateSessionDisplayAgent(session);
        this.persistSessions();
        
        logger.info('已切换到兄弟分支', {
          sessionId: session.id,
          fromNode: nodeId,
          toLeaf: newLeafId,
          direction,
        });
      }
    },

    /**
     * 编辑消息（非破坏性）- 通用方法
     * 创建新节点并嫁接子树，旧节点保留
     * 支持编辑用户消息和助手消息
     */
    editMessage(nodeId: string, newContent: string): void {
      const session = this.currentSession;
      if (!session) {
        logger.warn('编辑消息失败：没有活动会话');
        return;
      }

      const oldNode = session.nodes[nodeId];
      if (!oldNode) {
        logger.warn('编辑消息失败：节点不存在', { sessionId: session.id, nodeId });
        return;
      }

      // 只允许编辑用户消息和助手消息
      if (oldNode.role !== 'user' && oldNode.role !== 'assistant') {
        logger.warn('编辑消息失败：只能编辑用户或助手消息', {
          sessionId: session.id,
          nodeId,
          role: oldNode.role
        });
        return;
      }

      const nodeManager = useNodeManager();

      // 创建新节点（保持原有角色）
      const newNode = nodeManager.createNode({
        role: oldNode.role,
        content: newContent,
        parentId: oldNode.parentId,
        status: 'complete',
      });

      // 如果是助手消息，复制元数据（token 使用信息、推理内容等）
      if (oldNode.role === 'assistant' && oldNode.metadata) {
        newNode.metadata = { ...oldNode.metadata };
      }

      // 添加到会话
      nodeManager.addNodeToSession(session, newNode);

      // 嫁接子节点到新节点
      nodeManager.transferChildren(session, oldNode.id, newNode.id);

      // 如果旧节点在当前活动路径上，切换到新分支
      if (this.isNodeInActivePath(oldNode.id)) {
        const newLeafId = BranchNavigator.findLeafOfBranch(session, newNode.id);
        session.activeLeafId = newLeafId;
        this._updateSessionDisplayAgent(session);
      }

      this.persistSessions();

      logger.info('消息已编辑', {
        sessionId: session.id,
        role: oldNode.role,
        oldNodeId: oldNode.id,
        newNodeId: newNode.id,
        contentLength: newContent.length,
      });
    },

    /**
     * 编辑用户消息（向后兼容）
     * @deprecated 使用 editMessage 代替
     */
    editUserMessage(nodeId: string, newContent: string): void {
      this.editMessage(nodeId, newContent);
    },

    /**
     * 编辑助手消息（向后兼容）
     * @deprecated 使用 editMessage 代替
     */
    editAssistantMessage(nodeId: string, newContent: string): void {
      this.editMessage(nodeId, newContent);
    },

    /**
     * 切换节点启用状态
     */
    toggleNodeEnabled(nodeId: string): void {
      const session = this.currentSession;
      if (!session) {
        logger.warn('切换节点状态失败：没有活动会话');
        return;
      }

      const node = session.nodes[nodeId];
      if (!node) {
        logger.warn('切换节点状态失败：节点不存在', { sessionId: session.id, nodeId });
        return;
      }

      // 切换启用状态
      const newState = !(node.isEnabled ?? true);
      node.isEnabled = newState;

      this.persistSessions();

      logger.info('节点状态已切换', {
        sessionId: session.id,
        nodeId,
        role: node.role,
        isEnabled: newState,
      });
    },

    /**
     * 更新参数配置
     */
    updateParameters(parameters: Partial<LlmParameters>): void {
      Object.assign(this.parameters, parameters);
      logger.info('更新参数配置', { parameters });
    },

    /**
     * 持久化会话到文件
     */
    persistSessions(): void {
      const { saveSessions } = useChatStorage();
      saveSessions(this.sessions, this.currentSessionId).catch(error => {
        logger.error('持久化会话失败', error as Error, {
          sessionCount: this.sessions.length,
        });
      });
    },

    /**
     /**
      * 从文件加载会话
      */
     async loadSessions(): Promise<void> {
       try {
         const { loadSessions } = useChatStorage();
         const { sessions, currentSessionId } = await loadSessions();
         
         this.sessions = sessions;
         this.currentSessionId = currentSessionId;
         
         logger.info('加载会话成功', { sessionCount: this.sessions.length });
       } catch (error) {
         logger.error('加载会话失败', error as Error);
         this.sessions = [];
         this.currentSessionId = null;
       }
     },
    /**
     * 导出当前会话为 Markdown
     */
    exportSessionAsMarkdown(sessionId?: string): string {
      const session = sessionId 
        ? this.sessions.find(s => s.id === sessionId)
        : this.currentSession;

      if (!session) {
        logger.warn('导出失败：会话不存在', { sessionId });
        return '';
      }

      const lines: string[] = [
        `# ${session.name}`,
        '',
        `创建时间：${new Date(session.createdAt).toLocaleString('zh-CN')}`,
        `更新时间：${new Date(session.updatedAt).toLocaleString('zh-CN')}`,
        '',
        '---',
        '',
      ];

      // 使用当前活动路径（包括禁用节点，以便用户看到完整历史）
      const activePath = this.currentActivePath;

      activePath.forEach((node: ChatMessageNode) => {
        if (node.role === 'system') return; // 跳过系统根节点

        const role = node.role === 'user' ? '👤 用户' : '🤖 助手';
        const time = new Date(node.timestamp).toLocaleTimeString('zh-CN');
        
        lines.push(`## ${role} (${time})`);
        lines.push('');
        lines.push(node.content);
        lines.push('');

        if (node.metadata?.usage) {
          const usage = node.metadata.usage;
          lines.push(`*Token 使用: ${usage.totalTokens} (输入: ${usage.promptTokens}, 输出: ${usage.completionTokens})*`);
          lines.push('');
        }

        if (node.metadata?.error) {
          lines.push(`**错误**: ${node.metadata.error}`);
          lines.push('');
        }
      });

      logger.info('导出会话为 Markdown', { sessionId: session.id });
      return lines.join('\n');
    },

    /**
     * 清空所有会话
     */
    clearAllSessions(): void {
      this.sessions = [];
      this.currentSessionId = null;
      this.persistSessions();
      logger.info('清空所有会话');
    },
  },
});