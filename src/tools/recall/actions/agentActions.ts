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
 * 思绪集 Agent 专用业务逻辑
 */

import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { invoke } from "@tauri-apps/api/core";
import { recallStorage } from "../utils/recallStorage";
import { calculateHash } from "../utils/recallUtils";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { getPureModelId, getProfileId } from "@/utils/modelIdUtils";
import { IndexingOrchestrator } from "../logic/orchestrator";
import type {
  UpsertEntryOptions,
  UpsertEntryResult,
  UpdateEntryContentOptions,
  UpdateEntryContentResult,
  DeleteEntryOptions,
  DeleteEntryResult,
  SearchEntriesOptions,
  SearchEntriesResult,
  BatchUpdateMetadataOptions,
  BatchUpdateMetadataResult,
  ListEntriesMetadataOptions,
  ListEntriesMetadataResult,
  ListRecallCollectionsOptions,
  ListRecallCollectionsResult,
  RecallEntry,
} from "../types";

const errorHandler = createModuleErrorHandler("recall/agent");
const logger = createModuleLogger("recall/agent");

/**
 * 辅助函数：解析思绪集 ID
 */
async function resolveRecallId(recallId?: string, recallName?: string): Promise<string> {
  if (recallId) return recallId;
  if (!recallName) throw new Error("必须提供 recallId 或 recallName 之一");

  const workspace = await recallStorage.loadWorkspace();
  const base = workspace.bases.find((b) => b.name === recallName);
  if (!base) {
    throw new Error(`未找到名称为 "${recallName}" 的思绪集`);
  }
  return base.id;
}

/**
 * 辅助函数：定位条目
 */
async function locateEntry(
  recallId: string,
  options: {
    entryId?: string;
    key?: string;
    searchQuery?: string;
    searchMode?: "keyword" | "vector";
  }
): Promise<RecallEntry> {
  const { entryId, key, searchQuery, searchMode = "keyword" } = options;

  if (entryId) {
    const entry = await recallStorage.loadEntry(recallId, entryId);
    if (!entry) throw new Error(`未找到 ID 为 "${entryId}" 的条目`);
    return entry;
  }

  if (key) {
    const meta = await recallStorage.loadBaseMeta(recallId);
    if (!meta) throw new Error("无法加载思绪集元数据");
    const item = meta.entries.find((e) => e.key === key);
    if (!item) {
      // 尝试模糊匹配标题
      const fuzzyItem = meta.entries.find((e) =>
        e.key.toLowerCase().includes(key.toLowerCase())
      );
      if (fuzzyItem) {
        logger.info(`通过模糊匹配找到条目: "${key}" -> "${fuzzyItem.key}"`);
        const entry = await recallStorage.loadEntry(recallId, fuzzyItem.id);
        if (entry) return entry;
      }
      throw new Error(`未找到标题为 "${key}" 的条目，请检查标题是否准确。`);
    }
    const entry = await recallStorage.loadEntry(recallId, item.id);
    if (!entry) throw new Error(`无法加载条目内容: ${item.id}`);
    return entry;
  }

  if (searchQuery) {
    // 调用搜索
    const results = await invoke<any[]>("recall_search", {
      query: searchQuery,
      filters: {
        recallIds: [recallId],
        limit: 1,
        engineId: searchMode,
        enabledOnly: true,
      },
      engineId: searchMode,
    });

    if (results.length === 0)
      throw new Error(`搜索未命中任何条目: "${searchQuery}"`);
    const entryId = results[0].entry?.id || results[0].id;
    const entry = await recallStorage.loadEntry(recallId, entryId);
    if (!entry) throw new Error(`无法加载搜索命中的条目内容: ${entryId}`);
    return entry;
  }

  throw new Error("必须提供 entryId, key 或 searchQuery 之一来定位条目");
}

/**
 * 1. upsertEntry（创建或更新条目）
 * 功能：创建新条目或更新已存在条目的完整内容。
 */
export async function upsertEntry(
  options: UpsertEntryOptions
): Promise<UpsertEntryResult> {
  try {
    const {
      key,
      content,
      tags,
      priority = 100,
      enabled = true,
      autoVectorize = false,
    } = options;
    const recallId = await resolveRecallId(options.recallId, options.recallName);

    logger.info("执行 upsertEntry", { key, recallId });

    // 1. 加载库元数据以查找现有条目
    const meta = await recallStorage.loadBaseMeta(recallId);
    if (!meta) throw new Error("无法加载思绪集元数据");

    const existingIndexItem = meta.entries.find((e) => e.key === key);
    let entry: RecallEntry;
    let isNew = false;

    const now = Date.now();
    const contentHash = await calculateHash(content);

    if (existingIndexItem) {
      // 加载完整条目
      const fullEntry = await recallStorage.loadEntry(recallId, existingIndexItem.id);
      if (!fullEntry)
        throw new Error(`无法加载条目内容: ${existingIndexItem.id}`);

      entry = {
        ...fullEntry,
        content,
        contentHash,
        tags: tags
          ? tags.map((t) => ({ name: t, weight: 1.0 }))
          : fullEntry.tags,
        priority: priority ?? fullEntry.priority,
        enabled: enabled ?? fullEntry.enabled,
        updatedAt: now,
      };
      isNew = false;
    } else {
      // 创建新条目
      entry = {
        id: crypto.randomUUID(),
        key,
        content,
        contentHash,
        tags: tags ? tags.map((t) => ({ name: t, weight: 1.0 })) : [],
        assets: [],
        priority,
        enabled,
        createdAt: now,
        updatedAt: now,
      };
      isNew = true;
    }

    // 2. 保存条目
    await recallStorage.saveEntry(recallId, entry);

    // 3. 处理向量化
    let vectorized = false;
    if (autoVectorize) {
      const store = useRecallCollectionStore();
      const comboId = store.config.defaultEmbeddingModel;

      if (comboId) {
        const { profiles } = useLlmProfiles();
        const profileId = getProfileId(comboId);
        const profile = profiles.value.find((p) => p.id === profileId);

        if (profile) {
          const orchestrator = new IndexingOrchestrator({
            requestSettings: store.config.embeddingRequestSettings,
          });

          await orchestrator.indexEntry({
            recallId,
            entry,
            modelId: getPureModelId(comboId),
            profile,
          });
          vectorized = true;

          // 更新统计
          store
            .updateGlobalStats(true)
            .catch((e) => logger.warn("更新统计失败", e));
        } else {
          logger.warn("未找到模型配置 Profile，跳过自动向量化");
        }
      } else {
        logger.warn("未配置默认 Embedding 模型，跳过自动向量化");
      }
    }

    // 4. 同步 Store (如果当前库是激活库)
    const store = useRecallCollectionStore();
    if (store.activeBaseId === recallId) {
      // 刷新元数据
      store
        .validateVectorStatus()
        .catch((e) => logger.warn("同步 Store 失败", e));
    }

    return {
      success: true,
      entryId: entry.id,
      recallId,
      isNew,
      vectorized,
      message: isNew ? `成功创建条目 "${key}"` : `成功更新条目 "${key}"`,
    };
  } catch (error) {
    // Agent 调用的错误：静默处理，只记录日志，通过返回值传递错误信息
    errorHandler.handle(error, {
      showToUser: false,
      context: { action: "upsertEntry", options },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: `创建或更新条目失败: ${error instanceof Error ? error.message : String(error)}`,
    } as UpsertEntryResult;
  }
}

/**
 * 2. updateEntryContent（更新条目内容）
 * 功能：支持精确替换模式和搜索替换模式更新条目内容。
 */
export async function updateEntryContent(
  options: UpdateEntryContentOptions
): Promise<UpdateEntryContentResult> {
  try {
    const {
      targetContent,
      replaceWith,
      replaceContent,
      replaceKey,
      replaceTags,
      replacePriority,
      dryRun = false,
      autoVectorize = false,
    } = options;
    const recallId = await resolveRecallId(options.recallId, options.recallName);
    const mode = targetContent ? "exact" : "search";

    logger.info("执行 updateEntryContent", { recallId, mode, dryRun });

    // 1. 定位条目
    const entry = await locateEntry(recallId, options);
    const changes: string[] = [];
    let oldContentSnippet: string | undefined;
    let newContentSnippet: string | undefined;
    let finalContent = entry.content;

    // 2. 执行替换
    if (mode === "exact") {
      if (!targetContent || !replaceWith)
        throw new Error("精确替换模式必须提供 targetContent 和 replaceWith");
      if (targetContent.length < 15)
        throw new Error("targetContent 必须至少 15 个字符以确保匹配精度");

      const matchIndex = entry.content.indexOf(targetContent);
      if (matchIndex === -1)
        throw new Error("未在条目内容中找到指定的 targetContent 片段");

      oldContentSnippet = targetContent;
      newContentSnippet = replaceWith;
      finalContent =
        entry.content.slice(0, matchIndex) +
        replaceWith +
        entry.content.slice(matchIndex + targetContent.length);
      changes.push("精确内容替换");
    } else {
      // 搜索替换模式 / 整体替换
      if (replaceContent !== undefined) {
        finalContent = replaceContent;
        changes.push("更新条目内容");
      }
      if (replaceKey !== undefined) {
        entry.key = replaceKey;
        changes.push("更新条目标题");
      }
      if (replaceTags !== undefined) {
        entry.tags = replaceTags.map((t) => ({ name: t, weight: 1.0 }));
        changes.push("更新标签");
      }
      if (replacePriority !== undefined) {
        entry.priority = replacePriority;
        changes.push("更新优先级");
      }
    }

    if (changes.length === 0) throw new Error("未指定任何变更内容");

    // 3. 执行保存
    if (!dryRun) {
      entry.content = finalContent;
      entry.contentHash = await calculateHash(finalContent);
      entry.updatedAt = Date.now();
      await recallStorage.saveEntry(recallId, entry);

      // 4. 处理向量化
      if (autoVectorize) {
        const store = useRecallCollectionStore();
        const comboId = store.config.defaultEmbeddingModel;
        if (comboId) {
          const { profiles } = useLlmProfiles();
          const profileId = getProfileId(comboId);
          const profile = profiles.value.find((p) => p.id === profileId);
          if (profile) {
            const orchestrator = new IndexingOrchestrator({
              requestSettings: store.config.embeddingRequestSettings,
            });
            await orchestrator.indexEntry({
              recallId,
              entry,
              modelId: getPureModelId(comboId),
              profile,
            });
            store
              .updateGlobalStats(true)
              .catch((e) => logger.warn("更新统计失败", e));
          }
        }
      }

      // 5. 同步 Store
      const store = useRecallCollectionStore();
      if (store.activeBaseId === recallId) {
        store
          .validateVectorStatus()
          .catch((e) => logger.warn("同步 Store 失败", e));
      }
    }

    return {
      success: true,
      mode,
      matchedCount: 1,
      replacedCount: dryRun ? 0 : 1,
      entries: [
        {
          id: entry.id,
          key: entry.key,
          // 仅在片段替换模式下返回具体内容，避免全量替换时返回过长字符串
          oldContent: mode === "exact" ? oldContentSnippet : undefined,
          newContent: mode === "exact" ? newContentSnippet : undefined,
          changes,
        },
      ],
      message: dryRun
        ? `预览模式：条目 "${entry.key}" 匹配成功，待执行变更: ${changes.join(", ")}`
        : `条目 "${entry.key}" 更新成功: ${changes.join(", ")}`,
    };
  } catch (error) {
    errorHandler.handle(error, {
      showToUser: false,
      context: { action: "updateEntryContent", options },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: `更新条目内容失败: ${error instanceof Error ? error.message : String(error)}`,
    } as UpdateEntryContentResult;
  }
}

/**
 * 3. deleteEntry（删除条目）
 */
export async function deleteEntry(
  options: DeleteEntryOptions
): Promise<DeleteEntryResult> {
  try {
    const { confirm = false } = options;
    const recallId = await resolveRecallId(options.recallId, options.recallName);

    logger.info("执行 deleteEntry", {
      recallId,
      entryId: options.entryId,
      key: options.key,
    });

    if (!confirm) {
      throw new Error("请设置 confirm: true 以确认删除操作");
    }

    // 1. 定位条目
    const entry = await locateEntry(recallId, options);

    // 2. 执行删除
    await recallStorage.deleteEntry(recallId, entry.id);

    // 3. 同步 Store
    const store = useRecallCollectionStore();
    if (store.activeBaseId === recallId) {
      // 刷新元数据
      store
        .validateVectorStatus()
        .catch((e) => logger.warn("同步 Store 失败", e));
      // 如果删除的是当前选中的条目，清空选中
      if (store.activeEntryId === entry.id) {
        store.activeEntryId = null;
      }
    }

    return {
      success: true,
      deletedId: entry.id,
      deletedKey: entry.key,
      message: "条目已成功删除",
    };
  } catch (error) {
    errorHandler.handle(error, {
      showToUser: false,
      context: { action: "deleteEntry", options },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: `删除条目失败: ${error instanceof Error ? error.message : String(error)}`,
    } as DeleteEntryResult;
  }
}

/**
 * 4. searchEntries（搜索条目）
 */
export async function searchEntries(
  options: SearchEntriesOptions
): Promise<SearchEntriesResult> {
  try {
    const {
      query,
      engineId = "keyword",
      limit = 10,
      minScore,
      tags,
      enabledOnly = true,
    } = options;

    // 解析思绪集 ID 列表
    const recallIds: string[] = [];
    if (options.recallIds) recallIds.push(...options.recallIds);
    if (options.recallNames) {
      const workspace = await recallStorage.loadWorkspace();
      for (const name of options.recallNames) {
        const base = workspace.bases.find((b) => b.name === name);
        if (base) recallIds.push(base.id);
      }
    }

    logger.info("执行 searchEntries", { query, recallIds, engineId });

    // 1. 执行搜索
    const results = await invoke<any[]>("recall_search", {
      query,
      filters: {
        recallIds: recallIds.length > 0 ? recallIds : undefined,
        tags,
        minScore,
        limit,
        engineId,
        enabledOnly,
      },
      engineId,
    });

    // 2. 格式化结果
    const formattedResults = results.map((r, index) => ({
      index: index + 1, // 提供 1-based 序号方便 Agent 引用
      id: r.entry?.id || r.id,
      key: r.entry?.key || r.key,
      content: r.entry?.content || r.content || "",
      summary: r.entry?.summary || r.summary || "",
      score: r.score || 0,
      recallId: r.recallId,
      recallName: r.recallName,
      tags: r.entry?.tags?.map((t: any) => t.name) || r.tags || [],
      highlight: r.highlight,
    }));

    return {
      success: true,
      count: formattedResults.length,
      results: formattedResults,
      message:
        formattedResults.length > 0
          ? `搜索完成，找到 ${formattedResults.length} 条结果。你可以通过 "index" 序号或 "key" 标题来引用这些条目。`
          : "未找到匹配的条目，请尝试调整关键词。",
    };
  } catch (error) {
    errorHandler.handle(error, {
      showToUser: false,
      context: { action: "searchEntries", options },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: `搜索条目失败: ${error instanceof Error ? error.message : String(error)}`,
    } as SearchEntriesResult;
  }
}

/**
 * 5. batchUpdateMetadata（批量更新元数据）
 */
export async function batchUpdateMetadata(
  options: BatchUpdateMetadataOptions
): Promise<BatchUpdateMetadataResult> {
  try {
    const { entryIds, enabled, priority, addTags, removeTags } = options;
    const recallId = await resolveRecallId(options.recallId, options.recallName);

    logger.info("执行 batchUpdateMetadata", { recallId, count: entryIds.length });

    if (entryIds.length > 100) {
      throw new Error("单次批量更新数量不能超过 100 条");
    }

    let updatedCount = 0;
    const now = Date.now();

    for (const id of entryIds) {
      const entry = await recallStorage.loadEntry(recallId, id);
      if (!entry) {
        logger.warn(`批量更新中跳过未找到的条目: ${id}`);
        continue;
      }

      let changed = false;
      if (enabled !== undefined) {
        entry.enabled = enabled;
        changed = true;
      }
      if (priority !== undefined) {
        entry.priority = priority;
        changed = true;
      }
      if (addTags && addTags.length > 0) {
        const currentTagNames = entry.tags.map((t) => t.name);
        for (const tag of addTags) {
          if (!currentTagNames.includes(tag)) {
            entry.tags.push({ name: tag, weight: 1.0 });
            changed = true;
          }
        }
      }
      if (removeTags && removeTags.length > 0) {
        const originalLength = entry.tags.length;
        entry.tags = entry.tags.filter((t) => !removeTags.includes(t.name));
        if (entry.tags.length !== originalLength) {
          changed = true;
        }
      }

      if (changed) {
        entry.updatedAt = now;
        await recallStorage.saveEntry(recallId, entry);
        updatedCount++;
      }
    }

    // 同步 Store
    const store = useRecallCollectionStore();
    if (store.activeBaseId === recallId) {
      store
        .validateVectorStatus()
        .catch((e) => logger.warn("同步 Store 失败", e));
    }

    return {
      success: true,
      updatedCount,
      message: `批量更新完成，成功更新 ${updatedCount} 条条目`,
    };
  } catch (error) {
    errorHandler.handle(error, {
      showToUser: false,
      context: { action: "batchUpdateMetadata", options },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: `批量更新元数据失败: ${error instanceof Error ? error.message : String(error)}`,
    } as BatchUpdateMetadataResult;
  }
}

/**
 * 6. listEntriesMetadata（查询条目元数据）
 */
export async function listEntriesMetadata(
  options: ListEntriesMetadataOptions
): Promise<ListEntriesMetadataResult> {
  try {
    const {
      query,
      tags,
      enabled,
      vectorStatus,
      limit = 50,
      offset = 0,
      sortBy = "updatedAt",
      sortOrder = "desc",
    } = options;
    const recallId = await resolveRecallId(options.recallId, options.recallName);

    logger.info("执行 listEntriesMetadata", {
      recallId,
      query,
      tags,
      limit,
      offset,
    });

    // 限制单次查询数量
    const actualLimit = Math.min(limit, 200);

    // 1. 加载库元数据以获取索引
    const meta = await recallStorage.loadBaseMeta(recallId);
    if (!meta) throw new Error("无法加载思绪集元数据");

    // 2. 过滤条目
    let filteredEntries = [...meta.entries];

    // 标题关键词搜索
    if (query && query.trim()) {
      const lowerQuery = query.toLowerCase();
      filteredEntries = filteredEntries.filter((e) =>
        e.key.toLowerCase().includes(lowerQuery)
      );
    }

    // 标签过滤 (AND 逻辑)
    if (tags && tags.length > 0) {
      filteredEntries = filteredEntries.filter((e) =>
        tags.every((tag) => e.tags.includes(tag))
      );
    }

    // 启用状态过滤
    if (enabled !== undefined) {
      filteredEntries = filteredEntries.filter((e) => e.enabled === enabled);
    }

    // 向量状态过滤
    if (vectorStatus) {
      filteredEntries = filteredEntries.filter(
        (e) => e.vectorStatus === vectorStatus
      );
    }

    // 3. 排序
    filteredEntries.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortBy) {
        case "key":
          aVal = a.key.toLowerCase();
          bVal = b.key.toLowerCase();
          break;
        case "priority":
          aVal = a.priority;
          bVal = b.priority;
          break;
        case "updatedAt":
        default:
          aVal = a.updatedAt;
          bVal = b.updatedAt;
          break;
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    // 4. 分页
    const total = filteredEntries.length;
    const paginatedEntries = filteredEntries.slice(
      offset,
      offset + actualLimit
    );

    // 5. 格式化返回
    const formattedEntries = paginatedEntries.map((e) => ({
      id: e.id,
      key: e.key,
      summary: e.summary,
      tags: e.tags,
      priority: e.priority,
      enabled: e.enabled,
      vectorStatus: e.vectorStatus,
      updatedAt: e.updatedAt,
      vectorizedModels: e.vectorizedModels,
      totalTokens: e.totalTokens,
    }));

    return {
      success: true,
      total,
      count: formattedEntries.length,
      offset,
      entries: formattedEntries,
      message:
        formattedEntries.length > 0
          ? `查询完成，共 ${total} 条符合条件，当前返回第 ${offset + 1}-${offset + formattedEntries.length} 条。你可以通过 "id" 或 "key" 来引用这些条目。`
          : "未找到符合条件的条目，请调整筛选条件。",
    };
  } catch (error) {
    errorHandler.handle(error, {
      showToUser: false,
      context: { action: "listEntriesMetadata", options },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: `查询条目元数据失败: ${error instanceof Error ? error.message : String(error)}`,
    } as ListEntriesMetadataResult;
  }
}

/**
 * 7. listRecallCollections（列出思绪集列表）
 */
export async function listRecallCollections(
  options: ListRecallCollectionsOptions = {}
): Promise<ListRecallCollectionsResult> {
  try {
    const { query, includeStats = true } = options;

    logger.info("执行 listRecallCollections", { query, includeStats });

    // 1. 加载工作区
    const workspace = await recallStorage.loadWorkspace();

    // 2. 过滤思绪集
    let filteredBases = [...workspace.bases];

    // 名称关键词搜索
    if (query && query.trim()) {
      const lowerQuery = query.toLowerCase();
      filteredBases = filteredBases.filter((b) =>
        b.name.toLowerCase().includes(lowerQuery)
      );
    }

    // 3. 格式化返回
    const formattedBases = await Promise.all(
      filteredBases.map(async (base) => {
        // 加载元数据以获取完整信息
        const meta = await recallStorage.loadBaseMeta(base.id);

        const result: any = {
          id: base.id,
          name: base.name,
          description: base.description || meta?.description || null,
          createdAt: meta?.createdAt || Date.now(),
          updatedAt: base.updatedAt,
        };

        // 如果需要统计信息
        if (includeStats && meta) {
          result.stats = {
            totalEntries: meta.entries.length,
            enabledEntries: meta.entries.filter((e) => e.enabled).length,
            totalTokens: meta.entries.reduce(
              (sum, e) => sum + (e.totalTokens || 0),
              0
            ),
            vectorizedEntries: meta.entries.filter(
              (e) => e.vectorStatus === "ready"
            ).length,
          };
        }

        return result;
      })
    );

    return {
      success: true,
      total: formattedBases.length,
      bases: formattedBases,
      message:
        formattedBases.length > 0
          ? `找到 ${formattedBases.length} 个思绪集。你可以通过 "id" 或 "name" 来引用这些思绪集。`
          : "未找到思绪集，请先创建思绪集。",
    };
  } catch (error) {
    errorHandler.handle(error, {
      showToUser: false,
      context: { action: "listRecallCollections", options },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: `列出思绪集失败: ${error instanceof Error ? error.message : String(error)}`,
    } as ListRecallCollectionsResult;
  }
}
