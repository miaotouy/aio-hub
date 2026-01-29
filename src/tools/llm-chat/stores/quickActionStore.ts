/**
 * 快捷操作管理 Store
 */

import { defineStore } from "pinia";
import { useQuickActionStorage } from "../composables/storage/useQuickActionStorage";
import type { QuickActionSet, QuickActionSetMetadata } from "../types/quick-action";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getLocalISOString } from "@/utils/time";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { CHAT_STATE_KEYS, createChatSyncConfig } from "../types/sync";
import { toRef, watch } from "vue";

const logger = createModuleLogger("llm-chat/quickActionStore");
const errorHandler = createModuleErrorHandler("llm-chat/quickActionStore");

interface QuickActionStoreState {
  /** 快捷操作组元数据列表 */
  quickActionSets: QuickActionSetMetadata[];
  /** 已加载到内存的内容 (ID -> Content) */
  loadedSets: Map<string, QuickActionSet>;
}

export const useQuickActionStore = defineStore("llmChatQuickAction", {
  state: (): QuickActionStoreState => ({
    quickActionSets: [],
    loadedSets: new Map(),
  }),

  actions: {
    /**
     * 初始化状态同步
     */
    initializeSync() {
      const setsRef = toRef(this, "quickActionSets");
      const bus = useWindowSyncBus();

      useStateSyncEngine(setsRef, {
        ...createChatSyncConfig(CHAT_STATE_KEYS.QUICK_ACTION_INDEX as any),
      });

      if (bus.windowType !== "main") {
        bus.requestInitialState();
      }

      watch(
        () => this.quickActionSets,
        (newSets, oldSets) => {
          if (!oldSets || oldSets.length === 0) return;
          newSets.forEach((newSet) => {
            const oldSet = oldSets.find((s) => s.id === newSet.id);
            if (oldSet && oldSet.updatedAt !== newSet.updatedAt) {
              if (this.loadedSets.has(newSet.id)) {
                this.loadedSets.delete(newSet.id);
              }
            }
          });
        },
        { deep: true }
      );
    },

    /**
     * 加载所有快捷操作索引
     */
    async loadQuickActions() {
      try {
        const storage = useQuickActionStorage();
        const index = await storage.loadIndex();

        // 如果是空的，初始化默认值
        if (index.quickActionSets.length === 0) {
          logger.info("快捷操作索引为空，正在初始化默认配置");
          await this.initializeDefaultSets();
          return;
        }

        this.quickActionSets = await storage.syncIndex(index);
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "加载快捷操作索引失败" });
      }
    },

    /** 获取组内容 (带缓存) */
    async getQuickActionSet(id: string): Promise<QuickActionSet | null> {
      if (this.loadedSets.has(id)) {
        return this.loadedSets.get(id)!;
      }
      try {
        const storage = useQuickActionStorage();
        const content = await storage.loadSetContent(id);
        if (content) {
          this.loadedSets.set(id, content);
          return content;
        }
      } catch (error) {
        errorHandler.error(error, "获取快捷操作组内容失败", { id });
      }
      return null;
    },

    /** 保存组内容 */
    async saveSet(id: string) {
      const content = this.loadedSets.get(id);
      if (content) {
        try {
          const storage = useQuickActionStorage();
          await storage.saveSetContent(id, content);
        } catch (error) {
          errorHandler.error(error, "保存快捷操作组内容失败", { id });
        }
      }
    },

    /** 保存索引 */
    async saveIndex() {
      try {
        const storage = useQuickActionStorage();
        // 构造新的索引
        const sets: QuickActionSetMetadata[] = this.quickActionSets.map((meta) => {
          const loaded = this.loadedSets.get(meta.id);
          if (loaded) {
            return {
              id: loaded.id,
              name: loaded.name,
              description: loaded.description,
              actionCount: loaded.actions.length,
              isEnabled: loaded.isEnabled,
              updatedAt: loaded.updatedAt,
            };
          }
          return meta;
        });

        // 检查是否有新创建的组在 loadedSets 中但不在 sets 中
        for (const [id, content] of this.loadedSets.entries()) {
          if (!sets.find((s) => s.id === id)) {
            sets.push({
              id: content.id,
              name: content.name,
              description: content.description,
              actionCount: content.actions.length,
              isEnabled: content.isEnabled,
              updatedAt: content.updatedAt,
            });
          }
        }

        this.quickActionSets = sets;
        await storage.saveIndex({
          version: "1.0.0",
          quickActionSets: sets,
        });
      } catch (error) {
        errorHandler.error(error, "保存快捷操作索引失败");
      }
    },

    /** 创建新组 */
    async createQuickActionSet(name: string): Promise<string> {
      const id = `qa-${Date.now()}`;
      const newSet: QuickActionSet = {
        id,
        name,
        actions: [],
        isEnabled: true,
        updatedAt: getLocalISOString(),
      };

      this.loadedSets.set(id, newSet);
      await this.saveSet(id);
      await this.saveIndex();
      return id;
    },

    /** 重命名组 */
    async renameQuickActionSet(id: string, newName: string) {
      const set = await this.getQuickActionSet(id);
      if (set) {
        set.name = newName;
        set.updatedAt = getLocalISOString();
        await this.saveSet(id);
        await this.saveIndex();
      }
    },

    /** 更新组内容 */
    async updateQuickActionSet(id: string, updates: Partial<QuickActionSet>) {
      const set = await this.getQuickActionSet(id);
      if (set) {
        Object.assign(set, updates);
        set.updatedAt = getLocalISOString();
        await this.saveSet(id);
        // 如果名字变了，索引也需要更新
        await this.saveIndex();
      }
    },

    /** 删除组 */
    async deleteQuickActionSet(id: string) {
      const index = this.quickActionSets.findIndex((s) => s.id === id);
      if (index !== -1) {
        this.quickActionSets.splice(index, 1);
        this.loadedSets.delete(id);
        const storage = useQuickActionStorage();
        await storage.deleteSetFile(id);
        await this.saveIndex();
      }
    },

    /** 批量删除组 */
    async deleteQuickActionSets(ids: string[]) {
      const storage = useQuickActionStorage();
      for (const id of ids) {
        const index = this.quickActionSets.findIndex((s) => s.id === id);
        if (index !== -1) {
          this.quickActionSets.splice(index, 1);
          this.loadedSets.delete(id);
          await storage.deleteSetFile(id);
        }
      }
      await this.saveIndex();
    },

    /** 克隆组 */
    async duplicateQuickActionSet(id: string): Promise<string | null> {
      const source = await this.getQuickActionSet(id);
      if (!source) return null;

      const newId = `qa-${Date.now()}`;
      const newSet: QuickActionSet = JSON.parse(JSON.stringify(source));
      newSet.id = newId;
      newSet.name = `${source.name} (副本)`;
      newSet.updatedAt = getLocalISOString();

      this.loadedSets.set(newId, newSet);
      await this.saveSet(newId);
      await this.saveIndex();
      return newId;
    },

    /**
     * 获取所有激活的 Actions（聚合）
     */
    async getActiveActions(ids: string[]): Promise<QuickActionSet[]> {
      const results: QuickActionSet[] = [];
      for (const id of ids) {
        const content = await this.getQuickActionSet(id);
        if (content && content.isEnabled) {
          results.push(content);
        }
      }
      return results;
    },

    /**
     * 初始化默认组
     */
    async initializeDefaultSets() {
      const defaultSets: QuickActionSet[] = [
        {
          id: "qa-code-helper",
          name: "代码助手",
          description: "优化代码交流的快捷操作",
          isEnabled: true,
          updatedAt: getLocalISOString(),
          actions: [
            {
              id: "wrap-hidden-code",
              label: "包入隐藏代码块",
              content: "<!--\n```\n{{input}}\n```\n-->\n\n\n",
              autoSend: false,
              icon: "Code",
            },
            {
              id: "append-hidden-code",
              label: "追加隐藏代码块",
              content: "{{input}}\n\n<!--\n```\n\n```\n-->\n\n\n",
              autoSend: false,
              icon: "PlusCircle",
            },
            {
              id: "full-code-update",
              label: "完整代码",
              content: "{{input}}\n\n合并更新刚才讨论的内容到对应的最新完整版本，让我一键复制。",
              autoSend: true,
              icon: "FileCode",
            },
          ],
        },
        {
          id: "qa-common-tools",
          name: "通用工具",
          description: "常用文本包装工具",
          isEnabled: true,
          updatedAt: getLocalISOString(),
          actions: [
            {
              id: "html-details",
              label: "HTML 折叠",
              content: "<details>\n<summary>点击展开内容</summary>\n\n{{input}}\n\n</details>",
              autoSend: false,
              icon: "ChevronDownSquare",
            },
            {
              id: "quote-text",
              label: "引用",
              content: "> {{input}}",
              autoSend: false,
              icon: "Quote",
            },
          ],
        },
      ];

      for (const set of defaultSets) {
        this.loadedSets.set(set.id, set);
        await this.saveSet(set.id);
      }
      await this.saveIndex();
    },
  },
});
