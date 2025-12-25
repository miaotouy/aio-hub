/**
 * 世界书管理 Store
 */

import { defineStore } from "pinia";
import { useWorldbookStorageSeparated } from "./composables/useWorldbookStorageSeparated";
import type { STWorldbook, WorldbookMetadata } from "./types/worldbook";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getLocalISOString } from "@/utils/time";

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
     */
    async getEntriesForAgent(worldbookIds: string[]): Promise<STWorldbook[]> {
      const results: STWorldbook[] = [];
      for (const id of worldbookIds) {
        const content = await this.getWorldbookContent(id);
        if (content) {
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
      const index = this.worldbooks.findIndex(wb => wb.id === id);
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
     * 删除世界书
     */
    async deleteWorldbook(id: string) {
      try {
        const storage = useWorldbookStorageSeparated();
        await storage.deleteWorldbookFile(id);

        this.worldbooks = this.worldbooks.filter(wb => wb.id !== id);
        this.loadedWorldbooks.delete(id);

        const index = await storage.loadIndex();
        index.worldbooks = this.worldbooks;
        await storage.saveIndex(index);

        logger.info("世界书已删除", { id });
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "删除世界书失败" });
      }
    }
  }
});