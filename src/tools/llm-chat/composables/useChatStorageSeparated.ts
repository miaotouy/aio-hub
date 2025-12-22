/**
 * LLM Chat 会话分离式文件存储
 * 使用 ConfigManager 管理索引文件，每个会话存储为独立文件
 */

import { exists, readTextFile, writeTextFile, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { createConfigManager } from "@/utils/configManager";
import { debounce } from "lodash-es";
import type { ChatSession } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/storage-separated");
const errorHandler = createModuleErrorHandler("llm-chat/storage-separated");

const MODULE_NAME = "llm-chat";
const SESSIONS_SUBDIR = "sessions";

/**
 * 会话索引项（包含显示所需的元数据）
 */
interface SessionIndexItem {
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
interface SessionsIndex {
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
 * 分离式会话存储 composable
 */
export function useChatStorageSeparated() {
  /**
   * 获取会话文件路径
   */
  async function getSessionPath(sessionId: string): Promise<string> {
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const sessionsDir = await join(moduleDir, SESSIONS_SUBDIR);
    return join(sessionsDir, `${sessionId}.json`);
  }

  /**
   * 加载会话索引（使用 ConfigManager）
   */
  async function loadIndex(): Promise<SessionsIndex> {
    return await indexManager.load();
  }

  /**
   * 保存会话索引（使用 ConfigManager）
   */
  async function saveIndex(index: SessionsIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个会话
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

      // logger.debug('会话加载成功', { sessionId, nodeCount: Object.keys(session.nodes).length });
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
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const sessionsDir = await join(moduleDir, SESSIONS_SUBDIR);

    if (!(await exists(sessionsDir))) {
      const { mkdir } = await import("@tauri-apps/plugin-fs");
      await mkdir(sessionsDir, { recursive: true });
      logger.debug("创建 sessions 目录", { sessionsDir });
    }
  }

  /**
   * 保存单个会话（仅在内容变化时写入）
   */
  async function saveSession(session: ChatSession, forceWrite: boolean = false): Promise<void> {
    try {
      await indexManager.ensureModuleDir(); // 使用 ConfigManager 确保模块目录存在
      await ensureSessionsDir(); // 确保 sessions 子目录存在
      const sessionPath = await getSessionPath(session.id);

      // 创建要保存的数据副本，移除运行时专用的 history 字段
      // 避免将撤销/重做栈持久化到磁盘
      const { history, historyIndex, ...sessionToSave } = session;
      const newContent = JSON.stringify(sessionToSave, null, 2);

      // 如果不是强制写入，先检查内容是否真的改变了
      if (!forceWrite) {
        const fileExists = await exists(sessionPath);
        if (fileExists) {
          try {
            const oldContent = await readTextFile(sessionPath);
            // 内容相同则跳过写入
            if (oldContent === newContent) {
              logger.debug("会话内容未变化，跳过写入", { sessionId: session.id });
              return;
            }
          } catch (readError) {
            // 读取失败则继续写入
            logger.warn("读取现有会话文件失败，继续写入", { sessionId: session.id });
          }
        }
      }

      await writeTextFile(sessionPath, newContent);

      logger.debug("会话保存成功", {
        sessionId: session.id,
        nodeCount: Object.keys(session.nodes).length,
      });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存会话失败",
        showToUser: false,
        context: { sessionId: session.id },
      });
      throw error;
    }
  }

  /**
   * 删除单个会话文件
   */
  async function deleteSessionFile(sessionId: string): Promise<void> {
    try {
      const sessionPath = await getSessionPath(sessionId);
      const sessionExists = await exists(sessionPath);
      if (sessionExists) {
        await remove(sessionPath);
        logger.info("会话文件已删除", { sessionId });
      }
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除会话文件失败",
        showToUser: false,
        context: { sessionId },
      });
      throw error;
    }
  }

  /**
   * 扫描 sessions 目录，获取所有会话文件的 ID
   */
  async function scanSessionDirectory(): Promise<string[]> {
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const appDir = await appDataDir();
      const moduleDir = await join(appDir, MODULE_NAME);
      const sessionsDir = await join(moduleDir, SESSIONS_SUBDIR);

      const dirExists = await exists(sessionsDir);
      if (!dirExists) {
        return [];
      }

      const entries = await readDir(sessionsDir);
      const sessionIds = entries
        .filter((entry) => entry.name?.endsWith(".json"))
        .map((entry) => entry.name!.replace(".json", ""));

      logger.debug("扫描会话目录完成", { count: sessionIds.length });
      return sessionIds;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "扫描会话目录失败", showToUser: false });
      return [];
    }
  }

  /**
   * 从会话创建索引项
   */
  function createIndexItem(session: ChatSession): SessionIndexItem {
    return {
      id: session.id,
      name: session.name,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      messageCount: Object.keys(session.nodes).length - 1, // 排除根节点
      displayAgentId: session.displayAgentId,
    };
  }

  /**
   * 同步索引：合并索引中的 ID 和目录中的文件，加载新文件的元数据
   */
  async function syncIndex(index: SessionsIndex): Promise<SessionIndexItem[]> {
    // 1. 扫描目录获取所有会话文件 ID
    const fileIds = await scanSessionDirectory();

    // 2. 创建 ID 映射
    const fileIdSet = new Set(fileIds);
    const indexMap = new Map(index.sessions.map((item) => [item.id, item]));

    // 3. 找出新增的文件 ID
    const newIds = fileIds.filter((id) => !indexMap.has(id));

    // 4. 加载新文件的元数据
    const newItems: SessionIndexItem[] = [];
    for (const id of newIds) {
      const session = await loadSession(id);
      if (session) {
        newItems.push(createIndexItem(session));
      }
    }

    // 5. 过滤掉已删除的文件，保持原有顺序
    const validItems = index.sessions.filter((item) => fileIdSet.has(item.id));

    // 6. 合并：保持原有顺序，新文件追加在后面
    const syncedItems = [...validItems, ...newItems];

    if (newItems.length > 0 || validItems.length !== index.sessions.length) {
      logger.info("索引已同步", {
        total: syncedItems.length,
        new: newItems.length,
        removed: index.sessions.length - validItems.length,
      });
    }

    return syncedItems;
  }

  /**
   * 加载所有会话（兼容接口）
   */
  async function loadSessions(): Promise<{
    sessions: ChatSession[];
    currentSessionId: string | null;
  }> {
    try {
      logger.debug("开始加载所有会话");

      // 1. 加载索引
      let index = await loadIndex();

      // 2. 迁移旧版本索引（v2.0.0 只有 sessionIds）
      // 定义旧版本索引接口用于类型安全访问
      interface LegacyIndex {
        sessionIds?: string[];
      }
      
      if (!index.sessions && (index as unknown as LegacyIndex).sessionIds) {
        logger.info("检测到旧版本索引，开始迁移");
        const oldIds = (index as unknown as LegacyIndex).sessionIds as string[];
        const sessions = await Promise.all(oldIds.map((id) => loadSession(id)));
        index.sessions = sessions
          .filter((s): s is ChatSession => s !== null)
          .map((s) => createIndexItem(s));
        index.version = "1.1.2";
        await saveIndex(index);
        logger.info("索引迁移完成", { count: index.sessions.length });
      }

      // 3. 同步索引（自动发现新文件并加载其元数据）
      const syncedItems = await syncIndex(index);

      // 4. 并行加载所有会话的完整数据
      const sessionPromises = syncedItems.map((item) => loadSession(item.id));
      const sessionResults = await Promise.all(sessionPromises);

      // 5. 过滤掉加载失败的会话
      const sessions = sessionResults.filter((s): s is ChatSession => s !== null);

      // 6. 验证数据格式：检查是否是树形结构
      const validSessions = sessions.filter(
        (session) =>
          session.nodes !== undefined &&
          session.rootNodeId !== undefined &&
          session.activeLeafId !== undefined
      );

      if (validSessions.length !== sessions.length) {
        logger.warn("部分会话格式无效，已过滤", {
          total: sessions.length,
          valid: validSessions.length,
          invalid: sessions.length - validSessions.length,
        });
      }

      // 7. 如果索引被同步过，保存更新后的索引
      const validItems = validSessions.map((s) => createIndexItem(s));
      if (
        syncedItems.length !== index.sessions.length ||
        !syncedItems.every((item, i) => item.id === index.sessions[i]?.id)
      ) {
        index.sessions = validItems;
        await saveIndex(index);
      }

      logger.info(`加载了 ${validSessions.length} 个会话`, {
        currentSessionId: index.currentSessionId,
      });

      logger.debug(
        "会话列表详情",
        {
          sessions: validSessions.map((s) => ({
            id: s.id,
            name: s.name,
            messages: Object.keys(s.nodes).length,
          })),
        },
        true
      );

      return {
        sessions: validSessions,
        currentSessionId: index.currentSessionId,
      };
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "加载所有会话失败", showToUser: false });
      return { sessions: [], currentSessionId: null };
    }
  }

  /**
   * 保存单个会话并更新索引
   */
  async function persistSession(
    session: ChatSession,
    currentSessionId: string | null
  ): Promise<void> {
    try {
      logger.debug("保存单个会话", { sessionId: session.id });

      // 1. 保存会话文件
      await saveSession(session, true); // 强制写入

      // 2. 更新索引（仅更新元数据，不触碰其他文件）
      const index = await loadIndex();
      index.currentSessionId = currentSessionId;

      // 更新或添加当前会话的索引项
      const sessionIndex = index.sessions.findIndex((s) => s.id === session.id);
      const newIndexItem = createIndexItem(session);

      if (sessionIndex >= 0) {
        index.sessions[sessionIndex] = newIndexItem;
      } else {
        index.sessions.push(newIndexItem);
      }

      await saveIndex(index);

      logger.debug("单个会话保存成功", { sessionId: session.id });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存单个会话失败",
        showToUser: false,
        context: { sessionId: session.id },
      });
      throw error;
    }
  }

  /**
   * 保存所有会话（仅用于批量操作，如初始化）
   */
  async function saveSessions(
    sessions: ChatSession[],
    currentSessionId: string | null
  ): Promise<void> {
    try {
      logger.debug("开始批量保存所有会话", { sessionCount: sessions.length });

      // 1. 并行保存所有会话文件（强制写入）
      await Promise.all(sessions.map((session) => saveSession(session, true)));

      // 2. 更新索引（保存元数据）
      const index: SessionsIndex = {
        version: "1.1.2",
        currentSessionId,
        sessions: sessions.map((s) => createIndexItem(s)),
      };

      await saveIndex(index);

      logger.info("所有会话批量保存成功", {
        sessionCount: sessions.length,
        currentSessionId,
      });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "批量保存所有会话失败",
        showToUser: false,
        context: { sessionCount: sessions.length },
      });
      throw error;
    }
  }

  /**
   * 删除会话（同时删除文件和索引）
   */
  async function deleteSession(sessionId: string): Promise<void> {
    try {
      // 1. 删除会话文件
      await deleteSessionFile(sessionId);

      // 2. 从索引中移除
      const index = await loadIndex();
      index.sessions = index.sessions.filter((item) => item.id !== sessionId);

      // 3. 如果删除的是当前会话，切换到第一个会话
      if (index.currentSessionId === sessionId) {
        index.currentSessionId = index.sessions[0]?.id || null;
      }

      await saveIndex(index);

      logger.info("会话已删除", { sessionId });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除会话失败",
        showToUser: false,
        context: { sessionId },
      });
      throw error;
    }
  }

  /**
   * 更新当前会话 ID（轻量级操作，只更新索引）
   */
  async function updateCurrentSessionId(currentSessionId: string | null): Promise<void> {
    try {
      const index = await loadIndex();
      index.currentSessionId = currentSessionId;
      await saveIndex(index);
      logger.debug("当前会话 ID 已更新", { currentSessionId });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "更新当前会话 ID 失败",
        showToUser: false,
        context: { currentSessionId },
      });
      throw error;
    }
  }

  /**
   * 创建防抖保存函数
   */
  function createDebouncedSave(delay: number = 500) {
    return debounce(async (sessions: ChatSession[], currentSessionId: string | null) => {
      try {
        await saveSessions(sessions, currentSessionId);
        logger.debug("防抖保存完成", { delay });
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "防抖保存失败", showToUser: false });
      }
    }, delay);
  }

  /**
   * 获取会话存储目录路径
   */
  async function getSessionsDir(): Promise<string> {
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    return await join(moduleDir, SESSIONS_SUBDIR);
  }

  return {
    loadSessions,
    saveSessions,
    persistSession, // 新增：单会话保存
    deleteSession,
    updateCurrentSessionId, // 新增：更新当前会话ID
    createDebouncedSave,
    loadSession,
    saveSession,
    getSessionsDir,
    getSessionPath,
  };
}
