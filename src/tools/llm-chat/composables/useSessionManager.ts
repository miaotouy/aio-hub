/**
 * 会话管理 Composable
 * 负责会话的生命周期管理和持久化
 */

import type { ChatSession, ChatMessageNode } from "../types";
import { useAgentStore } from "../agentStore";
import { useChatStorageSeparated as useChatStorage } from "./useChatStorageSeparated";
import { createModuleLogger } from "@/utils/logger";
import { useExportManager } from "./useExportManager";

const logger = createModuleLogger("llm-chat/session-manager");

export function useSessionManager() {
  /**
   * 更新会话的 displayAgentId（内部辅助函数）
   * 从当前活动路径中找到最新的助手消息，获取其使用的智能体 ID
   */
  const updateSessionDisplayAgent = (session: ChatSession): void => {
    let currentId: string | null = session.activeLeafId;
    let foundAgentId: string | null = null;

    // 从活跃叶节点向上遍历，找到第一个助手消息
    while (currentId !== null) {
      const node: ChatMessageNode = session.nodes[currentId];
      if (!node) break;

      // 找到第一个助手角色的消息
      if (node.role === "assistant" && node.metadata?.agentId) {
        foundAgentId = node.metadata.agentId;
        break;
      }

      currentId = node.parentId;
    }

    // 更新会话的 displayAgentId
    session.displayAgentId = foundAgentId;
  };

  /**
   * 创建新会话（使用智能体）
   */
  const createSession = (
    agentId: string,
    name?: string
  ): { session: ChatSession; sessionId: string } => {
    const agentStore = useAgentStore();
    const agent = agentStore.getAgentById(agentId);

    if (!agent) {
      logger.error("创建会话失败：智能体不存在", new Error("Agent not found"), { agentId });
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
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
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

    // 更新智能体的最后使用时间
    agentStore.updateLastUsed(agentId);

    logger.info("创建新会话", {
      sessionId,
      agentId,
      agentName: agent.name,
      modelId: agent.modelId,
      sessionName: session.name,
    });

    return { session, sessionId };
  };

  /**
   * 删除会话
   */
  const deleteSession = async (
    sessions: ChatSession[],
    sessionId: string,
    currentSessionId: string | null
  ): Promise<{
    updatedSessions: ChatSession[];
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

    // 如果删除的是当前会话，切换到第一个会话或清空
    const newCurrentSessionId =
      currentSessionId === sessionId ? updatedSessions[0]?.id || null : currentSessionId;

    // 使用统一存储接口删除会话文件和更新索引
    try {
      const { deleteSession: deleteSessionFile } = useChatStorage();
      await deleteSessionFile(sessionId);
      logger.info("删除会话", { sessionId, sessionName: session.name });
    } catch (error) {
      logger.error("删除会话文件失败", error as Error, { sessionId });
      // 即使文件删除失败，也已从内存中移除
    }

    return { updatedSessions, newCurrentSessionId };
  };

  /**
   * 更新会话信息
   */
  const updateSession = (session: ChatSession, updates: Partial<ChatSession>): void => {
    Object.assign(session, updates, { updatedAt: new Date().toISOString() });
    logger.info("更新会话", { sessionId: session.id, updates });
  };

  /**
   * 从文件加载会话
   */
  const loadSessions = async (): Promise<{
    sessions: ChatSession[];
    currentSessionId: string | null;
  }> => {
    try {
      const { loadSessions: loadSessionsFromStorage } = useChatStorage();
      const { sessions, currentSessionId } = await loadSessionsFromStorage();

      logger.info("加载会话成功", { sessionCount: sessions.length });
      return { sessions, currentSessionId };
    } catch (error) {
      logger.error("加载会话失败", error as Error);
      return { sessions: [], currentSessionId: null };
    }
  };

  /**
   * 持久化单个会话到文件（仅保存指定会话）
   */
  const persistSession = (session: ChatSession, currentSessionId: string | null): void => {
    const { persistSession: persistSessionToStorage } = useChatStorage();
    persistSessionToStorage(session, currentSessionId).catch((error) => {
      logger.error("持久化会话失败", error as Error, {
        sessionId: session.id,
      });
    });
  };

  /**
   * 持久化所有会话到文件（批量操作）
   */
  const persistSessions = (sessions: ChatSession[], currentSessionId: string | null): void => {
    const { saveSessions } = useChatStorage();
    saveSessions(sessions, currentSessionId).catch((error) => {
      logger.error("持久化所有会话失败", error as Error, {
        sessionCount: sessions.length,
      });
    });
  };

  // 使用 useExportManager 提供导出功能
  const exportManager = useExportManager();
  const {
    exportSessionAsMarkdown,
    exportBranchAsMarkdown,
    exportBranchAsJson,
    exportSessionAsMarkdownTree
  } = exportManager;

  /**
   * 更新当前会话 ID（轻量级持久化）
   */
  const updateCurrentSessionId = async (currentSessionId: string | null): Promise<void> => {
    const { updateCurrentSessionId: updateCurrentSessionIdInStorage } = useChatStorage();
    try {
      await updateCurrentSessionIdInStorage(currentSessionId);
      logger.debug("当前会话 ID 已持久化", { currentSessionId });
    } catch (error) {
      logger.error("持久化当前会话 ID 失败", error as Error, { currentSessionId });
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
    loadSessions,
    persistSession, // 新增：单会话保存
    persistSessions, // 批量保存
    updateCurrentSessionId, // 新增：更新当前会话ID
    updateSessionDisplayAgent,
    exportSessionAsMarkdown, // 从 useExportManager 重新导出
    exportSessionAsMarkdownTree, // 从 useExportManager 重新导出
    exportBranchAsMarkdown, // 从 useExportManager 重新导出
    exportBranchAsJson, // 从 useExportManager 重新导出
    clearAllSessions,
  };
}
