import { defineStore } from "pinia";
import { watch, shallowRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  KnowledgeBaseIndex,
  KnowledgeBaseMeta,
  Caiu,
  WorkspaceConfig,
  RetrievalEngineInfo,
  KbMonitorMessage,
  KbMessageType,
} from "../types";
import { DEFAULT_WORKSPACE_CONFIG, getKnowledgeSettingsConfig } from "../config";
import { cloneDeep } from "lodash-es";
import { kbStorage, type WorkspaceData } from "../utils/kbStorage";
import { getPureModelId } from "../utils/kbUtils";
import { performVectorSearch } from "../core/kbIndexer";
import { vectorCacheManager } from "../utils/vectorCache";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { LlmProfile } from "@/types/llm-profiles";

const errorHandler = createModuleErrorHandler("knowledge-base-store");
const logger = createModuleLogger("knowledge-base-store");

export const useKnowledgeBaseStore = defineStore("knowledgeBase", {
  state: () => ({
    /** 全局工作区数据 */
    workspace: null as WorkspaceData | null,
    /** 知识库列表索引 (从 workspace 同步) */
    bases: [] as KnowledgeBaseIndex[],
    /** 当前激活的知识库 ID */
    activeBaseId: null as string | null,
    /** 当前激活的知识库元数据 */
    activeBaseMeta: null as KnowledgeBaseMeta | null,
    /** 条目 ID 列表 (用于列表展示) */
    loadedEntryIds: [] as string[],
    /** 条目缓存 (Map 存储 ID -> Caiu) */
    entriesCache: new Map<string, Caiu>(),
    /** 当前选中的条目 ID */
    activeEntryId: null as string | null,
    /** 工作区配置 (从 workspace.config 同步) */
    config: cloneDeep(DEFAULT_WORKSPACE_CONFIG) as WorkspaceConfig,
    /** 全局加载状态 */
    loading: false,
    /** 向量化进度 */
    indexingProgress: {
      total: 0,
      current: 0,
      isIndexing: false,
      shouldStop: false,
      /** 失败详情记录: id -> reason */
      failedDetails: new Map<string, string>(),
    },
    /** 当前库在当前模型下已向量化的条目 ID 集合 */
    vectorizedIds: new Set<string>(),
    /** 正在向量化中的条目 ID 集合 (内存状态) */
    pendingIds: new Set<string>(),
    /** 向量化失败的条目 ID 集合 (内存状态) */
    failedIds: new Set<string>(),
    /** 可用的检索引擎列表 */
    engines: [] as RetrievalEngineInfo[],
    /** 搜索设置 */
    searchSettings: {
      engineId: "keyword",
      texture: "coarse" as "coarse" | "fine",
      refractionIndex: 0.5,
      requiredTags: [] as string[],
    },
    /** 全局统计信息 */
    globalStats: {
      totalEntries: 0,
      vectorizedEntries: 0,
      totalTags: 0,
      vectorizedTags: 0,
      tagPoolSize: 0,
      allDiscoveredTags: [] as string[],
      tagUsageStats: {} as Record<string, number>,
      /** 每个知识库的详细统计 */
      basesStats: {} as Record<string, { total: number; vectorized: number }>,
      lastUpdated: 0,
      lastModelId: "",
    },
    /** 知识库排序配置 */
    baseSort: {
      field: "updatedAt" as "updatedAt" | "name" | "entryCount",
      order: "desc" as "asc" | "desc",
    },
    /** 条目排序配置 */
    entrySort: {
      field: "updatedAt" as "updatedAt" | "key" | "priority",
      order: "desc" as "asc" | "desc",
    },
    /** 监控系统状态 */
    monitor: {
      logs: shallowRef<KbMonitorMessage[]>([]),
      buffer: [] as KbMonitorMessage[], // 临时缓冲区
      isPaused: false,
      filter: {
        keyword: "",
        level: null as string | null,
        module: null as string | null,
        type: null as KbMessageType | null,
      },
      stats: {
        logsPerMinute: 0,
        errorRate: 0,
        lastUpdate: 0,
        typeDistribution: {
          RAG: 0,
          Index: 0,
          System: 0,
          Chain: 0,
        },
        avgRagDuration: 0,
        ragDurationHistory: [] as number[],
      },
      maxCapacity: 1000,
    },
  }),

  getters: {
    /** 当前选中的条目对象 */
    activeEntry: (state) => {
      if (!state.activeEntryId) return null;
      return state.entriesCache.get(state.activeEntryId) || null;
    },
    /**
     * 排序后的知识库列表
     */
    sortedBases: (state) => {
      const { field, order } = state.baseSort;
      return [...state.bases].sort((a, b) => {
        let result = 0;
        if (field === "name") {
          result = a.name.localeCompare(b.name, "zh-CN");
        } else {
          result = (a[field] || 0) - (b[field] || 0);
        }
        return order === "asc" ? result : -result;
      });
    },
    /**
     * 排序后的条目列表 (基于 meta 中的索引项)
     */
    sortedEntries: (state) => {
      if (!state.activeBaseMeta?.entries) return [];
      const { field, order } = state.entrySort;
      return [...state.activeBaseMeta.entries].sort((a, b) => {
        let result = 0;
        if (field === "key") {
          result = a.key.localeCompare(b.key, "zh-CN");
        } else {
          result = (a[field] || 0) - (b[field] || 0);
        }
        return order === "asc" ? result : -result;
      });
    },

    /**
     * 获取合成后的设置配置 (包含动态引擎参数)
     */
    settingsConfig: (state) => {
      return getKnowledgeSettingsConfig(state.engines);
    },

    /**
     * 当前库的统计信息 (基于全局统计中的数据，更准确)
     */
    activeBaseStats: (state) => {
      if (!state.activeBaseMeta?.entries || !state.activeBaseId) return null;
      const entries = state.activeBaseMeta.entries;
      const total = entries.length;

      // 使用内存中的 ID 集合计算统计信息
      const indexed = state.vectorizedIds.size;
      const pending = state.pendingIds.size;
      const failed = state.failedIds.size;

      let totalChars = 0;
      state.entriesCache.forEach((e) => {
        totalChars += e.content.length;
      });

      return {
        total,
        indexed,
        pending,
        failed,
        indexedRate: total > 0 ? (indexed / total) * 100 : 0,
        totalChars,
        updatedAt: state.activeBaseMeta.updatedAt,
        createdAt: state.activeBaseMeta.createdAt,
      };
    },
  },

  actions: {
    /**
     * 初始化工作区
     */
    async init() {
      this.loading = true;
      try {
        // 1. 优先加载本地索引 (显示列表) - 快速显示
        await this.loadBases();

        // 2. 后端初始化目录结构 (同步，很快)
        await invoke("kb_initialize");

        // 3. 加载引擎列表 (同步，很快)
        await this.loadEngines();

        // 4. 后端预热 (异步，不阻塞) - 在后台加载完整数据
        invoke("kb_warmup").catch((e) => {
          errorHandler.error(e, "后台预热失败", { showToUser: false });
        });
      } catch (e) {
        errorHandler.error(e, "初始化知识库失败");
      } finally {
        this.loading = false;
      }
    },

    /**
     * 加载知识库列表及配置
     */
    async loadBases() {
      try {
        const workspace = await kbStorage.loadWorkspace();
        this.workspace = workspace;
        this.bases = workspace.bases;
        this.config = workspace.config;

        // 监听模型变化，自动校验状态
        // 使用 watch 替代 $subscribe 以确保更可靠的联动
        watch(
          () => this.config.defaultEmbeddingModel,
          (newModel, oldModel) => {
            if (newModel && newModel !== oldModel) {
              logger.info("检测到默认模型变化，触发状态校验", { newModel, oldModel });
              this.validateVectorStatus();
            }
          }
        );
      } catch (e) {
        errorHandler.error(e, "加载工作区失败");
      }
    },

    /**
     * 保存工作区数据 (包含索引、配置、最后激活项等)
     */
    async saveWorkspace() {
      if (!this.workspace) return;
      this.workspace.config = this.config;
      await kbStorage.saveWorkspace(this.workspace);
    },

    /**
     * 重置配置
     */
    async resetConfig() {
      this.config = cloneDeep(DEFAULT_WORKSPACE_CONFIG);
      await this.saveWorkspace();
    },

    /**
     * 同步当前库的元数据和全局索引
     */
    async syncBaseMeta() {
      if (!this.activeBaseId || !this.activeBaseMeta || !this.workspace) return;

      const now = Date.now();
      this.activeBaseMeta.updatedAt = now;

      await kbStorage.saveBaseMeta(this.activeBaseId, this.activeBaseMeta);

      const idx = this.workspace.bases.findIndex((b) => b.id === this.activeBaseId);
      if (idx !== -1) {
        this.workspace.bases[idx].entryCount = this.activeBaseMeta.entries.length;
        this.workspace.bases[idx].updatedAt = now;
        await kbStorage.saveWorkspace(this.workspace);
      }
    },

    /**
     * 获取或加载条目内容
     */
    async getOrLoadEntry(entryId: string): Promise<Caiu | null> {
      if (this.entriesCache.has(entryId)) {
        return this.entriesCache.get(entryId)!;
      }
      if (!this.activeBaseId) return null;

      const modelId = getPureModelId(this.config.defaultEmbeddingModel);
      const entry = await kbStorage.loadEntry(this.activeBaseId, entryId, modelId);
      if (entry) {
        this.entriesCache.set(entryId, entry);
      }
      return entry;
    },

    /**
     * 通用搜索
     */
    async search(query: string, limit = 20) {
      if (!this.activeBaseId) return [];

      const engineId = this.searchSettings.engineId;
      const isVectorSearch = engineId === "vector" || engineId === "lens";

      if (isVectorSearch) {
        const comboId = this.config.defaultEmbeddingModel;
        if (!comboId) {
          customMessage.warning("请先在设置中配置默认 Embedding 模型");
          return [];
        }

        const [profileId] = comboId.split(":");
        const { profiles } = useLlmProfiles();
        const profile = profiles.value.find((p: LlmProfile) => p.id === profileId);
        if (!profile) {
          customMessage.error("未找到对应的模型配置 Profile");
          return [];
        }

        try {
          const startTime = Date.now();
          // 生成或获取缓存的查询向量
          const modelId = getPureModelId(comboId);
          const vector = await vectorCacheManager.getVector(query, profile, modelId);

          const results = await performVectorSearch({
            kbId: this.activeBaseId,
            query,
            comboId,
            profile,
            topK: limit,
            requestSettings: this.config.embeddingRequestSettings,
            extraFilters: {
              engineId,
              texture: this.searchSettings.texture,
              refractionIndex: this.searchSettings.refractionIndex,
              requiredTags: this.searchSettings.requiredTags,
            },
            vector_payload: vector, // 传递已生成的向量
          });

          const totalDuration = Date.now() - startTime;
          logger.info("向量搜索整体流程完成", {
            query,
            count: results.length,
            duration: `${totalDuration}ms`,
          });

          return results;
        } catch (e) {
          errorHandler.error(e, "搜索失败");
          return [];
        }
      } else {
        // 关键词搜索
        try {
          return await invoke<any[]>("kb_search", {
            query,
            filters: {
              kbIds: [this.activeBaseId],
              limit,
              engineId,
            },
            engineId,
          });
        } catch (e) {
          errorHandler.error(e, "搜索失败");
          return [];
        }
      }
    },

    /**
     * 加载可用的检索引擎
     */
    async loadEngines() {
      try {
        this.engines = await invoke<RetrievalEngineInfo[]>("kb_list_engines");
        logger.info("加载检索引擎列表成功", { engines: this.engines });
      } catch (e) {
        errorHandler.error(e, "加载检索引擎列表失败");
      }
    },

    /**
     * 校验并同步当前库的向量状态
     * 解决磁盘文件变动导致 UI 状态滞后的问题
     */
    async validateVectorStatus() {
      const modelId = getPureModelId(this.config.defaultEmbeddingModel);

      // 无论是否有激活库，只要模型变了，都应该尝试更新全局统计
      // updateGlobalStats(true) 会触发后端加载该模型的向量索引
      if (modelId) {
        // 优化：不阻塞当前库的状态校验，因为 updateGlobalStats(true) 涉及全量向量预热，非常耗时
        this.updateGlobalStats(true).catch((e) => {
          logger.warn("异步更新全局统计失败", e);
        });
      }

      if (!this.activeBaseId || !this.activeBaseMeta) return;

      if (!modelId) {
        this.vectorizedIds.clear();
        return;
      }

      try {
        // 直接从后端加载带模型匹配的元数据
        // 这比 kb_check_vector_coverage 更快，因为它利用了 meta.json 中的缓存和动态匹配逻辑
        const meta = await invoke<KnowledgeBaseMeta | null>("kb_load_base_meta", {
          kbId: this.activeBaseId,
          modelId: modelId,
        });

        if (meta) {
          this.activeBaseMeta = meta;
          const newVectorizedIds = new Set<string>();
          meta.entries.forEach((e) => {
            if (e.vectorStatus === "ready") {
              newVectorizedIds.add(e.id);
            }
          });
          this.vectorizedIds = newVectorizedIds;
          logger.info(`向量状态校验完成: ${this.vectorizedIds.size} 项已就绪 (基于模型列表匹配)`);
        }
      } catch (e) {
        logger.warn("校验向量状态失败", e);
      } finally {
        this.loading = false;
      }
    },

    /**
     * 批量加载所有知识库的向量数据到内存
     */
    async loadAllBasesVectors(modelId: string) {
      if (!modelId || this.bases.length === 0) return;

      logger.info(`[STATS] 开始批量加载所有库的向量数据: model=${modelId}`);
      // 并行加载，提高效率
      await Promise.allSettled(
        this.bases.map((base) => invoke("kb_load_model_vectors", { kbId: base.id, modelId }))
      );
    },

    /**
     * 统一更新统计信息的入口
     * 全部使用 pureModelId (不带渠道前缀)
     */
    async updateGlobalStats(force = false, targetModelId?: string) {
      // 统一提取 pureId
      const modelId = getPureModelId(targetModelId || this.config.defaultEmbeddingModel);
      if (!modelId) return;

      // 如果是强制刷新，先触发一次全量向量加载，确保后端内存数据是最新的
      if (force) {
        await this.loadAllBasesVectors(modelId);
      }

      // 1秒缓存逻辑
      if (
        !force &&
        this.globalStats.lastModelId === modelId &&
        Date.now() - this.globalStats.lastUpdated < 1000
      ) {
        return;
      }

      try {
        // 并行调用两个原子化的统计命令，全部传入 pureId
        const [libStats, poolStats] = await Promise.allSettled([
          invoke<any>("kb_get_library_stats", { modelId }),
          invoke<any>("kb_get_tag_pool_stats", { modelId }),
        ]);

        if (libStats.status === "fulfilled") {
          const stats = libStats.value;
          this.globalStats.totalEntries = stats.totalEntries ?? 0;
          this.globalStats.vectorizedEntries = stats.vectorizedEntries ?? 0;
          this.globalStats.allDiscoveredTags = stats.allDiscoveredTags ?? [];
          this.globalStats.tagUsageStats = stats.tagUsageStats ?? {};
          this.globalStats.basesStats = stats.basesStats ?? {};
          this.globalStats.totalTags = this.globalStats.allDiscoveredTags.length;
        }

        if (poolStats.status === "fulfilled") {
          const stats = poolStats.value;
          this.globalStats.vectorizedTags = stats.vectorizedTags ?? 0;
          this.globalStats.tagPoolSize = stats.tagPoolSize ?? 0;
        }

        this.globalStats.lastUpdated = Date.now();
        this.globalStats.lastModelId = modelId;

        // 如果是强制刷新且有激活库，顺便刷新一下当前库的条目向量状态集合
        // 这样可以确保统计信息和列表状态图标同步
        if (force && this.activeBaseId) {
          const meta = await invoke<KnowledgeBaseMeta | null>("kb_load_base_meta", {
            kbId: this.activeBaseId,
            modelId: modelId,
          });
          if (meta) {
            this.activeBaseMeta = meta;
            const newVectorizedIds = new Set<string>();
            meta.entries.forEach((e) => {
              if (e.vectorStatus === "ready") {
                newVectorizedIds.add(e.id);
              }
            });
            this.vectorizedIds = newVectorizedIds;
          }
        }

        logger.info("全局统计更新完成 (Pure ID Mode)", {
          modelId,
          vectorizedEntries: this.globalStats.vectorizedEntries,
          vectorizedTags: this.globalStats.vectorizedTags,
          activeBaseVectorized: this.vectorizedIds.size,
        });
      } catch (e) {
        logger.error("更新统计失败", e);
      }
    },
    /**
     * 停止正在进行的向量化任务
     */
    stopIndexing() {
      if (this.indexingProgress.isIndexing) {
        this.indexingProgress.shouldStop = true;
        customMessage.info("正在请求停止向量化任务...");
      }
    },

    /**
     * 清理当前库的冗余向量文件
     */
    async clearLegacyVectors() {
      if (!this.activeBaseId) return;

      const modelId = getPureModelId(this.config.defaultEmbeddingModel);
      if (!modelId) return;

      this.loading = true;
      try {
        const count = await invoke<number>("kb_clear_legacy_vectors", {
          kbId: this.activeBaseId,
          currentModel: modelId,
        });
        logger.info(`清理完成，删除了 ${count} 个冗余向量文件`);
        // 强制刷新统计
        await this.updateGlobalStats(true);
        return count;
      } catch (e) {
        errorHandler.error(e, "清理向量缓存失败");
      } finally {
        this.loading = false;
      }
    },

    /**
     * 全局清理非当前模型的所有向量文件
     */
    async clearAllOtherVectors() {
      const modelId = getPureModelId(this.config.defaultEmbeddingModel);
      if (!modelId) return;

      this.loading = true;
      try {
        const count = await invoke<number>("kb_clear_all_other_vectors", {
          keepModelId: modelId,
        });
        customMessage.success(`全局清理完成，共删除了 ${count} 个冗余向量文件`);
        // 强制刷新统计
        await this.updateGlobalStats(true);
        return count;
      } catch (e) {
        errorHandler.error(e, "全局清理向量失败");
      } finally {
        this.loading = false;
      }
    },
  },
});
