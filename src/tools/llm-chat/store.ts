/**
 * LLM Chat 状态管理（树形历史结构）
 * 重构后的精简版本：专注于状态管理，复杂逻辑委托给 composables
 */

import { defineStore } from "pinia";
import { useSessionManager } from "./composables/useSessionManager";
import { useChatHandler } from "./composables/useChatHandler";
import { useBranchManager } from "./composables/useBranchManager";
import { BranchNavigator } from "./utils/BranchNavigator";
import { useAgentStore } from "./agentStore";
import type { ChatSession, ChatMessageNode, LlmParameters } from "./types";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("llm-chat/store");

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
  /** 是否启用流式输出 */
  isStreaming: boolean;
}

export const useLlmChatStore = defineStore("llmChat", {
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
    isStreaming: true, // 默认开启流式输出
  }),

  getters: {
    /** 当前活动会话 */
    currentSession: (state): ChatSession | null => {
      if (!state.currentSessionId) return null;
      return state.sessions.find((s) => s.id === state.currentSessionId) || null;
    },

    /**
     * 当前活动路径（UI 渲染数据源）
     * 注意：不过滤 isEnabled 状态，返回完整路径
     * 符合设计原则：activeLeafId 决定"看哪条分支"
     * 过滤掉技术性的根节点（session.rootNodeId），因为它仅作为树结构的根使用，不应显示在 UI 中
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
          logger.warn("活动路径中断：节点不存在", { sessionId: session.id, nodeId: currentId });
          break;
        }

        path.unshift(node);
        currentId = node.parentId;
      }

      // 过滤掉技术性的根节点（它是空的系统消息，仅用于构建树结构）
      return path.filter((node) => node.id !== session.rootNodeId);
    },

    /**
     * 带预设消息的活动路径（用于 UI 显示）
     * 根据当前智能体的 displayPresetCount 配置，在实际会话消息前插入预设消息
     */
    currentActivePathWithPresets(): ChatMessageNode[] {
      const session = this.currentSession;
      if (!session) return [];

      // 获取当前智能体配置
      const agentStore = useAgentStore();
      
      if (!agentStore.currentAgentId) {
        return this.currentActivePath;
      }

      const agent = agentStore.getAgentById(agentStore.currentAgentId);
      if (!agent || !agent.presetMessages || !agent.displayPresetCount || agent.displayPresetCount <= 0) {
        return this.currentActivePath;
      }

      // 找到 chat_history 占位符的位置
      const chatHistoryIndex = agent.presetMessages.findIndex(
        (msg: ChatMessageNode) => msg.type === 'chat_history'
      );

      if (chatHistoryIndex === -1) {
        // 没有占位符，不显示预设消息
        return this.currentActivePath;
      }

      // 提取占位符之前的 user/assistant 消息（不包括 system 消息）
      const presetsBeforePlaceholder = agent.presetMessages
        .slice(0, chatHistoryIndex)
        .filter((msg: ChatMessageNode) =>
          (msg.role === 'user' || msg.role === 'assistant') &&
          msg.isEnabled !== false
        );

      // 取最后 N 条预设消息
      const displayPresets = presetsBeforePlaceholder.slice(-agent.displayPresetCount);

      // 给预设消息添加特殊标记和智能体信息，用于 UI 显示
      const markedPresets = displayPresets.map((msg: ChatMessageNode) => ({
        ...msg,
        metadata: {
          ...msg.metadata,
          isPresetDisplay: true, // 标记这是用于显示的预设消息
          agentId: agent.id,
          agentName: agent.name,
          agentIcon: agent.icon,
          profileId: agent.profileId,
          modelId: agent.modelId,
          // modelName 会在 MessageHeader 中从 model 对象获取，这里不需要设置
        },
      }));

      // 合并预设消息和实际会话消息
      return [...markedPresets, ...this.currentActivePath];
    },

    /**
     * LLM 上下文（过滤了 isEnabled === false 的节点）
     * 专门用于构建发送给 LLM 的消息列表
     * 符合设计原则：isEnabled 决定"这条分支上的哪句话要被 AI 忽略"
     */
    llmContext(): Array<{ role: "user" | "assistant"; content: string | LlmMessageContent[] }> {
      return this.currentActivePath
        .filter((node) => node.isEnabled !== false)
        .filter((node) => node.role !== "system")
        .filter((node) => node.role === "user" || node.role === "assistant")
        .map((node) => ({
          role: node.role as "user" | "assistant",
          content: node.content,
        }));
    },

    /**
     * 获取某个节点的兄弟节点（包括自己）
     */
    getSiblings:
      (state) =>
      (nodeId: string): ChatMessageNode[] => {
        const session = state.sessions.find((s) => s.id === state.currentSessionId);
        if (!session) return [];

        const { getSiblings } = useBranchManager();
        return getSiblings(session, nodeId);
      },

    /**
     * 判断节点是否在当前活动路径上
     */
    isNodeInActivePath:
      (state) =>
      (nodeId: string): boolean => {
        const session = state.sessions.find((s) => s.id === state.currentSessionId);
        if (!session) return false;

        const { isNodeInActivePath } = useBranchManager();
        return isNodeInActivePath(session, nodeId);
      },

    /**
     * 判断某个节点是否正在生成
     */
    isNodeGenerating:
      (state) =>
      (nodeId: string): boolean => {
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
    // ==================== 会话管理 ====================

    /**
     * 创建新会话（使用智能体）
     */
    createSession(agentId: string, name?: string): string {
      const sessionManager = useSessionManager();
      const { session, sessionId } = sessionManager.createSession(agentId, name);

      this.sessions.push(session);
      this.currentSessionId = sessionId;
      sessionManager.persistSession(session, this.currentSessionId);

      return sessionId;
    },

    /**
     * 切换当前会话
     */
    switchSession(sessionId: string): void {
      const session = this.sessions.find((s) => s.id === sessionId);
      if (!session) {
        logger.warn("切换会话失败：会话不存在", { sessionId });
        return;
      }

      this.currentSessionId = sessionId;
      
      // 持久化当前会话 ID
      const sessionManager = useSessionManager();
      sessionManager.updateCurrentSessionId(sessionId);
      
      logger.info("切换会话", { sessionId, sessionName: session.name });
    },

    /**
     * 删除会话
     */
    async deleteSession(sessionId: string): Promise<void> {
      const sessionManager = useSessionManager();
      const { updatedSessions, newCurrentSessionId } = await sessionManager.deleteSession(
        this.sessions,
        sessionId,
        this.currentSessionId
      );

      this.sessions = updatedSessions;
      this.currentSessionId = newCurrentSessionId;

      // 同步索引（文件删除在 SessionManager 中已处理）
      this.persistSessions();
    },

    /**
     * 更新会话信息
     */
    updateSession(sessionId: string, updates: Partial<ChatSession>): void {
      const session = this.sessions.find((s) => s.id === sessionId);
      if (!session) {
        logger.warn("更新会话失败：会话不存在", { sessionId });
        return;
      }

      const sessionManager = useSessionManager();
      sessionManager.updateSession(session, updates);
      sessionManager.persistSession(session, this.currentSessionId);
    },

    /**
     * 从文件加载会话
     */
    async loadSessions(): Promise<void> {
      const sessionManager = useSessionManager();
      const { sessions, currentSessionId } = await sessionManager.loadSessions();

      this.sessions = sessions;
      this.currentSessionId = currentSessionId;
    },

    /**
     * 持久化会话到文件
     */
    persistSessions(): void {
      const sessionManager = useSessionManager();
      sessionManager.persistSessions(this.sessions, this.currentSessionId);
    },

    /**
     * 导出当前会话为 Markdown
     */
    exportSessionAsMarkdown(sessionId?: string): string {
      const session = sessionId
        ? this.sessions.find((s) => s.id === sessionId)
        : this.currentSession;

      const sessionManager = useSessionManager();
      return sessionManager.exportSessionAsMarkdown(session || null, this.currentActivePath);
    },

    /**
     * 清空所有会话
     */
    clearAllSessions(): void {
      this.sessions = [];
      this.currentSessionId = null;
      this.persistSessions();

      const sessionManager = useSessionManager();
      sessionManager.clearAllSessions();
      logger.info("清空所有会话");
    },

    // ==================== 核心聊天逻辑 ====================

    /**
     * 发送消息
     */
    async sendMessage(content: string, attachments?: Asset[]): Promise<void> {
      const session = this.currentSession;
      if (!session) {
        logger.error("发送消息失败：没有活动会话", new Error("No active session"));
        throw new Error("请先创建或选择一个会话");
      }

      if (this.isSending) {
        logger.warn("发送消息失败：正在发送中", { sessionId: session.id });
        return;
      }

      this.isSending = true;

      try {
        const chatHandler = useChatHandler();
        await chatHandler.sendMessage(
          session,
          content,
          this.currentActivePath,
          this.abortControllers,
          this.generatingNodes,
          attachments
        );

        // 更新会话显示的智能体
        const sessionManager = useSessionManager();
        sessionManager.updateSessionDisplayAgent(session);

        sessionManager.persistSession(session, this.currentSessionId);
      } catch (error) {
        const sessionManager = useSessionManager();
        sessionManager.persistSession(session, this.currentSessionId);
        throw error;
      } finally {
        // 如果没有其他节点在生成，则解除全局锁
        if (this.generatingNodes.size === 0) {
          this.isSending = false;
        }
      }
    },

    /**
     * 从指定节点重新生成
     */
    async regenerateFromNode(nodeId: string): Promise<void> {
      const session = this.currentSession;
      if (!session) {
        logger.warn("重新生成失败：没有活动会话");
        return;
      }

      try {
        const chatHandler = useChatHandler();
        await chatHandler.regenerateFromNode(
          session,
          nodeId,
          this.currentActivePath,
          this.abortControllers,
          this.generatingNodes
        );

        // 更新会话显示的智能体
        const sessionManager = useSessionManager();
        sessionManager.updateSessionDisplayAgent(session);

        sessionManager.persistSession(session, this.currentSessionId);
      } catch (error) {
        const sessionManager = useSessionManager();
        sessionManager.persistSession(session, this.currentSessionId);
        throw error;
      } finally {
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
        logger.warn("重新生成失败：没有活动会话");
        return;
      }

      const branchManager = useBranchManager();
      const result = branchManager.prepareRegenerateLastMessage(session);

      if (!result.shouldRegenerate || !result.userContent || !result.newActiveLeafId) {
        return;
      }

      // 将活跃叶节点回退到用户消息
      session.activeLeafId = result.newActiveLeafId;

      // 更新路径上所有父节点的选择记忆
      BranchNavigator.updateSelectionMemory(session, result.newActiveLeafId);

      // 重新发送用户消息（会创建新的助手节点作为兄弟分支）
      await this.sendMessage(result.userContent);
    },

    /**
     * 中止当前发送（中止所有正在生成的节点）
     */
    abortSending(): void {
      if (this.abortControllers.size > 0) {
        this.abortControllers.forEach((controller, nodeId) => {
          controller.abort();
          logger.info("已中止节点生成", { nodeId });
        });
        this.abortControllers.clear();
        this.generatingNodes.clear();
        logger.info("已中止所有消息发送");
      }
    },

    /**
     * 中止指定节点的生成
     */
    abortNodeGeneration(nodeId: string): void {
      const controller = this.abortControllers.get(nodeId);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(nodeId);
        this.generatingNodes.delete(nodeId);
        logger.info("已中止节点生成", { nodeId });
      }
    },

    // ==================== 分支操作 ====================

    /**
     * 删除消息节点（软删除：通过 isEnabled 标记）
     */
    deleteMessage(nodeId: string): void {
      const session = this.currentSession;
      if (!session) return;

      const branchManager = useBranchManager();
      const success = branchManager.deleteMessage(session, nodeId);

      if (success) {
        const sessionManager = useSessionManager();
        sessionManager.updateSessionDisplayAgent(session);
        sessionManager.persistSession(session, this.currentSessionId);
      }
    },

    /**
     * 切换到指定分支（将某个节点设为活跃叶节点）
     */
    switchBranch(nodeId: string): void {
      const session = this.currentSession;
      if (!session) return;

      const branchManager = useBranchManager();
      const success = branchManager.switchBranch(session, nodeId);
      if (success) {
        const sessionManager = useSessionManager();
        sessionManager.updateSessionDisplayAgent(session);
        sessionManager.persistSession(session, this.currentSessionId);
      }
    },

    /**
     * 切换到兄弟分支
     */
    switchToSiblingBranch(nodeId: string, direction: "prev" | "next"): void {
      const session = this.currentSession;
      if (!session) {
        logger.warn("切换兄弟分支失败：没有活动会话");
        return;
      }

      const branchManager = useBranchManager();
      const newLeafId = branchManager.switchToSiblingBranch(session, nodeId, direction);

      if (newLeafId !== session.activeLeafId) {
        const sessionManager = useSessionManager();
        sessionManager.updateSessionDisplayAgent(session);
        sessionManager.persistSession(session, this.currentSessionId);
      }
    },

    /**
     /**
      * 编辑消息（原地修改内容和附件）
      */
     editMessage(nodeId: string, newContent: string, attachments?: Asset[]): void {
       const session = this.currentSession;
       if (!session) {
         logger.warn("编辑消息失败：没有活动会话");
         return;
       }
 
       const branchManager = useBranchManager();
       const success = branchManager.editMessage(session, nodeId, newContent, attachments);
 
       if (success) {
         const sessionManager = useSessionManager();
         sessionManager.persistSession(session, this.currentSessionId);
       }
     },
    /**
     * 创建分支（创建源节点的兄弟节点，复制内容）
     */
    createBranch(sourceNodeId: string): void {
      const session = this.currentSession;
      if (!session) {
        logger.warn("创建分支失败：没有活动会话");
        return;
      }

      const branchManager = useBranchManager();
      const newNodeId = branchManager.createBranch(session, sourceNodeId);

      if (newNodeId) {
        const sessionManager = useSessionManager();
        sessionManager.updateSessionDisplayAgent(session);
        sessionManager.persistSession(session, this.currentSessionId);
      }
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
        logger.warn("切换节点状态失败：没有活动会话");
        return;
      }

      const branchManager = useBranchManager();
      const success = branchManager.toggleNodeEnabled(session, nodeId);

      if (success) {
        const sessionManager = useSessionManager();
        sessionManager.persistSession(session, this.currentSessionId);
      }
    },

    // ==================== 参数管理 ====================

    /**
     * 更新参数配置
     */
    updateParameters(parameters: Partial<LlmParameters>): void {
      Object.assign(this.parameters, parameters);
      logger.info("更新参数配置", { parameters });
    },
  },
});
