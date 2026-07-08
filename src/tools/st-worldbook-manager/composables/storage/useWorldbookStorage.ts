// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * LLM Chat 世界书分离式文件存储
 * 使用 ConfigManager 管理索引文件，每个世界书存储为独立文件
 */

import {
  exists,
  readTextFile,
  writeTextFile,
  remove,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createConfigManager } from "@/utils/configManager";
import type { STWorldbook, WorldbookMetadata } from "../../types/worldbook";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("st-worldbook-manager/worldbook-storage");
const errorHandler = createModuleErrorHandler(
  "st-worldbook-manager/worldbook-storage"
);

const MODULE_NAME = "st-worldbook-manager";
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

export function useWorldbookStorage() {
  /**
   * 冷启动自动检测与物理迁移管道
   */
  async function triggerWorldbookDataMigration(): Promise<void> {
    try {
      const appDir = await getAppConfigDir();
      const oldModuleDir = await join(appDir, "llm-chat");
      const oldIndexFile = await join(oldModuleDir, "worldbooks-index.json");
      const oldWbDir = await join(oldModuleDir, "worldbooks");

      const newModuleDir = await join(appDir, MODULE_NAME);
      const newIndexFile = await join(newModuleDir, "worldbooks-index.json");
      const newWbDir = await join(newModuleDir, "worldbooks");

      // 1. 幂等性检查：如果新路径已经存在索引文件，说明已经迁移过，直接跳过
      if (await exists(newIndexFile)) {
        return;
      }

      // 2. 检测旧路径是否存在数据
      if (!(await exists(oldIndexFile))) {
        return; // 无旧数据，纯净新安装
      }

      logger.info("检测到历史世界书数据，启动自动迁移管道...");

      const timestamp = Date.now();
      const backupDir = await join(
        appDir,
        "backups",
        `worldbook_migration_backup_${timestamp}`
      );
      const { mkdir, copyFile, readDir, rename } =
        await import("@tauri-apps/plugin-fs");

      // 3. 安全备份：将旧数据完整复制到备份目录
      await mkdir(backupDir, { recursive: true });
      await copyFile(
        oldIndexFile,
        await join(backupDir, "worldbooks-index.json")
      );

      if (await exists(oldWbDir)) {
        const backupWbDir = await join(backupDir, "worldbooks");
        await mkdir(backupWbDir, { recursive: true });
        const entries = await readDir(oldWbDir);
        for (const entry of entries) {
          if (entry.name && entry.name.endsWith(".json")) {
            await copyFile(
              await join(oldWbDir, entry.name),
              await join(backupWbDir, entry.name)
            );
          }
        }
      }
      logger.info("历史世界书数据备份成功", { backupDir });

      // 4. 物理迁移：创建新目录并复制数据
      await mkdir(newModuleDir, { recursive: true });
      await mkdir(newWbDir, { recursive: true });

      await copyFile(oldIndexFile, newIndexFile);

      if (await exists(oldWbDir)) {
        const entries = await readDir(oldWbDir);
        for (const entry of entries) {
          if (entry.name && entry.name.endsWith(".json")) {
            await copyFile(
              await join(oldWbDir, entry.name),
              await join(newWbDir, entry.name)
            );
          }
        }
      }
      logger.info("世界书数据物理迁移完成，开始完整性校验...");

      // 5. 完整性校验：对比新旧目录文件数量
      let oldFileCount = 0;
      let newFileCount = 0;
      if (await exists(oldWbDir)) {
        oldFileCount = (await readDir(oldWbDir)).filter((e) =>
          e.name?.endsWith(".json")
        ).length;
      }
      if (await exists(newWbDir)) {
        newFileCount = (await readDir(newWbDir)).filter((e) =>
          e.name?.endsWith(".json")
        ).length;
      }

      if (oldFileCount !== newFileCount) {
        throw new Error(
          `迁移校验失败：文件数量不一致 (旧: ${oldFileCount}, 新: ${newFileCount})`
        );
      }

      // 6. 清理旧路径：为了绝对安全，第一阶段仅重命名旧路径为 .bak，稳定运行一个版本后再物理删除
      const oldIndexFileBak = `${oldIndexFile}.migrated.bak`;
      await rename(oldIndexFile, oldIndexFileBak);

      if (await exists(oldWbDir)) {
        const oldWbDirBak = `${oldWbDir}.migrated.bak`;
        await rename(oldWbDir, oldWbDirBak);
      }

      logger.info("旧世界书数据已安全归档", { oldIndexFileBak });

      const { customMessage } = await import("@/utils/customMessage");
      customMessage.success("历史世界书数据已成功迁移至新路径！");
    } catch (error) {
      logger.error("世界书数据迁移失败，启动自动回滚！", error);
      const newModuleDir = await join(await getAppConfigDir(), MODULE_NAME);
      if (await exists(newModuleDir)) {
        await remove(newModuleDir, { recursive: true });
      }
      const { customMessage } = await import("@/utils/customMessage");
      customMessage.error("历史世界书数据迁移失败，已安全回滚。请检查日志。");
    }
  }

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
  async function saveWorldbookContent(
    id: string,
    content: STWorldbook
  ): Promise<void> {
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
  async function syncIndex(
    currentIndex: WorldbooksIndex
  ): Promise<WorldbookMetadata[]> {
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const appDir = await getAppConfigDir();
      const wbDir = await join(appDir, MODULE_NAME, WORLDBOOKS_SUBDIR);

      if (!(await exists(wbDir))) return [];

      const entries = await readDir(wbDir);
      const fileIds = entries
        .filter((e) => e.name?.endsWith(".json"))
        .map((e) => e.name!.replace(".json", ""));

      const indexMap = new Map(
        currentIndex.worldbooks.map((item) => [item.id, item])
      );
      const fileIdSet = new Set(fileIds);

      // 找出新增的文件
      const newIds = fileIds.filter((id) => !indexMap.has(id));
      const newItems: WorldbookMetadata[] = [];

      for (const id of newIds) {
        const content = await loadWorldbookContent(id);
        if (content) {
          // 尝试从 metadata 或 entries 推断名称
          const name =
            content.metadata?.name || `Worldbook ${id.substring(0, 6)}`;
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
      const validItems = currentIndex.worldbooks.filter((item) =>
        fileIdSet.has(item.id)
      );

      const syncedItems = [...validItems, ...newItems];

      if (
        newItems.length > 0 ||
        validItems.length !== currentIndex.worldbooks.length
      ) {
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
      errorHandler.handle(error as Error, {
        userMessage: "同步世界书索引失败",
        showToUser: false,
      });
      return currentIndex.worldbooks;
    }
  }

  return {
    triggerWorldbookDataMigration,
    loadIndex,
    saveIndex,
    loadWorldbookContent,
    saveWorldbookContent,
    deleteWorldbookFile,
    syncIndex,
  };
}
