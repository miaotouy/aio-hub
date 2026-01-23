/**
 * LLM Chat 会话分离式文件存储 (移动端适配版)
 * 使用 ConfigManager 管理索引文件，每个会话存储为独立文件
 */

import { exists, readTextFile, writeTextFile, remove, mkdir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createConfigManager } from "@/utils/configManager";
import { debounce } from "lodash-es";
import type { ChatSession } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/session-manager");
const errorHandler = createModuleErrorHandler("llm-chat/session-manager");

const MODULE_NAME = "llm-chat";
const SESSIONS_SUBDIR = "sessions";

/**
 * 会话索引项（包含显示所需的元数据）
 */
export interface SessionIndexItem {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  displayAgentId?: string | null;
}

/**
 * 会话索引配置（包含元数据以优化列表显示）
 */
export interface SessionsIndex {
  version: string;
  currentSessionId: string | null;
  sessions: SessionIndexItem[]; // 会话元数据列表（用于排序和快速显示）
}

/**
 * 创建默认索引配置
 */
function createDefaultIndex(): SessionsIndex {
  return {
    version: "1.1.2",
    currentSessionId: null,
    sessions: [],
  };
}

/**
 * 索引文件管理器（使用 ConfigManager）
 */
const indexManager = createConfigManager<SessionsIndex>({
  moduleName: MODULE_NAME,
  fileName: "sessions-index.json",
  version: "1.1.2",
  createDefault: createDefaultIndex,
});

/**
 * 移动端会话存储管理
 */
export function useSessionManager() {
  /**
   * 获取会话文件路径
   */
  async function getSessionPath(sessionId: string): Promise<string> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const sessionsDir = await join(moduleDir, SESSIONS_SUBDIR);
    return join(sessionsDir, `${sessionId}.json`);
  }

  /**
   * 加载会话索引
   */
  async function loadIndex(): Promise<SessionsIndex> {
    return await indexManager.load();
  }

  /**
   * 保存会话索引
   */
  async function saveIndex(index: SessionsIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个会话详情
   */
  async function loadSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const sessionPath = await getSessionPath(sessionId);
      const sessionExists = await exists(sessionPath);

      if (!sessionExists) {
        logger.warn("会话文件不存在", { sessionId });
        return null;
      }

      const content = await readTextFile(sessionPath);
      const session: ChatSession = JSON.parse(content);

      // 确保加载时计算消息数量快照
      if (session.nodes) {
        session.messageCount = Object.keys(session.nodes).length - 1;
      }

      return session;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载会话失败",
        showToUser: false,
        context: { sessionId },
      });
      return null;
    }
  }

  /**
   * 确保 sessions 子目录存在
   */
  async function ensureSessionsDir(): Promise<void> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const sessionsDir = await join(moduleDir, SESSIONS_SUBDIR);

    if (!(await exists(sessionsDir))) {
      await mkdir(sessionsDir, { recursive: true });
      logger.debug("创建 sessions 目录", { sessionsDir });
    }
  }

  /**
   * 保存单个会话内容
   */
  async function saveSessionFile(session: ChatSession, forceWrite: boolean = false): Promise<void> {
    try {
      await ensureSessionsDir();
      const sessionPath = await getSessionPath(session.id);

      // 移除运行时字段
      const { history, historyIndex, ...sessionToSave } = session;
      const newContent = JSON.stringify(sessionToSave, null, 2);

      if (!forceWrite) {
        const fileExists = await exists(sessionPath);
        if (fileExists) {
          try {
            const oldContent = await readTextFile(sessionPath);
            if (oldContent === newContent) {
              return;
            }
          } catch (e) {
            // ignore
          }
        }
      }

      await writeTextFile(sessionPath, newContent);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存会话文件失败",
        showToUser: false,
        context: { sessionId: session.id },
      });
      throw error;
    }
  }

  /**
   * 删除会话文件
   */
  async function deleteSessionFile(sessionId: string): Promise<void> {
    try {
      const sessionPath = await getSessionPath(sessionId);
      if (await exists(sessionPath)) {
        await remove(sessionPath);
      }
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除会话文件失败",
        showToUser: false,
        context: { sessionId },
      });
    }
  }

  /**
   * 创建索引项
   */
  function createIndexItem(session: ChatSession): SessionIndexItem {
    return {
      id: session.id,
      name: session.name,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      messageCount: Object.keys(session.nodes).length - 1,
      displayAgentId: session.displayAgentId,
    };
  }

  /**
   * 持久化会话并更新索引
   */
  async function persistSession(session: ChatSession, currentSessionId: string | null): Promise<void> {
    try {
      // 1. 保存文件
      await saveSessionFile(session, true);

      // 2. 更新索引
      const index = await loadIndex();
      index.currentSessionId = currentSessionId;

      const idx = index.sessions.findIndex(s => s.id === session.id);
      const item = createIndexItem(session);

      if (idx >= 0) {
        index.sessions[idx] = item;
      } else {
        index.sessions.unshift(item); // 新会话放在最前面
      }

      await saveIndex(index);
    } catch (error) {
      logger.error("持久化会话失败", error);
    }
  }

  /**
   * 加载所有会话（仅加载索引，不加载全部详情）
   */
  async function loadSessions(): Promise<{
    sessionMetas: SessionIndexItem[];
    currentSessionId: string | null;
  }> {
    try {
      const index = await loadIndex();
      return {
        sessionMetas: index.sessions,
        currentSessionId: index.currentSessionId
      };
    } catch (error) {
      logger.error("加载会话索引失败", error);
      return { sessionMetas: [], currentSessionId: null };
    }
  }

  /**
   * 删除会话（同时删除文件和索引）
   */
  async function deleteSession(sessionId: string): Promise<string | null> {
    try {
      await deleteSessionFile(sessionId);
      const index = await loadIndex();
      index.sessions = index.sessions.filter(s => s.id !== sessionId);
      
      if (index.currentSessionId === sessionId) {
        index.currentSessionId = index.sessions[0]?.id || null;
      }
      
      await saveIndex(index);
      return index.currentSessionId;
    } catch (error) {
      logger.error("删除会话失败", error);
      return null;
    }
  }

  /**
   * 更新当前会话 ID
   */
  async function updateCurrentSessionId(id: string | null) {
    const index = await loadIndex();
    index.currentSessionId = id;
    await saveIndex(index);
  }

  /**
   * 防抖保存
   */
  function createDebouncedSave(delay: number = 1000) {
    return debounce(async (session: ChatSession, currentSessionId: string | null) => {
      await persistSession(session, currentSessionId);
    }, delay);
  }

  return {
    loadSessions,
    loadSession,
    persistSession,
    deleteSession,
    updateCurrentSessionId,
    createDebouncedSave,
  };
}