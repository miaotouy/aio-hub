/**
 * 快捷操作持久化存储 Composable
 */

import { exists, readTextFile, writeTextFile, remove } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createConfigManager } from "@/utils/configManager";
import type {
  QuickActionSet,
  QuickActionIndex,
  QuickActionSetMetadata,
} from "../../types/quick-action";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/quick-action-storage");
const errorHandler = createModuleErrorHandler("llm-chat/quick-action-storage");

const MODULE_NAME = "llm-chat";
const QUICK_ACTIONS_SUBDIR = "quick-actions";

/**
 * 创建默认索引配置
 */
function createDefaultIndex(): QuickActionIndex {
  return {
    version: "1.0.0",
    quickActionSets: [],
  };
}

/**
 * 索引文件管理器
 */
const indexManager = createConfigManager<QuickActionIndex>({
  moduleName: MODULE_NAME,
  fileName: "quick-actions-index.json",
  version: "1.0.0",
  createDefault: createDefaultIndex,
});

export function useQuickActionStorage() {
  /**
   * 获取快捷操作组文件路径
   */
  async function getSetPath(id: string): Promise<string> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const qaDir = await join(moduleDir, QUICK_ACTIONS_SUBDIR);
    return join(qaDir, `${id}.json`);
  }

  /**
   * 确保目录存在
   */
  async function ensureDir(): Promise<void> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const qaDir = await join(moduleDir, QUICK_ACTIONS_SUBDIR);

    if (!(await exists(qaDir))) {
      const { mkdir } = await import("@tauri-apps/plugin-fs");
      await mkdir(qaDir, { recursive: true });
      logger.debug("创建 quick-actions 目录", { qaDir });
    }
  }

  /**
   * 加载索引
   */
  async function loadIndex(): Promise<QuickActionIndex> {
    return await indexManager.load();
  }

  /**
   * 保存索引
   */
  async function saveIndex(index: QuickActionIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个快捷操作组内容
   */
  async function loadSetContent(id: string): Promise<QuickActionSet | null> {
    try {
      const path = await getSetPath(id);
      if (!(await exists(path))) {
        logger.warn("快捷操作组文件不存在", { id });
        return null;
      }
      const content = await readTextFile(path);
      return JSON.parse(content);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载快捷操作组内容失败",
        showToUser: false,
        context: { id },
      });
      return null;
    }
  }

  /**
   * 保存单个快捷操作组内容
   */
  async function saveSetContent(id: string, content: QuickActionSet): Promise<void> {
    try {
      await ensureDir();
      const path = await getSetPath(id);
      await writeTextFile(path, JSON.stringify(content, null, 2));
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存快捷操作组内容失败",
        showToUser: false,
        context: { id },
      });
      throw error;
    }
  }

  /**
   * 删除快捷操作组文件
   */
  async function deleteSetFile(id: string): Promise<void> {
    try {
      const path = await getSetPath(id);
      if (await exists(path)) {
        await remove(path);
      }
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除快捷操作组文件失败",
        showToUser: false,
        context: { id },
      });
      throw error;
    }
  }

  /**
   * 同步索引
   */
  async function syncIndex(currentIndex: QuickActionIndex): Promise<QuickActionSetMetadata[]> {
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const appDir = await getAppConfigDir();
      const qaDir = await join(appDir, MODULE_NAME, QUICK_ACTIONS_SUBDIR);

      if (!(await exists(qaDir))) return [];

      const entries = await readDir(qaDir);
      const fileIds = entries
        .filter((e) => e.name?.endsWith(".json"))
        .map((e) => e.name!.replace(".json", ""));

      const indexMap = new Map(currentIndex.quickActionSets.map((item) => [item.id, item]));
      const fileIdSet = new Set(fileIds);

      // 找出新增的文件
      const newIds = fileIds.filter((id) => !indexMap.has(id));
      const newItems: QuickActionSetMetadata[] = [];

      for (const id of newIds) {
        const content = await loadSetContent(id);
        if (content) {
          newItems.push({
            id,
            name: content.name,
            description: content.description,
            actionCount: content.actions.length,
            isEnabled: content.isEnabled,
            updatedAt: content.updatedAt,
          });
        }
      }

      // 过滤已删除的文件
      const validItems = currentIndex.quickActionSets.filter((item) => fileIdSet.has(item.id));

      const syncedItems = [...validItems, ...newItems];

      if (newItems.length > 0 || validItems.length !== currentIndex.quickActionSets.length) {
        currentIndex.quickActionSets = syncedItems;
        await saveIndex(currentIndex);
      }

      return syncedItems;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "同步快捷操作索引失败",
        showToUser: false,
      });
      return currentIndex.quickActionSets;
    }
  }

  return {
    loadIndex,
    saveIndex,
    loadSetContent,
    saveSetContent,
    deleteSetFile,
    syncIndex,
  };
}
