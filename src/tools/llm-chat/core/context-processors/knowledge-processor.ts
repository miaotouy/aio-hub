import { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { ProcessableMessage } from "../../types/context";
import { createModuleLogger } from "@/utils/logger";
import {
  searchWithCache,
  getEntries,
  loadBaseMeta,
} from "@/tools/knowledge-base/services/api";
import type { SearchResult } from "@/tools/knowledge-base/types/search";
import type { ChatAgent, AgentKnowledgeBaseConfig } from "../../types/agent";
import { useKnowledgeBaseStore } from "@/tools/knowledge-base/stores/knowledgeBaseStore";

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
    const placeholders = scanPlaceholders(messages);

    //  - 自动注入逻辑（细粒度版）：按 binding 级别判断
    //  - 已被手动占位符引用的 binding 跳过自动注入
    //  - 用户写了无名 `【kb】`（不指定 kbName）视为"全量接管"，所有 binding 都跳过
    //  - 剩余 binding 才参与自动注入
    const kbConfig = agentConfig.knowledgeBaseConfig;
    if (kbConfig?.enabled && kbConfig.autoInjectIfMacroMissing) {
      const hasUnnamedPlaceholder = placeholders.some((p) => !p.kbName);
      const referencedKbNames = new Set(
        placeholders.map((p) => p.kbName).filter((n): n is string => !!n)
      );

      if (!hasUnnamedPlaceholder) {
        const autoPlaceholders = this.generateAutoPlaceholders(
          kbConfig,
          messages,
          referencedKbNames
        );
        if (autoPlaceholders.length > 0) {
          placeholders.push(...autoPlaceholders);
          logger.debug("知识库自动注入已触发", {
            autoCount: autoPlaceholders.length,
            manualCount: placeholders.length - autoPlaceholders.length,
            skippedKbNames: Array.from(referencedKbNames),
          });
        }
      } else {
        logger.debug(
          "存在无名 【kb】 占位符，跳过自动注入（视为用户全量接管）"
        );
      }
    }

    if (placeholders.length === 0) {
      return;
    }

    logger.debug("发现知识库占位符", { count: placeholders.length });

    // 2. 遍历占位符并处理
    for (const ph of placeholders) {
      // 检查激活模式
      if (!this.shouldActivate(ph, context)) {
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

        // 从 agent 配置中获取已启用的知识库 ID 列表
        const agentKbConfig = agentConfig.knowledgeBaseConfig;
        let kbIds: string[] = [];
        if (agentKbConfig?.enabled && agentKbConfig.bindings) {
          const enabledBindings = agentKbConfig.bindings.filter(
            (b) => b.enabled
          );
          if (ph.kbName) {
            // 如果占位符指定了知识库名称，只匹配对应的 kbId
            const matched = enabledBindings.find((b) => b.kbName === ph.kbName);
            if (matched) kbIds = [matched.kbId];
          } else {
            // 未指定名称时使用所有已启用的知识库
            kbIds = enabledBindings.map((b) => b.kbId);
          }
        }

        const finalLimit = ph.limit || knowledgeSettings?.defaultLimit || 5;
        const finalMinScore =
          ph.minScore || knowledgeSettings?.defaultMinScore || 0.3;

        // 引擎 fallback 链：占位符 > Agent 默认 > 知识库默认（service 内部完成）
        const engineId = ph.engineId || knowledgeSettings?.defaultEngineId;

        // 调用知识库 service 门面，包揽缓存、preprocess、向量融合等所有细节
        const { results: searchResults } = await searchWithCache({
          primaryQuery: userText,
          secondaryQuery: aiText,
          kbIds,
          limit: finalLimit,
          minScore: finalMinScore,
          engineId,
          enableCache,
        });
        results = searchResults;

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
  private shouldActivate(ph: KBPlaceholder, context: PipelineContext): boolean {
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

      // 通过知识库 service 获取指定条目
      const entries = await getEntries(entryIds);
      return entries.map((e: any) => ({
        score: 1.0,
        kbName: e.kb_name || e.kbName || "未知知识库",
        kbId: e.kb_id || e.kbId || "",
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
        const meta = await loadBaseMeta(base.id);
        if (!meta?.entries) continue;

        // 收集所有已启用条目的 ID
        const enabledIds = meta.entries
          .filter((e: any) => e.vectorStatus !== "error")
          .map((e: any) => e.id);

        if (enabledIds.length === 0) continue;

        const entries = await getEntries(enabledIds);
        for (const e of entries as any[]) {
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
              createdAt: e.created_at || e.createdAt || Date.now(),
              updatedAt: e.updated_at || e.updatedAt || Date.now(),
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

    // session-loader 会为每一条历史消息节点打上 sourceType: "session_history"，
    // 因此这里严格按此标签过滤即可，不需要兜底——若过滤后为空，说明上游出错，应当暴露
    const historyOnly = messages.filter(
      (m) => m.sourceType === "session_history"
    );

    // 从真实历史消息列表末尾向前，按"轮"提取
    const userParts: string[] = [];
    const aiParts: string[] = [];
    let i = historyOnly.length - 1;
    let roundCount = 0;

    while (i >= 0 && roundCount < windowSize) {
      // 向前找到一条 user 消息
      while (i >= 0 && historyOnly[i].role !== "user") {
        i--;
      }
      if (i < 0) break;

      const userIdx = i;

      // 收集 user 消息文本
      const userContent = historyOnly[userIdx].content;
      if (typeof userContent === "string" && userContent.trim()) {
        userParts.unshift(userContent.trim());
      }

      // 收集紧随其后的 assistant/tool 消息文本
      for (let j = userIdx + 1; j < historyOnly.length; j++) {
        const msg = historyOnly[j];
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
   * 根据 knowledgeBaseConfig 自动生成占位符（保底注入）
   *
   * 注入策略：
   * - 如果有 system 消息：追加到 system 消息末尾（最自然的位置）
   * - 如果没有 system 消息：在目标位置插入一条独立的 user 消息来承载知识库内容，
   *   避免直接污染用户原文（兼容不支持 system 角色的模型）
   *
   * 细粒度过滤：
   * - `excludeKbNames` 集合中的 binding 会被跳过（用户已手动写了 `【kb::xxx】`）
   * - 这样可以实现"部分手动控制 + 剩余自动注入"的混合模式
   */
  private generateAutoPlaceholders(
    kbConfig: AgentKnowledgeBaseConfig,
    messages: ProcessableMessage[],
    excludeKbNames: Set<string> = new Set()
  ): KBPlaceholder[] {
    const enabledBindings = kbConfig.bindings.filter(
      (b) => b.enabled && !excludeKbNames.has(b.kbName)
    );
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
