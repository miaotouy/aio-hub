/**
 * LLM Chat 会话数据文件存储
 * 使用分离式存储，每个会话独立文件
 */

import { useChatStorageSeparated } from "./useChatStorageSeparated";
import type { ChatSession } from "../types";

/**
 * 会话存储 composable
 * 封装分离式存储，提供统一的存储接口
 */
export function useChatStorage() {
  const separatedStorage = useChatStorageSeparated();

  /**
   * 加载所有会话
   */
  const loadSessions = async (): Promise<{
    sessions: ChatSession[];
    currentSessionId: string | null;
  }> => {
    return await separatedStorage.loadSessions();
  };

  /**
   * 保存所有会话
   */
  const saveSessions = async (
    sessions: ChatSession[],
    currentSessionId: string | null
  ): Promise<void> => {
    return separatedStorage.saveSessions(sessions, currentSessionId);
  };

  /**
   * 删除单个会话（同时删除文件和更新索引）
   */
  const deleteSession = async (sessionId: string): Promise<void> => {
    return separatedStorage.deleteSession(sessionId);
  };

  /**
   * 加载单个会话
   */
  const loadSession = async (sessionId: string): Promise<ChatSession | null> => {
    return separatedStorage.loadSession(sessionId);
  };

  /**
   * 保存单个会话
   */
  const saveSession = async (session: ChatSession): Promise<void> => {
    return separatedStorage.saveSession(session);
  };

  /**
   * 保存单个会话并更新索引（推荐使用）
   */
  const persistSession = async (
    session: ChatSession,
    currentSessionId: string | null
  ): Promise<void> => {
    return separatedStorage.persistSession(session, currentSessionId);
  };

  /**
   * 更新当前会话 ID
   */
  const updateCurrentSessionId = async (currentSessionId: string | null): Promise<void> => {
    return separatedStorage.updateCurrentSessionId(currentSessionId);
  };

  /**
   * 创建防抖保存函数
   */
  const createDebouncedSave = (delay: number = 500) => {
    return separatedStorage.createDebouncedSave(delay);
  };

  return {
    loadSessions,
    saveSessions,
    persistSession, // 新增：单会话保存
    deleteSession,
    updateCurrentSessionId, // 新增：更新当前会话ID
    loadSession,
    saveSession,
    createDebouncedSave,
  };
}
