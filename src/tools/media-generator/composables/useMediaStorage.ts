/**
 * Media Generator 会话持久化存储
 * 参考 llm-chat 的分离式存储方案
 */

import { exists, readTextFile, writeTextFile, remove } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createConfigManager } from "@/utils/configManager";
import { debounce } from "lodash-es";
import type {
  GenerationSession,
  MediaSessionsIndex,
  MediaSessionIndexItem,
  MediaGeneratorSettings,
  MediaTask,
} from "../types";
import { DEFAULT_MEDIA_GENERATOR_SETTINGS } from "../config";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("media-generator/storage");
const errorHandler = createModuleErrorHandler("media-generator/storage");

const MODULE_NAME = "media-generator";
const SESSIONS_SUBDIR = "sessions";
const INDEX_VERSION = "1.0.0";

/**
 * 创建默认索引配置
 */
function createDefaultIndex(): MediaSessionsIndex {
  return {
    version: INDEX_VERSION,
    currentSessionId: null,
    sessions: [],
  };
}

/**
 * 索引文件管理器
 */
const indexManager = createConfigManager<MediaSessionsIndex>({
  moduleName: MODULE_NAME,
  fileName: "sessions-index.json",
  version: INDEX_VERSION,
  createDefault: createDefaultIndex,
});

/**
 * 任务列表管理器
 */
const tasksManager = createConfigManager<MediaTask[]>({
  moduleName: MODULE_NAME,
  fileName: "tasks.json",
  version: "1.0.0",
  createDefault: () => [],
});

/**
 * 设置文件管理器
 */
const settingsManager = createConfigManager<MediaGeneratorSettings>({
  moduleName: MODULE_NAME,
  fileName: "settings.json",
  version: "1.0.0",
  createDefault: () => DEFAULT_MEDIA_GENERATOR_SETTINGS,
});

/**
 * 媒体生成器存储 Composable
 */
export function useMediaStorage() {
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
   * 确保 sessions 子目录存在
   */
  async function ensureSessionsDir(): Promise<void> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const sessionsDir = await join(moduleDir, SESSIONS_SUBDIR);

    if (!(await exists(sessionsDir))) {
      const { mkdir } = await import("@tauri-apps/plugin-fs");
      await mkdir(sessionsDir, { recursive: true });
      logger.debug("创建 sessions 目录", { sessionsDir });
    }
  }

  /**
   * 加载会话索引
   */
  async function loadIndex(): Promise<MediaSessionsIndex> {
    return await indexManager.load();
  }

  /**
   * 保存会话索引
   */
  async function saveIndex(index: MediaSessionsIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个会话
   */
  async function loadSession(sessionId: string): Promise<GenerationSession | null> {
    try {
      const sessionPath = await getSessionPath(sessionId);
      const sessionExists = await exists(sessionPath);

      if (!sessionExists) {
        logger.warn("会话文件不存在", { sessionId });
        return null;
      }

      const content = await readTextFile(sessionPath);
      const session: GenerationSession = JSON.parse(content);
      return session;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载生成会话失败",
        showToUser: false,
        context: { sessionId },
      });
      return null;
    }
  }

  /**
   * 保存单个会话（仅在内容变化时写入）
   */
  async function saveSession(
    session: GenerationSession,
    forceWrite: boolean = false
  ): Promise<void> {
    try {
      await indexManager.ensureModuleDir();
      await ensureSessionsDir();
      const sessionPath = await getSessionPath(session.id);

      const newContent = JSON.stringify(session, null, 2);

      // 如果不是强制写入，先检查内容是否真的改变了
      if (!forceWrite) {
        const fileExists = await exists(sessionPath);
        if (fileExists) {
          try {
            const oldContent = await readTextFile(sessionPath);
            if (oldContent === newContent) {
              return;
            }
          } catch (readError) {
            logger.warn("读取现有会话文件失败，继续写入", { sessionId: session.id });
          }
        }
      }

      await writeTextFile(sessionPath, newContent);

      logger.debug("生成会话保存成功", {
        sessionId: session.id,
        nodeCount: Object.keys(session.nodes || {}).length,
      });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存生成会话失败",
        showToUser: false,
        context: { sessionId: session.id },
      });
      throw error;
    }
  }

  /**
   * 从会话创建索引项
   */
  function createIndexItem(session: GenerationSession): MediaSessionIndexItem {
    // 统计媒体任务数
    const taskCount = Object.values(session.nodes || {}).filter(
      (n) => n.metadata?.isMediaTask
    ).length;

    return {
      id: session.id,
      name: session.name,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      taskCount,
    };
  }

  /**
   * 扫描 sessions 目录，获取所有会话文件的 ID
   */
  async function scanSessionDirectory(): Promise<string[]> {
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const appDir = await getAppConfigDir();
      const moduleDir = await join(appDir, MODULE_NAME);
      const sessionsDir = await join(moduleDir, SESSIONS_SUBDIR);

      if (!(await exists(sessionsDir))) return [];

      const entries = await readDir(sessionsDir);
      return entries
        .filter((entry) => entry.name?.endsWith(".json"))
        .map((entry) => entry.name!.replace(".json", ""));
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "扫描会话目录失败", showToUser: false });
      return [];
    }
  }

  /**
   * 同步索引：确保物理文件与索引项一致
   */
  async function syncIndex(index: MediaSessionsIndex): Promise<MediaSessionIndexItem[]> {
    const fileIds = await scanSessionDirectory();
    const fileIdSet = new Set(fileIds);
    const indexMap = new Map(index.sessions.map((item) => [item.id, item]));

    // 找出新增文件并加载元数据
    const newItems: MediaSessionIndexItem[] = [];
    for (const id of fileIds) {
      if (!indexMap.has(id)) {
        const session = await loadSession(id);
        if (session) newItems.push(createIndexItem(session));
      }
    }

    // 过滤掉已删除文件
    const validItems = index.sessions.filter((item) => fileIdSet.has(item.id));
    return [...validItems, ...newItems];
  }

  /**
   * 加载所有会话
   */
  async function loadSessions(): Promise<{
    sessions: GenerationSession[];
    currentSessionId: string | null;
  }> {
    try {
      let index = await loadIndex();

      // 同步索引
      const syncedItems = await syncIndex(index);

      // 加载所有会话完整数据
      const sessionResults = await Promise.all(syncedItems.map((item) => loadSession(item.id)));
      const sessions = sessionResults.filter((s): s is GenerationSession => s !== null);

      // 如果索引有变动，保存更新
      if (syncedItems.length !== index.sessions.length) {
        index.sessions = syncedItems;
        await saveIndex(index);
      }

      return {
        sessions,
        currentSessionId: index.currentSessionId,
      };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载所有生成会话失败",
        showToUser: false,
      });
      return { sessions: [], currentSessionId: null };
    }
  }

  /**
   * 持久化单个会话并更新索引
   */
  async function persistSession(
    session: GenerationSession,
    currentSessionId: string | null
  ): Promise<void> {
    try {
      await saveSession(session);

      const index = await loadIndex();
      index.currentSessionId = currentSessionId;

      const sessionIndex = index.sessions.findIndex((s) => s.id === session.id);
      const newIndexItem = createIndexItem(session);

      if (sessionIndex >= 0) {
        index.sessions[sessionIndex] = newIndexItem;
      } else {
        index.sessions.push(newIndexItem);
      }

      await saveIndex(index);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "持久化生成会话失败",
        showToUser: false,
        context: { sessionId: session.id },
      });
      throw error;
    }
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string): Promise<void> {
    try {
      const sessionPath = await getSessionPath(sessionId);
      if (await exists(sessionPath)) {
        await remove(sessionPath);
      }

      const index = await loadIndex();
      index.sessions = index.sessions.filter((item) => item.id !== sessionId);

      if (index.currentSessionId === sessionId) {
        index.currentSessionId = index.sessions[0]?.id || null;
      }

      await saveIndex(index);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除生成会话失败",
        showToUser: false,
        context: { sessionId },
      });
      throw error;
    }
  }

  /**
   * 内部防抖保存会话
   */
  const debouncedPersist = debounce(
    async (session: GenerationSession, currentSessionId: string | null) => {
      try {
        await persistSession(session, currentSessionId);
      } catch (error) {
        logger.error("防抖保存会话失败", error);
      }
    },
    2000
  );

  /**
   * 加载全局设置
   */
  async function loadSettings(): Promise<MediaGeneratorSettings> {
    return await settingsManager.load();
  }

  /**
   * 保存全局设置
   */
  async function saveSettings(settings: MediaGeneratorSettings): Promise<void> {
    await settingsManager.save(settings);
  }

  /**
   * 加载全局任务列表
   */
  async function loadTasks(): Promise<MediaTask[]> {
    return await tasksManager.load();
  }

  /**
   * 保存全局任务列表
   */
  async function saveTasks(tasks: MediaTask[]): Promise<void> {
    await tasksManager.save(tasks);
  }

  return {
    loadSessions,
    persistSession,
    persistSessionDebounced: debouncedPersist,
    saveSessionDebounced: indexManager.saveDebounced.bind(indexManager),
    deleteSession,
    loadSession,
    saveSession,
    loadSettings,
    saveSettings,
    saveSettingsDebounced: settingsManager.saveDebounced.bind(settingsManager),
    loadTasks,
    saveTasks,
    saveTasksDebounced: tasksManager.saveDebounced.bind(tasksManager),
  };
}
