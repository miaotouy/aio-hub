/**
 * 世界书管理 Store
 */

import { defineStore } from "pinia";
import { useWorldbookStorageSeparated } from "../composables/storage/useWorldbookStorageSeparated";
import type { STWorldbook, WorldbookMetadata } from "../types/worldbook";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getLocalISOString } from "@/utils/time";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { CHAT_STATE_KEYS, createChatSyncConfig } from "../types/sync";
import { toRef, watch } from "vue";

const logger = createModuleLogger("llm-chat/worldbookStore");
const errorHandler = createModuleErrorHandler("llm-chat/worldbookStore");

interface WorldbookStoreState {
  /** 世界书元数据列表 */
  worldbooks: WorldbookMetadata[];
  /** 已加载到内存的世界书内容 (ID -> Content) */
  loadedWorldbooks: Map<string, STWorldbook>;
}

export const useWorldbookStore = defineStore("llmChatWorldbook", {
  state: (): WorldbookStoreState => ({
    worldbooks: [],
    loadedWorldbooks: new Map(),
  }),

  actions: {
    /**
     * 初始化状态同步
     */
    initializeSync() {
      const worldbooksRef = toRef(this, "worldbooks");
      const bus = useWindowSyncBus();

      // 使用状态同步引擎同步世界书索引
      useStateSyncEngine(worldbooksRef, {
        ...createChatSyncConfig(CHAT_STATE_KEYS.WORLDBOOK_INDEX as any),
      });

      // 如果是分离窗口，主动请求初始状态
      if (bus.windowType !== "main") {
        logger.info("分离窗口主动请求世界书初始状态");
        bus.requestInitialState();
      }

      // 监听索引变化，如果某个世界书的 updatedAt 变了，说明内容可能变了，清除对应缓存
      // 这确保了跨窗口修改内容后，其他窗口能读取到最新磁盘内容
      watch(
        () => this.worldbooks,
        (newWbs, oldWbs) => {
          if (!oldWbs || oldWbs.length === 0) return;

          newWbs.forEach((newWb) => {
            const oldWb = oldWbs.find((w) => w.id === newWb.id);
            if (oldWb && oldWb.updatedAt !== newWb.updatedAt) {
              if (this.loadedWorldbooks.has(newWb.id)) {
                logger.info("检测到世界书更新，清除缓存以重新加载", { id: newWb.id, name: newWb.name });
                this.loadedWorldbooks.delete(newWb.id);
              }
            }
          });
        },
        { deep: true }
      );

      logger.info("世界书 Store 状态同步已初始化");
    },

    /**
     * 加载所有世界书索引
     */
    async loadWorldbooks() {
      try {
        const storage = useWorldbookStorageSeparated();
        const index = await storage.loadIndex();
        this.worldbooks = await storage.syncIndex(index);
        logger.info("世界书索引加载成功", { count: this.worldbooks.length });
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "加载世界书索引失败" });
      }
    },

    /**
     * 获取世界书内容 (带缓存加载)
     */
    async getWorldbookContent(id: string): Promise<STWorldbook | null> {
      if (this.loadedWorldbooks.has(id)) {
        return this.loadedWorldbooks.get(id)!;
      }

      const storage = useWorldbookStorageSeparated();
      const content = await storage.loadWorldbookContent(id);
      if (content) {
        this.loadedWorldbooks.set(id, content);
        return content;
      }
      return null;
    },

    /**
     * 为 Agent 获取所有关联的世界书条目
     * 确保返回的世界书包含正确的元数据名称
     */
    async getEntriesForAgent(worldbookIds: string[]): Promise<STWorldbook[]> {
      // 确保索引已加载，否则无法获取世界书名称
      if (this.worldbooks.length === 0) {
        await this.loadWorldbooks();
      }

      const results: STWorldbook[] = [];
      for (const id of worldbookIds) {
        // 先检查索引中是否存在该世界书，如果不存在则跳过，避免产生文件不存在的警告
        const metadata = this.worldbooks.find((wb) => wb.id === id);
        if (!metadata) {
          logger.debug("跳过不存在于索引中的世界书 ID", { id });
          continue;
        }

        const content = await this.getWorldbookContent(id);
        if (content) {
          // 从索引中获取世界书名称，确保 metadata.name 被正确设置
          content.metadata = {
            ...content.metadata,
            name: metadata.name,
            description: metadata.description,
          };
          results.push(content);
        }
      }
      return results;
    },

    /**
     * 创建或导入世界书
     */
    async importWorldbook(name: string, content: STWorldbook, description?: string): Promise<string> {
      const id = `wb-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const now = getLocalISOString();

      const metadata: WorldbookMetadata = {
        id,
        name,
        description: description || content.metadata?.description,
        entryCount: Object.keys(content.entries).length,
        createdAt: now,
        updatedAt: now,
      };

      try {
        const storage = useWorldbookStorageSeparated();
        // 保存内容
        await storage.saveWorldbookContent(id, content);

        // 更新索引
        this.worldbooks.push(metadata);
        const index = await storage.loadIndex();
        index.worldbooks = this.worldbooks;
        await storage.saveIndex(index);

        // 存入缓存
        this.loadedWorldbooks.set(id, content);

        logger.info("世界书导入成功", { id, name });
        return id;
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "导入世界书失败" });
        throw error;
      }
    },

    /**
     * 更新世界书内容
     */
    async updateWorldbook(id: string, content: STWorldbook, updates?: Partial<WorldbookMetadata>) {
      const index = this.worldbooks.findIndex((wb) => wb.id === id);
      if (index === -1) return;

      const now = getLocalISOString();
      const metadata = this.worldbooks[index];

      const newMetadata: WorldbookMetadata = {
        ...metadata,
        ...updates,
        entryCount: Object.keys(content.entries).length,
        updatedAt: now,
      };

      try {
        const storage = useWorldbookStorageSeparated();
        await storage.saveWorldbookContent(id, content);

        this.worldbooks[index] = newMetadata;
        const indexConfig = await storage.loadIndex();
        indexConfig.worldbooks = this.worldbooks;
        await storage.saveIndex(indexConfig);

        this.loadedWorldbooks.set(id, content);
        logger.info("世界书更新成功", { id });
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "更新世界书失败" });
      }
    },

    /**
     * 创建空白世界书
     */
    async createWorldbook(name: string): Promise<string> {
      const emptyContent: STWorldbook = {
        entries: {},
      };
      return await this.importWorldbook(name, emptyContent);
    },

    /**
     * 重命名世界书
     */
    async renameWorldbook(id: string, newName: string) {
      const index = this.worldbooks.findIndex((wb) => wb.id === id);
      if (index === -1) return;

      const now = getLocalISOString();
      this.worldbooks[index] = {
        ...this.worldbooks[index],
        name: newName,
        updatedAt: now,
      };

      try {
        const storage = useWorldbookStorageSeparated();
        const indexConfig = await storage.loadIndex();
        indexConfig.worldbooks = this.worldbooks;
        await storage.saveIndex(indexConfig);
        logger.info("世界书重命名成功", { id, newName });
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "重命名世界书失败" });
      }
    },

    /**
     * 克隆世界书
     */
    async duplicateWorldbook(id: string): Promise<string | null> {
      const original = this.worldbooks.find((wb) => wb.id === id);
      if (!original) return null;

      const content = await this.getWorldbookContent(id);
      if (!content) return null;

      const newName = `${original.name} (副本)`;
      return await this.importWorldbook(newName, content, original.description);
    },

    /**
     * 删除世界书
     */
    async deleteWorldbook(id: string) {
      try {
        const storage = useWorldbookStorageSeparated();
        await storage.deleteWorldbookFile(id);

        this.worldbooks = this.worldbooks.filter((wb) => wb.id !== id);
        this.loadedWorldbooks.delete(id);

        const index = await storage.loadIndex();
        index.worldbooks = this.worldbooks;
        await storage.saveIndex(index);

        logger.info("世界书已删除", { id });
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "删除世界书失败" });
      }
    },

    /**
     * 批量删除世界书
     */
    async deleteWorldbooks(ids: string[]) {
      try {
        const storage = useWorldbookStorageSeparated();

        // 1. 并行删除物理文件
        await Promise.all(ids.map((id) => storage.deleteWorldbookFile(id)));

        // 2. 更新内存状态
        const idSet = new Set(ids);
        this.worldbooks = this.worldbooks.filter((wb) => !idSet.has(wb.id));
        ids.forEach((id) => this.loadedWorldbooks.delete(id));

        // 3. 更新索引 (只写一次)
        const index = await storage.loadIndex();
        index.worldbooks = this.worldbooks;
        await storage.saveIndex(index);

        logger.info("批量删除世界书成功", { count: ids.length });
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "批量删除世界书失败" });
      }
    },
  },
});
