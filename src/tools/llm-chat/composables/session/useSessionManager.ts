/**
 * 会话管理 Composable
 * 负责会话的生命周期管理和持久化
 */

import type { ChatSessionIndex, ChatSessionDetail, ChatMessageNode } from "../../types";
import { useAgentStore } from "../../stores/agentStore";
import { useChatStorageSeparated as useChatStorage } from "../storage/useChatStorageSeparated";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useExportManager } from "../features/useExportManager";
import { getLocalISOString, formatDateTime } from "@/utils/time";

const logger = createModuleLogger("llm-chat/session-manager");
const errorHandler = createModuleErrorHandler("llm-chat/session-manager");

export function useSessionManager() {
  /**
   * 更新会话的消息数量统计
   */
  const updateMessageCount = (
    sessionId: string,
    nodes: Record<string, ChatMessageNode>,
    sessionIndexMap: Map<string, ChatSessionIndex>,
  ): void => {
    const index = sessionIndexMap.get(sessionId);
    if (index) {
      // 增加 Math.max(0, ...) 保护，防止根节点丢失或其他异常导致负数
      index.messageCount = Math.max(0, Object.keys(nodes).length - 1); // 排除根节点
      logger.debug("更新消息计数", { sessionId, messageCount: index.messageCount });
    }
  };

  /**
   * 更新会话显示的智能体图标
   */
  const updateSessionDisplayAgent = (
    sessionId: string,
    detail: ChatSessionDetail,
    sessionIndexMap: Map<string, ChatSessionIndex>,
  ): void => {
    const index = sessionIndexMap.get(sessionId);
    if (!index || !detail.nodes || !detail.activeLeafId) return;

    let currentId: string | null = detail.activeLeafId;
    let foundAgentId: string | null = null;

    const nodes = detail.nodes;

    // 从活跃叶节点向上遍历，找到第一个助手消息
    while (currentId !== null) {
      const node: ChatMessageNode = nodes[currentId];
      if (!node) break;

      // 找到第一个助手角色的消息
      if (node.role === "assistant" && node.metadata?.agentId) {
        foundAgentId = node.metadata.agentId;
        break;
      }

      currentId = node.parentId;
    }

    // 更新索引中的 displayAgentId
    index.displayAgentId = foundAgentId;
    logger.debug("更新会话显示智能体", { sessionId, displayAgentId: foundAgentId });
  };

  /**
   * 创建新会话（使用智能体）
   */
  const createSession = (
    agentId: string,
    name?: string,
  ): {
    index: ChatSessionIndex;
    detail: ChatSessionDetail;
    sessionId: string;
  } => {
    const agentStore = useAgentStore();
    const agent = agentStore.getAgentById(agentId);

    if (!agent) {
      errorHandler.handle(new Error("Agent not found"), {
        userMessage: "创建会话失败：智能体不存在",
        showToUser: false,
        context: { agentId },
      });
      throw new Error(`未找到智能体: ${agentId}`);
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const rootNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = getLocalISOString();

    // 创建根节点（系统节点，不显示内容）
    const rootNode: ChatMessageNode = {
      id: rootNodeId,
      parentId: null,
      childrenIds: [],
      content: "",
      role: "system",
      status: "complete",
      isEnabled: true,
      timestamp: now,
    };

    // 生成会话名称（使用日期时间作为默认名称）
    let sessionName = name;
    if (!sessionName) {
      // 格式化当前时间为 "会话 YYYY-MM-DD HH:mm:ss"
      sessionName = `会话 ${formatDateTime(new Date(), "yyyy-MM-dd HH:mm:ss")}`;
    }

    const index: ChatSessionIndex = {
      id: sessionId,
      name: sessionName,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      displayAgentId: agentId,
    };

    const detail: ChatSessionDetail = {
      id: sessionId,
      nodes: {
        [rootNodeId]: rootNode,
      },
      rootNodeId,
      activeLeafId: rootNodeId,
      history: [],
      historyIndex: 0,
    };

    // 更新智能体的最后使用时间
    agentStore.updateLastUsed(agentId);

    logger.info("创建新会话", {
      sessionId,
      agentId,
      agentName: agent.name,
      modelId: agent.modelId,
      sessionName: index.name,
    });

    return { index, detail, sessionId };
  };

  /**
   * 删除会话
   */
  const deleteSession = async (
    sessions: ChatSessionIndex[],
    sessionId: string,
    currentSessionId: string | null,
  ): Promise<{
    updatedSessions: ChatSessionIndex[];
    newCurrentSessionId: string | null;
  }> => {
    const index = sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) {
      logger.warn("删除会话失败：会话不存在", { sessionId });
      return { updatedSessions: sessions, newCurrentSessionId: currentSessionId };
    }

    const session = sessions[index];

    // 从数组中移除
    const updatedSessions = [...sessions];
    updatedSessions.splice(index, 1);

    // 如果删除的是当前会话，尝试切换到邻近的会话
    let newCurrentSessionId = currentSessionId;
    if (currentSessionId === sessionId) {
      if (updatedSessions.length > 0) {
        const nextIndex = Math.min(index, updatedSessions.length - 1);
        newCurrentSessionId = updatedSessions[nextIndex].id;
      } else {
        newCurrentSessionId = null;
      }
    }

    // 使用统一存储接口删除会话文件和更新索引
    try {
      const { deleteSession: deleteSessionFile } = useChatStorage();
      await deleteSessionFile(sessionId);
      logger.info("删除会话", { sessionId, sessionName: session.name });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除会话文件失败",
        showToUser: false,
        context: { sessionId },
      });
    }

    return { updatedSessions, newCurrentSessionId };
  };

  /**
   * 更新会话信息
   */
  const updateSession = (
    sessionId: string,
    updates: Partial<ChatSessionIndex> & Partial<ChatSessionDetail>,
    sessionIndexMap: Map<string, ChatSessionIndex>,
    sessionDetailMap: Map<string, ChatSessionDetail>,
  ): void => {
    const index = sessionIndexMap.get(sessionId);
    const detail = sessionDetailMap.get(sessionId);
    const now = getLocalISOString();

    if (index) {
      const indexUpdates: Partial<ChatSessionIndex> = {};
      if (updates.name !== undefined) indexUpdates.name = updates.name;
      if (updates.displayAgentId !== undefined) indexUpdates.displayAgentId = updates.displayAgentId;
      if (updates.messageCount !== undefined) indexUpdates.messageCount = updates.messageCount;

      Object.assign(index, indexUpdates, { updatedAt: now });
    }

    if (detail) {
      const detailUpdates: Partial<ChatSessionDetail> = {};
      if (updates.nodes !== undefined) detailUpdates.nodes = updates.nodes;
      if (updates.rootNodeId !== undefined) detailUpdates.rootNodeId = updates.rootNodeId;
      if (updates.activeLeafId !== undefined) detailUpdates.activeLeafId = updates.activeLeafId;
      if (updates.parameterOverrides !== undefined) detailUpdates.parameterOverrides = updates.parameterOverrides;
      if (updates.history !== undefined) detailUpdates.history = updates.history;
      if (updates.historyIndex !== undefined) detailUpdates.historyIndex = updates.historyIndex;
      if (updates.agentUsage !== undefined) detailUpdates.agentUsage = updates.agentUsage;

      Object.assign(detail, detailUpdates);
    }

    logger.info("更新会话", { sessionId, updates });
  };

  /**
   * 从文件加载会话索引（轻量级）
   */
  const loadSessionsIndex = async (): Promise<{
    sessions: ChatSessionIndex[];
    currentSessionId: string | null;
  }> => {
    try {
      const { loadSessionsIndex: loadIndexFromStorage } = useChatStorage();
      const { sessions, currentSessionId } = await loadIndexFromStorage();
      return { sessions: sessions as ChatSessionIndex[], currentSessionId };
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "加载会话索引失败", showToUser: false });
      return { sessions: [], currentSessionId: null };
    }
  };

  /**
   * 持久化单个会话到文件（仅保存指定会话）
   */
  const persistSession = (
    index: ChatSessionIndex,
    detail: ChatSessionDetail,
    currentSessionId: string | null,
  ): void => {
    const { persistSession: persistSessionToStorage } = useChatStorage();

    persistSessionToStorage(index, detail, currentSessionId).catch((error) => {
      errorHandler.handle(error as Error, {
        userMessage: "持久化会话失败",
        showToUser: false,
        context: { sessionId: index.id },
      });
    });
  };

  /**
   * 持久化所有会话到文件（批量操作）
   */
  const persistSessions = (
    sessions: Array<{ index: ChatSessionIndex; detail?: ChatSessionDetail }>,
    currentSessionId: string | null,
  ): void => {
    const { saveSessions } = useChatStorage();

    saveSessions(sessions as any, currentSessionId).catch((error) => {
      errorHandler.handle(error as Error, {
        userMessage: "持久化所有会话失败",
        showToUser: false,
        context: { sessionCount: sessions.length },
      });
    });
  };

  // 使用 useExportManager 提供导出功能
  const exportManager = useExportManager();
  const { exportSessionAsMarkdown, exportBranchAsMarkdown, exportBranchAsJson, exportSessionAsMarkdownTree } =
    exportManager;

  /**
   * 更新当前会话 ID（轻量级持久化）
   */
  const updateCurrentSessionId = async (currentSessionId: string | null): Promise<void> => {
    const { updateCurrentSessionId: updateCurrentSessionIdInStorage } = useChatStorage();
    try {
      await updateCurrentSessionIdInStorage(currentSessionId);
      logger.debug("当前会话 ID 已持久化", { currentSessionId });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "持久化当前会话 ID 失败",
        showToUser: false,
        context: { currentSessionId },
      });
    }
  };

  /**
   * 清空所有会话
   */
  const clearAllSessions = (): void => {
    logger.info("清空所有会话");
  };

  return {
    createSession,
    deleteSession,
    updateSession,
    loadSessionsIndex,
    persistSession,
    persistSessions,
    updateCurrentSessionId,
    updateMessageCount,
    updateSessionDisplayAgent,
    exportSessionAsMarkdown: exportSessionAsMarkdown as any,
    exportSessionAsMarkdownTree,
    exportBranchAsMarkdown,
    exportBranchAsJson,
    clearAllSessions,
  };
}
