/**
 * 知识库查询预处理管线
 *
 * 在查询文本送入 Embedding API 或关键词检索之前，执行：
 * 1. 文本清洗 — 移除 Markdown 标记、HTML、KB 占位符、多余空白
 * 2. 分词 — 使用浏览器原生 Intl.Segmenter
 * 3. 停用词过滤 — 移除对检索无意义的高频词
 * 4. Tag 池匹配 — 自动从查询中提取已知标签
 */

import { isStopword } from "./stopwords";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("knowledge-base/query-preprocessor");

// ─── 类型定义 ───────────────────────────────────────────────

export interface PreprocessResult {
  /** 清洗并重组后的查询文本（用于 Embedding 和关键词检索） */
  cleanedQuery: string;
  /** 分词后过滤停用词的 token 列表 */
  tokens: string[];
  /** 从查询中自动提取的标签（用于增强 SearchFilters） */
  matchedTags: string[];
  /** 原始查询（用于日志和调试） */
  originalQuery: string;
}

export interface PreprocessOptions {
  /** 可用的标签池（通常来自 knowledgeBaseStore.globalStats.allDiscoveredTags） */
  tagPool?: string[];
  /** 是否启用 Tag 匹配（默认 true） */
  enableTagMatching?: boolean;
  /** 是否启用停用词过滤（默认 true） */
  enableStopwordFilter?: boolean;
  /** Tag 组合匹配的最大 n-gram 长度（默认 3） */
  maxNgramLength?: number;
}

// ─── 正则常量 ───────────────────────────────────────────────

/** Markdown 标记 */
const RE_MARKDOWN = /[*_~`#>\[\]()!|]/g;

/** HTML 标签 */
const RE_HTML_TAGS = /<[^>]+>/g;

/** KB 占位符 */
const RE_KB_PLACEHOLDER = /【(?:kb|knowledge)(?:::[^【】]*?)?】/g;

/** 连续空白 */
const RE_WHITESPACE = /\s+/g;

// ─── 分词器（懒初始化） ─────────────────────────────────────

let _segmenter: Intl.Segmenter | null = null;

function getSegmenter(): Intl.Segmenter {
  if (!_segmenter) {
    _segmenter = new Intl.Segmenter("zh-Hans", { granularity: "word" });
  }
  return _segmenter;
}

// ─── Tag 池索引缓存 ─────────────────────────────────────────

let _cachedTagPool: string[] | null = null;
let _tagSet: Set<string> | null = null;

/**
 * 构建或获取 Tag 池的 Set 缓存
 * 当 tagPool 引用变化时自动重建
 */
function getTagSet(tagPool: string[]): Set<string> {
  if (_cachedTagPool !== tagPool) {
    _cachedTagPool = tagPool;
    _tagSet = new Set(tagPool.map((t) => t.toLowerCase()));
  }
  return _tagSet!;
}

// ─── 阶段 1：文本清洗 ──────────────────────────────────────

/**
 * 清洗查询文本，移除对检索无意义的标记和符号
 */
export function cleanQuery(text: string): string {
  return text
    .replace(RE_KB_PLACEHOLDER, " ")
    .replace(RE_HTML_TAGS, " ")
    .replace(RE_MARKDOWN, " ")
    .replace(RE_WHITESPACE, " ")
    .trim();
}

// ─── 阶段 2：分词 ──────────────────────────────────────────

/**
 * 使用 Intl.Segmenter 进行分词
 * 返回小写化的词汇列表（仅保留 isWordLike 的 segment）
 */
export function segment(text: string): string[] {
  const segmenter = getSegmenter();
  const segments = segmenter.segment(text);
  const tokens: string[] = [];

  for (const seg of segments) {
    if (seg.isWordLike) {
      const word = seg.segment.trim().toLowerCase();
      if (word.length > 0) {
        tokens.push(word);
      }
    }
  }

  return tokens;
}

// ─── 阶段 3：停用词过滤 ────────────────────────────────────

/**
 * 过滤停用词
 * 规则：
 * - 停用词表中的词直接移除
 * - 单字中文词默认移除（除非在 Tag 池中命中）
 */
export function filterStopwords(
  tokens: string[],
  tagSet?: Set<string>
): string[] {
  return tokens.filter((token) => {
    // 停用词表命中 → 移除
    if (isStopword(token)) {
      // 但如果该词恰好是一个 Tag，则保留
      if (tagSet && tagSet.has(token)) {
        return true;
      }
      return false;
    }

    // 单字中文词（非 Tag）→ 移除
    if (token.length === 1 && isChinese(token)) {
      if (tagSet && tagSet.has(token)) {
        return true;
      }
      return false;
    }

    return true;
  });
}

/**
 * 判断字符串是否为中文字符
 */
function isChinese(str: string): boolean {
  return /^[\u4e00-\u9fff]+$/.test(str);
}

// ─── 阶段 4：Tag 池匹配 ────────────────────────────────────

/**
 * 从 token 列表中提取与 Tag 池匹配的标签
 *
 * 匹配策略（按优先级）：
 * 1. 精确匹配：单个 token 与 Tag 完全一致
 * 2. 组合匹配：相邻 2~maxN 个 token 拼接后与 Tag 一致
 */
export function extractTags(
  tokens: string[],
  tagPool: string[],
  maxNgramLength = 3
): string[] {
  if (tagPool.length === 0 || tokens.length === 0) return [];

  const tagSet = getTagSet(tagPool);
  // 构建一个 lowercase → 原始 Tag 的映射，用于返回原始大小写
  const tagOriginalMap = new Map<string, string>();
  for (const tag of tagPool) {
    tagOriginalMap.set(tag.toLowerCase(), tag);
  }

  const matched = new Set<string>();

  // 1. 精确匹配
  for (const token of tokens) {
    if (tagSet.has(token)) {
      const original = tagOriginalMap.get(token);
      if (original) matched.add(original);
    }
  }

  // 2. 组合匹配（n-gram）
  for (let n = 2; n <= Math.min(maxNgramLength, tokens.length); n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const combined = tokens.slice(i, i + n).join("");
      if (tagSet.has(combined)) {
        const original = tagOriginalMap.get(combined);
        if (original) matched.add(original);
      }
    }
  }

  return Array.from(matched);
}

// ─── 主入口 ─────────────────────────────────────────────────

/**
 * 执行完整的查询预处理管线
 *
 * @param query 原始查询文本
 * @param options 预处理选项
 * @returns 预处理结果
 */
export function preprocessQuery(
  query: string,
  options: PreprocessOptions = {}
): PreprocessResult {
  const {
    tagPool = [],
    enableTagMatching = true,
    enableStopwordFilter = true,
    maxNgramLength = 3,
  } = options;

  const originalQuery = query;

  // 空查询快速返回
  if (!query || !query.trim()) {
    return {
      cleanedQuery: "",
      tokens: [],
      matchedTags: [],
      originalQuery,
    };
  }

  // 阶段 1：文本清洗
  const cleaned = cleanQuery(query);

  // 阶段 2：分词
  const allTokens = segment(cleaned);

  // 阶段 3：停用词过滤
  const tagSet =
    enableTagMatching && tagPool.length > 0 ? getTagSet(tagPool) : undefined;
  const tokens = enableStopwordFilter
    ? filterStopwords(allTokens, tagSet)
    : allTokens;

  // 阶段 4：Tag 池匹配
  const matchedTags =
    enableTagMatching && tagPool.length > 0
      ? extractTags(tokens, tagPool, maxNgramLength)
      : [];

  // 重组查询文本
  const cleanedQuery = tokens.join(" ");

  // 防护：如果预处理后为空，回退到清洗后的原始文本
  const finalQuery = cleanedQuery.length > 0 ? cleanedQuery : cleaned;

  logger.debug("查询预处理完成", {
    original: originalQuery,
    cleaned: finalQuery,
    tokenCount: tokens.length,
    matchedTags,
  });

  return {
    cleanedQuery: finalQuery,
    tokens,
    matchedTags,
    originalQuery,
  };
}