/**
 * LLM Chat 世界书分离式文件存储
 * 使用 ConfigManager 管理索引文件，每个世界书存储为独立文件
 */

import { exists, readTextFile, writeTextFile, remove } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createConfigManager } from "@/utils/configManager";
import type { STWorldbook, WorldbookMetadata } from "../types/worldbook";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/worldbook-storage");
const errorHandler = createModuleErrorHandler("llm-chat/worldbook-storage");

const MODULE_NAME = "llm-chat";
const WORLDBOOKS_SUBDIR = "worldbooks";

/**
 * 世界书索引配置
 */
interface WorldbooksIndex {
  version: string;
  worldbooks: WorldbookMetadata[];
}

/**
 * 创建默认索引配置
 */
function createDefaultIndex(): WorldbooksIndex {
  return {
    version: "1.0.0",
    worldbooks: [],
  };
}

/**
 * 索引文件管理器
 */
const indexManager = createConfigManager<WorldbooksIndex>({
  moduleName: MODULE_NAME,
  fileName: "worldbooks-index.json",
  version: "1.0.0",
  createDefault: createDefaultIndex,
});

export function useWorldbookStorageSeparated() {
  /**
   * 获取世界书文件路径
   */
  async function getWorldbookPath(id: string): Promise<string> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const wbDir = await join(moduleDir, WORLDBOOKS_SUBDIR);
    return join(wbDir, `${id}.json`);
  }

  /**
   * 确保 worldbooks 目录存在
   */
  async function ensureWorldbooksDir(): Promise<void> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const wbDir = await join(moduleDir, WORLDBOOKS_SUBDIR);

    if (!(await exists(wbDir))) {
      const { mkdir } = await import("@tauri-apps/plugin-fs");
      await mkdir(wbDir, { recursive: true });
      logger.debug("创建 worldbooks 目录", { wbDir });
    }
  }

  /**
   * 加载索引
   */
  async function loadIndex(): Promise<WorldbooksIndex> {
    return await indexManager.load();
  }

  /**
   * 保存索引
   */
  async function saveIndex(index: WorldbooksIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个世界书内容
   */
  async function loadWorldbookContent(id: string): Promise<STWorldbook | null> {
    try {
      const path = await getWorldbookPath(id);
      if (!(await exists(path))) {
        logger.warn("世界书文件不存在", { id });
        return null;
      }
      const content = await readTextFile(path);
      return JSON.parse(content);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载世界书内容失败",
        showToUser: false,
        context: { id },
      });
      return null;
    }
  }

  /**
   * 保存单个世界书内容
   */
  async function saveWorldbookContent(id: string, content: STWorldbook): Promise<void> {
    try {
      await ensureWorldbooksDir();
      const path = await getWorldbookPath(id);
      await writeTextFile(path, JSON.stringify(content, null, 2));
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存世界书内容失败",
        showToUser: false,
        context: { id },
      });
      throw error;
    }
  }

  /**
   * 删除世界书文件
   */
  async function deleteWorldbookFile(id: string): Promise<void> {
    try {
      const path = await getWorldbookPath(id);
      if (await exists(path)) {
        await remove(path);
      }
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除世界书文件失败",
        showToUser: false,
        context: { id },
      });
      throw error;
    }
  }

  /**
   * 扫描目录并同步索引
   */
  async function syncIndex(currentIndex: WorldbooksIndex): Promise<WorldbookMetadata[]> {
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const appDir = await getAppConfigDir();
      const wbDir = await join(appDir, MODULE_NAME, WORLDBOOKS_SUBDIR);

      if (!(await exists(wbDir))) return [];

      const entries = await readDir(wbDir);
      const fileIds = entries
        .filter((e) => e.name?.endsWith(".json"))
        .map((e) => e.name!.replace(".json", ""));

      const indexMap = new Map(currentIndex.worldbooks.map((item) => [item.id, item]));
      const fileIdSet = new Set(fileIds);

      // 找出新增的文件
      const newIds = fileIds.filter((id) => !indexMap.has(id));
      const newItems: WorldbookMetadata[] = [];

      for (const id of newIds) {
        const content = await loadWorldbookContent(id);
        if (content) {
          // 尝试从 metadata 或 entries 推断名称
          const name = content.metadata?.name || `Worldbook ${id.substring(0, 6)}`;
          newItems.push({
            id,
            name,
            description: content.metadata?.description,
            entryCount: Object.keys(content.entries).length,
            createdAt: new Date().toISOString(), // 无法获取文件创建时间，暂用当前时间
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // 过滤已删除的文件
      const validItems = currentIndex.worldbooks.filter((item) => fileIdSet.has(item.id));

      const syncedItems = [...validItems, ...newItems];

      if (newItems.length > 0 || validItems.length !== currentIndex.worldbooks.length) {
        currentIndex.worldbooks = syncedItems;
        await saveIndex(currentIndex);
        logger.info("世界书索引已同步", {
          total: syncedItems.length,
          new: newItems.length,
          removed: currentIndex.worldbooks.length - validItems.length,
        });
      }

      return syncedItems;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "同步世界书索引失败", showToUser: false });
      return currentIndex.worldbooks;
    }
  }

  return {
    loadIndex,
    saveIndex,
    loadWorldbookContent,
    saveWorldbookContent,
    deleteWorldbookFile,
    syncIndex,
  };
}