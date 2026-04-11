import { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { ProcessableMessage } from "../../types/context";
import { createModuleLogger } from "@/utils/logger";
import { searchKnowledge } from "../../services/knowledge-service";
import type { SearchResult } from "../../../knowledge-base/types/search";
import type { ChatAgent } from "../../types/agent";
import {
  TurnRecord,
  getSessionRetrievalCache,
  getSessionHistory,
} from "../context-utils/knowledge-cache";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { invoke } from "@tauri-apps/api/core";
import { preprocessQuery } from "../../../knowledge-base/utils/queryPreProcessor";
import { useKnowledgeBaseStore } from "../../../knowledge-base/stores/knowledgeBaseStore";
import { getPureModelId, getProfileId } from "../../../knowledge-base/utils/kbUtils";
import { vectorCacheManager } from "../../../knowledge-base/utils/vectorCache";

const logger = createModuleLogger("KnowledgeProcessor");

/**
 * 知识库占位符解析结果接口
 */
export interface KBPlaceholder {
  /** 原始占位符文本，用于替换 */
  raw: string;

  /** 所在消息的索引 */
  messageIndex: number;

  /** 知识库名称 (可选，为空则检索所有库) */
  kbName?: string;

  /** 召回数量限制 */
  limit?: number;

  /** 最低相关度分数阈值 */
  minScore?: number;

  /** 激活模式: always | gate | turn | static */
  mode: "always" | "gate" | "turn" | "static";

  /** 模式特定参数 (如标签列表、轮次数、条目 ID 列表) */
  modeParams?: string[];

  /** 检索引擎 ID (可选，覆盖默认设置) */
  engineId?: string;
}

/**
 * 匹配所有 KB 占位符的正则表达式
 */
const KB_PLACEHOLDER_REGEX = /【(?:kb|knowledge)(?:::([^【】]*?))?】/g;

/**
 * 参数解析函数：将链式字符串解析为结构化对象
 * 格式: kbName::limit::minScore::mode::modeParams
 */
export function parseKBParams(raw: string, paramStr: string, messageIndex: number): KBPlaceholder {
  const parts = (paramStr || "").split("::");
  return {
    raw,
    messageIndex,
    kbName: parts[0] || undefined,
    limit: parts[1] ? parseInt(parts[1]) : undefined,
    minScore: parts[2] ? parseFloat(parts[2]) : undefined,
    mode: (parts[3] as any) || "always",
    modeParams: parts[4] ? parts[4].split(",").map((t) => t.trim()) : undefined,
    engineId: parts[5] || undefined,
  };
}

/**
 * 扫描消息中的占位符
 */
export function scanPlaceholders(messages: ProcessableMessage[]): KBPlaceholder[] {
  const placeholders: KBPlaceholder[] = [];
  messages.forEach((msg, index) => {
    if (typeof msg.content !== "string") return;

    let match;
    // 必须重置 lastIndex 因为是全局匹配
    KB_PLACEHOLDER_REGEX.lastIndex = 0;
    while ((match = KB_PLACEHOLDER_REGEX.exec(msg.content)) !== null) {
      placeholders.push(parseKBParams(match[0], match[1], index));
    }
  });
  return placeholders;
}

export class KnowledgeProcessor implements ContextProcessor {
  id = "primary:knowledge-processor";
  name = "知识库处理器";
  description = "执行 RAG 检索并替换【kb】占位符";
  priority = 450;

  async execute(context: PipelineContext): Promise<void> {
    const { agentConfig, messages } = context;

    // 1. 扫描占位符
    const placeholders = scanPlaceholders(messages);
    if (placeholders.length === 0) {
      return;
    }

    // 初始化缓存与历史（模块级持久化，跨请求存活）
    const { settings } = useChatSettings();
    const sessionId = context.detail.id;
    const sessionCache = getSessionRetrievalCache(
      sessionId,
      settings.value.knowledgeBase.retrievalCacheMaxItems
    );
    const history = getSessionHistory(sessionId);

    logger.debug("发现知识库占位符", { count: placeholders.length });

    // 2. 遍历占位符并处理
    for (const ph of placeholders) {
      // 检查激活模式
      if (!this.shouldActivate(ph, context, history)) {
        const msg = messages[ph.messageIndex];
        if (typeof msg.content === "string") {
          msg.content = msg.content.replace(ph.raw, ""); // 未激活则移除占位符
        }
        continue;
      }

      let results: SearchResult[] = [];

      if (ph.mode === "static") {
        results = await this.handleStaticMode(ph);
      } else {
        // 构建上下文感知查询
        const rawQuery = this.buildContextQuery(context);
        const aggregation = agentConfig.knowledgeSettings?.aggregation;

        let queryText = rawQuery;
        let vector: number[] | null = null;

        // 确定最终使用的引擎 ID (优先级: 宏参数 > Agent 默认 > 全局默认)
        const engineId =
          ph.engineId ||
          agentConfig.knowledgeSettings?.defaultEngineId ||
          settings.value.knowledgeBase.defaultEngineId ||
          "vector";

        // 确定是否需要向量化 (vector 和 hybrid 引擎需要)
        const isVectorNeeded = engineId === "vector" || engineId === "hybrid";

        // 获取 Embedding 模型 ID (优先级: Agent 配置 > 知识库全局配置)
        const kbStore = useKnowledgeBaseStore();
        const comboId = kbStore.config.defaultEmbeddingModel;
        const effectiveComboId = agentConfig.knowledgeSettings?.embeddingModelId || comboId;
        const pureModelId = getPureModelId(effectiveComboId);

        // 1. 优先尝试原始文本精确匹配缓存 (在清洗前)
        let cached = aggregation?.enableCache ? sessionCache.findByText(rawQuery) : null;

        if (cached) {
          logger.debug("命中知识库检索缓存 (原始文本匹配)", { query: rawQuery });
          results = cached.results;
          vector = cached.vector || null;
        } else {
          // 2. 查询预处理：清洗、分词、停用词过滤、Tag 匹配
          const kbStore = useKnowledgeBaseStore();
          const { cleanedQuery, matchedTags } = preprocessQuery(rawQuery, {
            tagPool: kbStore.globalStats.allDiscoveredTags,
          });
          queryText = cleanedQuery;

          logger.debug("RAG 查询预处理完成", {
            rawQuery,
            cleanedQuery: queryText,
            matchedTags,
            engineId,
            isVectorNeeded,
          });

          // 只有需要向量时才生成向量
          if (isVectorNeeded) {
            vector = await this.buildContextVector(queryText, context, effectiveComboId, history);
          }

          // 3. 检查向量相似度缓存 (仅当有向量时)
          cached =
            aggregation?.enableCache && vector
              ? sessionCache.findSimilar(vector, aggregation.cacheSimilarityThreshold || 0.95)
              : null;

          if (cached) {
            logger.debug("命中知识库检索缓存 (向量相似度匹配)", { query: queryText });
            results = cached.results;
            if (!vector) vector = cached.vector || null;
          } else {
            // 执行检索（传入预处理提取的标签）
            results = await searchKnowledge({
              query: queryText,
              tags: matchedTags.length > 0 ? matchedTags : undefined,
              vector: vector || undefined,
              limit: ph.limit || agentConfig.knowledgeSettings?.defaultLimit || 5,
              minScore: ph.minScore || agentConfig.knowledgeSettings?.defaultMinScore || 0.3,
              engineId: engineId,
              modelId: pureModelId,
            });

            // 存入缓存 (同时存入清洗前后的查询文本以提高命中率)
            if (aggregation?.enableCache) {
              sessionCache.add({
                query: rawQuery, // 存入原始查询
                vector: vector || undefined,
                results,
                timestamp: Date.now(),
              });
              if (queryText !== rawQuery) {
                sessionCache.add({
                  query: queryText, // 也存入清洗后的查询
                  vector: vector || undefined,
                  results,
                  timestamp: Date.now(),
                });
              }
            }
          }
        }

        // 4. 历史结果聚合
        if (aggregation?.enableResultAggregation) {
          results = this.aggregateResults(results, history, aggregation);
        }

        // 5. 过滤结果 (如果指定了 kbName)
        // 必须在字数截断之前过滤，否则可能因为其他库的结果占位导致指定库结果被截断
        // 放在聚合之后可以确保过滤掉历史记录中可能存在的其他库结果
        if (ph.kbName) {
          results = results.filter((r) => r.kbName === ph.kbName);
        }

        // 6. 字数限制过滤
        const maxChars = agentConfig.knowledgeSettings?.maxRecallChars || 0;
        if (maxChars > 0) {
          let currentTotal = 0;
          const filtered: SearchResult[] = [];
          for (const res of results) {
            const contentLen = res.caiu.content?.length || 0;
            if (currentTotal + contentLen <= maxChars) {
              filtered.push(res);
              currentTotal += contentLen;
            } else {
              break;
            }
          }
          results = filtered;
        }

        // 保存到历史 (仅限非静态模式)
        history.push({
          results,
          timestamp: Date.now(),
          query: queryText,
          queryVector: vector || undefined,
        });
        if (history.length > (aggregation?.maxHistoryTurns || 10)) {
          history.shift();
        }
      }

      // 3. 格式化并替换
      const formatted = this.formatResults(results, agentConfig);
      const msg = messages[ph.messageIndex];
      if (typeof msg.content === "string") {
        msg.content = msg.content.replace(ph.raw, formatted);
      }

      // 记录日志
      context.logs.push({
        processorId: this.id,
        level: "info",
        message: `知识库占位符替换完成: ${ph.raw}`,
        details: {
          kbName: ph.kbName,
          resultCount: results.length,
          mode: ph.mode,
        },
      });
    }
  }

  /**
   * 检查占位符是否应该激活
   */
  private shouldActivate(
    ph: KBPlaceholder,
    context: PipelineContext,
    _history: TurnRecord[]
  ): boolean {
    const { agentConfig, messages } = context;
    const settings = agentConfig.knowledgeSettings;

    switch (ph.mode) {
      case "always":
        return true;
      case "static":
        return true;
      case "turn": {
        const interval = parseInt(ph.modeParams?.[0] || "1");
        const turnCount = messages.filter((m) => m.role === "user").length;
        return turnCount % interval === 0;
      }
      case "gate": {
        const keywords = ph.modeParams || [];
        if (keywords.length === 0) return true;

        const scanDepth = settings?.gateScanDepth || 3;
        const recentMessages = messages.slice(-scanDepth);
        return recentMessages.some(
          (msg) =>
            typeof msg.content === "string" &&
            keywords.some((kw) => (msg.content as string).includes(kw))
        );
      }
      default:
        return true;
    }
  }

  /**
   * 处理静态加载模式
   * 支持两种模式：
   * - modeParams 包含 "all" → 加载指定知识库（或所有库）的全部已启用条目
   * - modeParams 为具体 ID 列表 → 加载指定条目
   */
  private async handleStaticMode(ph: KBPlaceholder): Promise<SearchResult[]> {
    const entryIds = ph.modeParams || [];
    if (entryIds.length === 0) return [];

    const isAll = entryIds.length === 1 && entryIds[0].toLowerCase() === "all";

    try {
      if (isAll) {
        return await this.handleStaticAll(ph);
      }

      // 调用后端获取指定条目
      const entries = await invoke<any[]>("kb_get_entries", { ids: entryIds });
      return entries.map((e) => ({
        score: 1.0,
        kbName: e.kb_name || "未知知识库",
        kbId: e.kb_id || "",
        matchType: "key",
        highlight: null,
        caiu: {
          id: e.id,
          key: e.key,
          content: e.content,
          tags: e.tags || [],
          assets: [],
          priority: 100,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      })) as SearchResult[];
    } catch (err) {
      logger.warn("静态加载知识库条目失败", { entryIds, err });
      return [];
    }
  }

  /**
   * 处理 static::all 模式 — 加载指定知识库（或所有库）的全部已启用条目
   */
  private async handleStaticAll(ph: KBPlaceholder): Promise<SearchResult[]> {
    const kbStore = useKnowledgeBaseStore();
    const results: SearchResult[] = [];

    // 确定要加载的知识库列表
    let targetBases = kbStore.bases;
    if (ph.kbName) {
      targetBases = kbStore.bases.filter((b) => b.name === ph.kbName);
      if (targetBases.length === 0) {
        logger.warn("static::all 未找到指定知识库", { kbName: ph.kbName });
        return [];
      }
    }

    for (const base of targetBases) {
      try {
        const meta = await invoke<any | null>("kb_load_base_meta", {
          kbId: base.id,
        });
        if (!meta?.entries) continue;

        // 收集所有已启用条目的 ID
        const enabledIds = meta.entries
          .filter((e: any) => e.vectorStatus !== "error")
          .map((e: any) => e.id);

        if (enabledIds.length === 0) continue;

        const entries = await invoke<any[]>("kb_get_entries", { ids: enabledIds });
        for (const e of entries) {
          results.push({
            score: 1.0,
            kbName: base.name || "未知知识库",
            kbId: base.id,
            matchType: "key",
            highlight: null,
            caiu: {
              id: e.id,
              key: e.key,
              content: e.content,
              tags: e.tags || [],
              assets: [],
              priority: e.priority ?? 100,
              enabled: true,
              createdAt: e.created_at || Date.now(),
              updatedAt: e.updated_at || Date.now(),
            },
          } as SearchResult);
        }
      } catch (err) {
        logger.warn("static::all 加载知识库条目失败", { kbId: base.id, err });
      }
    }

    logger.debug("static::all 加载完成", {
      kbName: ph.kbName || "(全部)",
      totalEntries: results.length,
    });

    return results;
  }

  /**
   * 构建上下文感知查询文本 (滑动窗口)
   */
  private buildContextQuery(context: PipelineContext): string {
    const { messages, agentConfig } = context;
    const windowSize = agentConfig.knowledgeSettings?.aggregation?.contextWindow || 1;

    const userMessages = messages.filter((m) => m.role === "user" && typeof m.content === "string");
    const recent = userMessages.slice(-windowSize);

    return recent.map((m) => m.content).join("\n");
  }

  /**
   * 构建上下文感知向量 (加权平均)
   */
  private async buildContextVector(
    queryText: string,
    context: PipelineContext,
    effectiveComboId: string | undefined,
    history: TurnRecord[]
  ): Promise<number[] | null> {
    const { agentConfig } = context;

    if (!effectiveComboId) {
      logger.warn("未配置 Embedding 模型，无法执行向量检索");
      return null;
    }

    // 解析格式 profileId:modelId
    const profileId = getProfileId(effectiveComboId);
    const pureModelId = getPureModelId(effectiveComboId);

    if (!profileId || !pureModelId) {
      logger.warn("无效的 Embedding 模型标识符", { effectiveComboId });
      return null;
    }

    try {
      const { getProfileById } = useLlmProfiles();
      const profile = getProfileById(profileId);
      if (!profile) {
        logger.warn("找不到指定的 LLM Profile", { profileId });
        return null;
      }

      // 使用统一的 vectorCacheManager 获取向量 (内部处理了缓存和 API 调用)
      const currentVector = await vectorCacheManager.getVector(queryText, profile, pureModelId);

      if (!currentVector) return null;

      // 3. 向量加权平均 (Context Projection)
      const aggregation = agentConfig.knowledgeSettings?.aggregation;
      if (aggregation?.queryDecay && aggregation.queryDecay < 1.0) {
        if (history.length > 0) {
          return this.computeWeightedVector(currentVector, history, aggregation.queryDecay);
        }
      }

      return currentVector;
    } catch (err) {
      logger.warn("获取 Embedding 向量失败，降级为文本检索", err);
      return null;
    }
  }

  /**
   * 计算加权平均向量
   */
  private computeWeightedVector(current: number[], history: TurnRecord[], decay: number): number[] {
    const result = [...current];
    let totalWeight = 1.0;

    // 只取最近的 3 个历史向量进行聚合
    const recentHistory = history.slice(-3).reverse();
    recentHistory.forEach((turn, index) => {
      if (turn.queryVector && turn.queryVector.length === current.length) {
        const weight = Math.pow(decay, index + 1);
        for (let i = 0; i < result.length; i++) {
          result[i] += turn.queryVector[i] * weight;
        }
        totalWeight += weight;
      }
    });

    // 归一化
    for (let i = 0; i < result.length; i++) {
      result[i] /= totalWeight;
    }
    return result;
  }

  /**
   * 聚合当前结果与历史结果 (时间衰减加权)
   */
  private aggregateResults(
    current: SearchResult[],
    history: TurnRecord[],
    config: any
  ): SearchResult[] {
    const decay = config.resultDecay || 0.8;
    const maxHistory = config.maxHistoryTurns || 3;

    const allResults = new Map<string, SearchResult>();

    // 添加当前结果 (权重 1.0)
    current.forEach((r) => {
      const id = r.caiu.id || r.caiu.key;
      allResults.set(id, { ...r });
    });

    // 合并历史结果 (按轮次衰减)
    const recentHistory = history.slice(-maxHistory).reverse();
    recentHistory.forEach((turn, index) => {
      const weight = Math.pow(decay, index + 1);
      turn.results.forEach((r) => {
        const id = r.caiu.id || r.caiu.key;
        if (allResults.has(id)) {
          // 如果已存在，取最高分 (或者加权平均)
          const existing = allResults.get(id)!;
          existing.score = Math.max(existing.score, r.score * weight);
        } else {
          allResults.set(id, { ...r, score: r.score * weight });
        }
      });
    });

    // 重新排序并截断
    return Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, current.length + 2); // 稍微多留一点
  }

  /**
   * 格式化检索结果
   */
  private formatResults(results: SearchResult[], agentConfig: ChatAgent): string {
    const settings = agentConfig.knowledgeSettings;
    if (results.length === 0) {
      return settings?.emptyText || "（未检索到相关知识）";
    }

    const template =
      settings?.resultTemplate ||
      `---
📚 相关知识 (共 {count} 条)

{items}
---`;

    const itemTemplate = `**[{kbName}]** {key}
> {content}
(相关度: {score})`;

    const itemsContent = results
      .map((r) => {
        let item = itemTemplate
          .replace(/{kbName}/g, r.kbName || "未知知识库")
          .replace(/{key}/g, r.caiu.key || "无标题")
          .replace(/{content}/g, r.caiu.content || "")
          .replace(/{score}/g, r.score.toFixed(2));

        // 处理标签
        if (r.caiu.tags && r.caiu.tags.length > 0) {
          item = item.replace(/{tags}/g, r.caiu.tags.map((t) => t.name).join(", "));
        } else {
          item = item.replace(/{tags}/g, "");
        }

        return item;
      })
      .join("\n\n");

    return template
      .replace(/{count}/g, results.length.toString())
      .replace(/{items}/g, itemsContent);
  }
}

export const knowledgeProcessor = new KnowledgeProcessor();
