/**
 * LLM Chat 状态管理（树形历史结构）
 */

import { defineStore } from 'pinia';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { useAgentStore } from './agentStore';
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
  /** 是否正在发送消息 */
  isSending: boolean;
  /** 用于中止请求的控制器 */
  abortController: AbortController | null;
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
    abortController: null,
  }),

  getters: {
    /** 当前活动会话 */
    currentSession: (state): ChatSession | null => {
      if (!state.currentSessionId) return null;
      return state.sessions.find(s => s.id === state.currentSessionId) || null;
    },

    /**
     * 当前会话的消息链（从根节点到当前激活叶节点的路径）
     * 返回一个线性的、有序的消息节点数组，供 UI 组件渲染
     */
    currentMessageChain(): ChatMessageNode[] {
      const session = this.currentSession;
      if (!session) return [];

      const chain: ChatMessageNode[] = [];
      let currentId: string | null = session.activeLeafId;

      // 从活跃叶节点向上遍历到根节点
      while (currentId !== null) {
        const node: ChatMessageNode | undefined = session.nodes[currentId];
        if (!node) {
          logger.warn('消息链中断：节点不存在', { sessionId: session.id, nodeId: currentId });
          break;
        }
        
        // 只添加启用的节点
        if (node.isEnabled !== false) {
          chain.unshift(node);
        }
        
        currentId = node.parentId;
      }

      return chain;
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

      // 生成会话名称（使用模型ID作为默认名称）
      let sessionName = name;
      if (!sessionName) {
        // 如果没有提供名称，使用模型ID作为默认名称
        sessionName = `${agent.modelId} 对话`;
      }

      const session: ChatSession = {
        id: sessionId,
        name: sessionName,
        currentAgentId: agentId,
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

      if (!session.currentAgentId) {
        logger.error('发送消息失败：会话没有关联智能体', new Error('No agent'));
        throw new Error('会话没有关联智能体');
      }

      const agentStore = useAgentStore();
      const agentConfig = agentStore.getAgentConfig(session.currentAgentId, {
        parameterOverrides: session.parameterOverrides,
        systemPromptOverride: session.systemPromptOverride,
      });

      if (!agentConfig) {
        logger.error('发送消息失败：无法获取智能体配置', new Error('Agent config not found'));
        throw new Error('无法获取智能体配置');
      }

      this.isSending = true;
      this.abortController = new AbortController();

      const now = new Date().toISOString();

      // 创建用户消息节点
      const userNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const userNode: ChatMessageNode = {
        id: userNodeId,
        parentId: session.activeLeafId,
        childrenIds: [],
        content,
        role: 'user',
        status: 'complete',
        isEnabled: true,
        timestamp: now,
      };

      // 创建助手消息节点（初始为空，等待流式输出）
      const assistantNodeId = `node-${Date.now() + 1}-${Math.random().toString(36).substr(2, 9)}`;
      const assistantNode: ChatMessageNode = {
        id: assistantNodeId,
        parentId: userNodeId,
        childrenIds: [],
        content: '',
        role: 'assistant',
        status: 'generating',
        isEnabled: true,
        timestamp: now,
      };

      // 更新父节点的 childrenIds
      const currentLeafNode = session.nodes[session.activeLeafId];
      if (currentLeafNode) {
        currentLeafNode.childrenIds.push(userNodeId);
      }

      // 更新用户节点的 childrenIds
      userNode.childrenIds.push(assistantNodeId);

      // 添加节点到会话
      session.nodes[userNodeId] = userNode;
      session.nodes[assistantNodeId] = assistantNode;

      // 更新活跃叶节点
      session.activeLeafId = assistantNodeId;
      session.updatedAt = now;

      try {
        const { sendRequest } = useLlmRequest();

        // 构建消息列表（从当前消息链构建，排除正在生成的助手消息）
        const messageChain = this.currentMessageChain.filter(
          node => node.id !== assistantNodeId
        );

        const messages: LlmMessageContent[] = messageChain
          .filter(node => node.role !== 'system') // 排除系统根节点
          .map(node => ({
            type: 'text' as const,
            text: node.content,
          }));

        logger.info('发送 LLM 请求', {
          sessionId: session.id,
          agentId: session.currentAgentId,
          profileId: agentConfig.profileId,
          modelId: agentConfig.modelId,
          messageCount: messages.length,
        });

        // 发送请求（支持流式）
        const response = await sendRequest({
          profileId: agentConfig.profileId,
          modelId: agentConfig.modelId,
          messages,
          systemPrompt: agentConfig.systemPrompt,
          temperature: agentConfig.parameters.temperature,
          maxTokens: agentConfig.parameters.maxTokens,
          stream: true,
          signal: this.abortController.signal,
          onStream: (chunk: string) => {
            // 流式更新助手消息
            assistantNode.content += chunk;
          },
        });

        // 获取智能体信息用于元数据
        const agent = agentStore.getAgentById(session.currentAgentId);

        // 更新最终内容和元数据
        assistantNode.content = response.content;
        assistantNode.status = 'complete';
        assistantNode.metadata = {
          profileId: agentConfig.profileId,
          modelId: agentConfig.modelId,
          modelName: agent?.name,
          usage: response.usage,
        };

        this.persistSessions();
        logger.info('消息发送成功', {
          sessionId: session.id,
          messageLength: response.content.length,
          usage: response.usage,
        });
      } catch (error) {
        // 如果是中止错误，标记为取消
        if (error instanceof Error && error.name === 'AbortError') {
          assistantNode.status = 'error';
          assistantNode.metadata = {
            error: '已取消',
          };
          logger.info('消息发送已取消', { sessionId: session.id });
        } else {
          // 其他错误
          assistantNode.status = 'error';
          assistantNode.metadata = {
            error: error instanceof Error ? error.message : String(error),
          };
          logger.error('消息发送失败', error as Error, {
            sessionId: session.id,
            agentId: session.currentAgentId,
          });
        }
        this.persistSessions();
      } finally {
        this.isSending = false;
        this.abortController = null;
      }
    },

    /**
     * 中止当前发送
     */
    abortSending(): void {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
        logger.info('已中止消息发送');
      }
    },

    /**
     * 重新生成最后一条助手消息
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

        // 禁用当前助手节点（而不是删除，保留历史）
        currentLeaf.isEnabled = false;

        // 将活跃叶节点回退到用户消息
        session.activeLeafId = parentNode.id;

        // 重新发送用户消息
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

      const node = session.nodes[nodeId];
      if (!node) {
        logger.warn('删除消息失败：节点不存在', { sessionId: session.id, nodeId });
        return;
      }

      // 软删除：将节点标记为禁用
      node.isEnabled = false;
      session.updatedAt = new Date().toISOString();
      this.persistSessions();
      logger.info('删除消息（软删除）', { sessionId: session.id, nodeId });
    },

    /**
     * 切换到指定分支（将某个节点设为活跃叶节点）
     */
    switchBranch(nodeId: string): void {
      const session = this.currentSession;
      if (!session) return;

      const node = session.nodes[nodeId];
      if (!node) {
        logger.warn('切换分支失败：节点不存在', { sessionId: session.id, nodeId });
        return;
      }

      session.activeLeafId = nodeId;
      session.updatedAt = new Date().toISOString();
      this.persistSessions();
      logger.info('切换分支', { sessionId: session.id, newLeafId: nodeId });
    },

    /**
     * 更新参数配置
     */
    updateParameters(parameters: Partial<LlmParameters>): void {
      Object.assign(this.parameters, parameters);
      logger.info('更新参数配置', { parameters });
    },

    /**
     * 持久化会话到 localStorage
     */
    persistSessions(): void {
      try {
        localStorage.setItem('llm-chat-sessions', JSON.stringify(this.sessions));
        localStorage.setItem('llm-chat-current-session-id', this.currentSessionId || '');
      } catch (error) {
        logger.error('持久化会话失败', error as Error, {
          sessionCount: this.sessions.length,
        });
      }
    },

    /**
     * 从 localStorage 加载会话
     */
    loadSessions(): void {
      try {
        const stored = localStorage.getItem('llm-chat-sessions');
        if (stored) {
          const parsedSessions = JSON.parse(stored) as ChatSession[];
          
          // 验证数据格式：检查是否是新的树形结构
          const isValidFormat = parsedSessions.every(
            session =>
              session.nodes !== undefined &&
              session.rootNodeId !== undefined &&
              session.activeLeafId !== undefined
          );

          if (isValidFormat) {
            this.sessions = parsedSessions;
            logger.info('加载会话成功', { sessionCount: this.sessions.length });
          } else {
            // 旧格式数据，清空并提示
            logger.warn('检测到旧格式的会话数据，已清空', {
              oldSessionCount: parsedSessions.length
            });
            this.sessions = [];
            this.currentSessionId = null;
            this.persistSessions(); // 清空 localStorage
            return;
          }
        }

        const currentId = localStorage.getItem('llm-chat-current-session-id');
        if (currentId && this.sessions.find(s => s.id === currentId)) {
          this.currentSessionId = currentId;
        }
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

      // 使用当前消息链（已启用的节点）
      const messageChain = this.currentMessageChain;

      messageChain.forEach(node => {
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