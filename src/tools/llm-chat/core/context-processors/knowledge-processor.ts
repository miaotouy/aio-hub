import { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { ProcessableMessage } from "../../types/context";
import { createModuleLogger } from "@/utils/logger";
import { searchKnowledge } from "../../services/knowledge-service";
import type { SearchResult } from "../../../knowledge-base/types/search";
import type { ChatAgent, AgentKnowledgeBaseConfig } from "../../types/agent";
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
import { getPureModelId, getProfileId } from "@/utils/modelIdUtils";
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

  /** 召回上限 */
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
export function parseKBParams(
  raw: string,
  paramStr: string,
  messageIndex: number
): KBPlaceholder {
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
 *
 * 只扫描预设消息和注入消息，跳过对话历史。
 * 对话历史不适合作为被动召回区域——主动查询有工具调用，
 * 位置安排有深度注入的预设可以设置位置。
 */
export function scanPlaceholders(
  messages: ProcessableMessage[]
): KBPlaceholder[] {
  const placeholders: KBPlaceholder[] = [];
  messages.forEach((msg, index) => {
    if (typeof msg.content !== "string") return;

    // 跳过对话历史消息，只处理预设/注入类消息
    if (msg.sourceType === "session_history") return;

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
    let placeholders = scanPlaceholders(messages);

    // 1.5 自动注入逻辑：如果没有找到占位符，但 knowledgeBaseConfig 已启用且开启了保底注入
    if (placeholders.length === 0) {
      const kbConfig = agentConfig.knowledgeBaseConfig;
      if (kbConfig?.enabled && kbConfig.autoInjectIfMacroMissing) {
        const autoPlaceholders = this.generateAutoPlaceholders(
          kbConfig,
          messages
        );
        if (autoPlaceholders.length > 0) {
          placeholders = autoPlaceholders;
          logger.debug("知识库自动注入已触发", {
            count: autoPlaceholders.length,
          });
        }
      }
    }

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
        // 向量空间融合策略：分别提取 user/AI 文本
        const { userText, aiText } = this.extractContextParts(context);
        const knowledgeSettings = agentConfig.knowledgeSettings;
        // 数据迁移兼容：从旧版 aggregation 中读取 enableCache
        const enableCache =
          knowledgeSettings?.enableCache ??
          (agentConfig.knowledgeSettings as any)?.aggregation?.enableCache ??
          false;

        // 缓存 key：基于 user + AI 文本组合
        const cacheKey = `${userText}|||${aiText}`;
        let vector: number[] | null = null;

        // 确定最终使用的引擎 ID (优先级: 宏参数 > Agent 默认 > 全局默认)
        const engineId =
          ph.engineId ||
          knowledgeSettings?.defaultEngineId ||
          settings.value.knowledgeBase.defaultEngineId ||
          "vector";

        // 确定是否需要向量化 (vector 和 hybrid 引擎需要)
        const isVectorNeeded = engineId === "vector" || engineId === "hybrid";

        // 获取 Embedding 模型 ID (统一使用知识库全局配置)
        const kbStore = useKnowledgeBaseStore();
        const effectiveComboId = kbStore.config.defaultEmbeddingModel;
        const pureModelId = getPureModelId(effectiveComboId);

        // 1. 精确文本匹配缓存（完全一致才命中）
        let cached = enableCache ? sessionCache.findByText(cacheKey) : null;

        if (cached) {
          logger.debug("命中知识库检索缓存 (精确文本匹配)", {
            cacheKey: cacheKey.slice(0, 80),
          });
          results = cached.results;
          vector = cached.vector || null;
        } else {
          // 2. 查询预处理：只对 userText 执行清洗和 Tag 匹配
          //    AI 文本不参与 Tag 匹配（避免 AI 回复中的噪音词误触发标签）
          const { cleanedQuery, matchedTags } = preprocessQuery(userText, {
            tagPool: kbStore.globalStats.allDiscoveredTags,
          });
          const queryTextForSearch = cleanedQuery;

          logger.debug("RAG 查询预处理完成 (向量空间融合)", {
            userText: userText.slice(0, 100),
            aiText: aiText.slice(0, 100),
            cleanedQuery: queryTextForSearch,
            matchedTags,
            engineId,
            isVectorNeeded,
          });

          // 向量空间融合：分别 embed user/AI 文本，加权平均
          if (isVectorNeeded) {
            vector = await this.buildContextQueryVector(
              queryTextForSearch, // user 侧使用清洗后的文本
              aiText, // AI 侧直接使用原文
              effectiveComboId
            );
          }

          // 从 agent 配置中获取已启用的知识库 ID 列表
          const kbConfig = agentConfig.knowledgeBaseConfig;
          let kbIds: string[] = [];
          if (kbConfig?.enabled && kbConfig.bindings) {
            const enabledBindings = kbConfig.bindings.filter((b) => b.enabled);
            if (ph.kbName) {
              // 如果占位符指定了知识库名称，只匹配对应的 kbId
              const matched = enabledBindings.find(
                (b) => b.kbName === ph.kbName
              );
              if (matched) kbIds = [matched.kbId];
            } else {
              // 未指定名称时使用所有已启用的知识库
              kbIds = enabledBindings.map((b) => b.kbId);
            }
          }

          // 执行检索（传入预处理提取的标签）
          results = await searchKnowledge({
            query: queryTextForSearch,
            kbIds,
            tags: matchedTags.length > 0 ? matchedTags : undefined,
            vector: vector || undefined,
            limit: ph.limit || knowledgeSettings?.defaultLimit || 5,
            minScore: ph.minScore || knowledgeSettings?.defaultMinScore || 0.3,
            engineId: engineId,
            modelId: pureModelId,
          });

          // 存入缓存
          if (enableCache) {
            sessionCache.add({
              query: cacheKey,
              vector: vector || undefined,
              results,
              timestamp: Date.now(),
            });
          }
        }

        // 过滤结果 (如果指定了 kbName)
        if (ph.kbName) {
          results = results.filter((r) => r.kbName === ph.kbName);
        }

        // 字数限制过滤
        const maxChars = knowledgeSettings?.maxRecallChars || 0;
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

        // 保存到历史 (用于调试/监控，不再用于聚合)
        history.push({
          results,
          timestamp: Date.now(),
          query: userText,
        });
        // 保留最近 10 轮历史记录用于调试
        if (history.length > 10) {
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

        const entries = await invoke<any[]>("kb_get_entries", {
          ids: enabledIds,
        });
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
   /**
    * 从对话上下文中分别提取 User 和 AI 文本（向量空间融合策略）
    *
    * 不在文本层面拼接角色标记，而是分别提取 → 分别净化 → 分别 embed → 向量空间加权平均。
    */
  private extractContextParts(context: PipelineContext): {
    userText: string;
    aiText: string;
  } {
    const { messages, agentConfig } = context;
    // 数据迁移兼容：优先读取顶层 contextWindow，回退到旧版 aggregation.contextWindow
    const windowSize =
      agentConfig.knowledgeSettings?.contextWindow ??
      (agentConfig.knowledgeSettings as any)?.aggregation?.contextWindow ??
      1;

    // 从消息列表末尾向前，按"轮"提取
    const userParts: string[] = [];
    const aiParts: string[] = [];
    let i = messages.length - 1;
    let roundCount = 0;

    while (i >= 0 && roundCount < windowSize) {
      // 向前找到一条 user 消息
      while (i >= 0 && messages[i].role !== "user") {
        i--;
      }
      if (i < 0) break;

      const userIdx = i;

      // 收集 user 消息文本
      const userContent = messages[userIdx].content;
      if (typeof userContent === "string" && userContent.trim()) {
        userParts.unshift(userContent.trim());
      }

      // 收集紧随其后的 assistant/tool 消息文本
      for (let j = userIdx + 1; j < messages.length; j++) {
        const msg = messages[j];
        if (msg.role === "user") break;
        if (typeof msg.content !== "string") continue;

        if (msg.role === "assistant" && msg.content.trim()) {
          aiParts.unshift(msg.content.trim());
        } else if (msg.role === "tool" && msg.content.trim()) {
          // Tool 结果归入 AI 侧（提供额外元数据线索）
          aiParts.unshift(msg.content.trim());
        }
      }

      roundCount++;
      i = userIdx - 1;
    }

    return {
      userText: userParts.join("\n"),
      aiText: aiParts.join("\n"),
    };
  }

  /**
   * 构建上下文查询向量（向量空间融合策略）
   *
   * 策略：分别 embed user 和 AI 文本，然后在向量空间加权平均。
   * 默认权重：user 0.7, AI 0.3
   *
   * @returns 融合后的查询向量，如果无法生成则返回 null
   */
  private async buildContextQueryVector(
    userText: string,
    aiText: string,
    effectiveComboId: string | undefined
  ): Promise<number[] | null> {
    if (!effectiveComboId) {
      logger.warn("未配置 Embedding 模型，无法执行向量检索");
      return null;
    }

    const profileId = getProfileId(effectiveComboId);
    const pureModelId = getPureModelId(effectiveComboId);

    if (!profileId || !pureModelId) {
      logger.warn("无效的 Embedding 模型标识符", { effectiveComboId });
      return null;
    }

    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(profileId);
    if (!profile) {
      logger.warn("找不到指定的 LLM Profile", { profileId });
      return null;
    }

    try {
      // 分别 embed user 和 AI 文本
      const userVector = userText
        ? await vectorCacheManager.getVector(userText, profile, pureModelId)
        : null;

      const aiVector = aiText
        ? await vectorCacheManager.getVector(aiText, profile, pureModelId)
        : null;

      // 向量空间加权平均
      if (userVector && aiVector) {
        return this.weightedAverageVector([userVector, aiVector], [0.7, 0.3]);
      }

      // 只有一侧有向量时直接返回
      return userVector || aiVector;
    } catch (err) {
      logger.warn("获取 Embedding 向量失败，降级为文本检索", err);
      return null;
    }
  }

  /**
   * 向量加权平均
   */
  private weightedAverageVector(
    vectors: number[][],
    weights: number[]
  ): number[] {
    const dim = vectors[0].length;
    const result = new Array<number>(dim).fill(0);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    for (let vi = 0; vi < vectors.length; vi++) {
      const w = weights[vi] / totalWeight;
      const vec = vectors[vi];
      for (let d = 0; d < dim; d++) {
        result[d] += vec[d] * w;
      }
    }

    return result;
  }
  /**
   * 根据 knowledgeBaseConfig 自动生成占位符（保底注入）
   *
   * 注入策略：
   * - 如果有 system 消息：追加到 system 消息末尾（最自然的位置）
   * - 如果没有 system 消息：在目标位置插入一条独立的 user 消息来承载知识库内容，
   *   避免直接污染用户原文（兼容不支持 system 角色的模型）
   */
  private generateAutoPlaceholders(
    kbConfig: AgentKnowledgeBaseConfig,
    messages: ProcessableMessage[]
  ): KBPlaceholder[] {
    const enabledBindings = kbConfig.bindings.filter((b) => b.enabled);
    if (enabledBindings.length === 0) return [];

    // 构建占位符文本
    const placeholderRaws: string[] = [];
    for (const binding of enabledBindings) {
      const parts: string[] = [binding.kbName];
      if (binding.limit) parts.push(binding.limit.toString());
      else parts.push("");
      if (binding.minScore) parts.push(binding.minScore.toFixed(2));
      else parts.push("");
      parts.push(binding.mode || "always");
      if (binding.modeParams && binding.modeParams.length > 0) {
        parts.push(binding.modeParams.join(","));
      }

      // 从末尾裁剪默认值，保持与 parseKBParams 顺序一致
      while (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last === "" || last === "always") {
          parts.pop();
        } else {
          break;
        }
      }

      placeholderRaws.push(
        parts.length > 0
          ? `【kb::${parts.join("::")}】`
          : `【kb::${binding.kbName}】`
      );
    }

    // 确定注入方式和位置
    let targetIndex = 0;
    let needInsertNewMessage = false;

    if (kbConfig.autoInjectPosition === "before_last_user") {
      // 最后一条用户消息之前
      let lastUserIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserIndex = i;
          break;
        }
      }

      if (lastUserIndex <= 0) {
        // 用户消息是第一条或没有用户消息：需要插入新消息
        needInsertNewMessage = true;
        targetIndex = Math.max(0, lastUserIndex);
      } else {
        // 前一条消息存在，检查是否为 system
        const prevMsg = messages[lastUserIndex - 1];
        if (prevMsg.role === "system") {
          // 追加到 system 消息末尾
          targetIndex = lastUserIndex - 1;
        } else {
          // 在 user 消息之前插入新消息
          needInsertNewMessage = true;
          targetIndex = lastUserIndex;
        }
      }
    } else {
      // context_head (默认): 上下文最前方
      let foundSystem = false;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "system") {
          targetIndex = i;
          foundSystem = true;
          break;
        }
      }
      if (!foundSystem) {
        // 无 system 消息：在消息列表开头插入新消息
        needInsertNewMessage = true;
        targetIndex = 0;
      }
    }

    // 执行注入
    const placeholderTexts = placeholderRaws.join("\n");

    if (needInsertNewMessage) {
      // 插入一条独立的 user 消息承载知识库内容
      // 使用围栏标记让 LLM 明确区分这是系统注入的信息
      const injectedMsg: ProcessableMessage = {
        role: "user",
        content: `【RAG信息】\n${placeholderTexts}\n【RAG信息结束】`,
      };
      messages.splice(targetIndex, 0, injectedMsg);

      // 由于插入了新消息，targetIndex 就是新消息的位置
      // 后续所有 messageIndex 都指向这条新消息
    } else {
      // 追加到已有消息（通常是 system 消息）末尾
      const targetMsg = messages[targetIndex];
      if (targetMsg && typeof targetMsg.content === "string") {
        if (!targetMsg.content.includes(placeholderTexts)) {
          targetMsg.content =
            targetMsg.content.trimEnd() + "\n\n" + placeholderTexts;
        }
      }
    }

    // 构建 placeholder 对象列表
    const placeholders: KBPlaceholder[] = [];
    for (let i = 0; i < enabledBindings.length; i++) {
      const binding = enabledBindings[i];
      placeholders.push({
        raw: placeholderRaws[i],
        messageIndex: targetIndex,
        kbName: binding.kbName,
        limit: binding.limit,
        minScore: binding.minScore,
        mode: binding.mode || "always",
        modeParams: binding.modeParams,
      });
    }

    return placeholders;
  }

  /**
   * 格式化检索结果
   */
  private formatResults(
    results: SearchResult[],
    agentConfig: ChatAgent
  ): string {
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
          item = item.replace(
            /{tags}/g,
            r.caiu.tags.map((t) => t.name).join(", ")
          );
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
