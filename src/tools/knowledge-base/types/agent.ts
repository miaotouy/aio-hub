/**
 * 知识库 Agent 方法类型定义
 */

/**
 * 1. upsertEntry（创建或更新条目）参数
 */
export interface UpsertEntryOptions {
  /** 知识库 ID (与 kbName 二选一) */
  kbId?: string;
  /** 知识库名称 (优先使用，与 kbId 二选一) */
  kbName?: string;

  /** 条目标识（标题） */
  key: string;
  /** Markdown 内容 */
  content: string;
  /** 标签列表（可选） */
  tags?: string[];
  /** 优先级（可选，默认 100） */
  priority?: number;
  /** 是否启用（可选，默认 true） */
  enabled?: boolean;
  /** 是否自动提取标签（可选，默认 false） */
  autoExtractTags?: boolean;
  /** 是否自动向量化（可选，默认 false） */
  autoVectorize?: boolean;
}

/**
 * 1. upsertEntry（创建或更新条目）返回值
 */
export interface UpsertEntryResult {
  success: boolean;
  /** 条目 ID */
  entryId?: string;
  /** 知识库 ID */
  kbId?: string;
  /** 是否为新创建（true）还是更新（false） */
  isNew?: boolean;
  /** 提示消息 */
  message: string;
  /** 是否已向量化 */
  vectorized?: boolean;
  /** 错误信息（仅 success=false 时存在） */
  error?: string;
}

/**
 * 2. updateEntryContent（更新条目内容）参数
 */
export interface UpdateEntryContentOptions {
  /** 知识库 ID (与 kbName 二选一) */
  kbId?: string;
  /** 知识库名称 (优先使用，与 kbId 二选一) */
  kbName?: string;

  // === 条目定位方式（三选一） ===
  /** 方式1：直接指定条目 ID */
  entryId?: string;
  /** 方式2：通过标题定位 */
  key?: string;
  /** 方式3：通过搜索定位 */
  searchQuery?: string;
  /** 搜索模式（配合 searchQuery） */
  searchMode?: "keyword" | "vector";

  // === 替换模式（二选一） ===
  /** 模式 A：精确内容替换（指定原文片段进行局部替换） */
  targetContent?: string;
  /** 替换为的新内容 */
  replaceWith?: string;

  /** 模式 B：整体替换 - 替换整个条目内容 */
  replaceContent?: string;
  /** 模式 B：整体替换 - 替换标题 */
  replaceKey?: string;
  /** 模式 B：整体替换 - 替换标签 */
  replaceTags?: string[];
  /** 模式 B：整体替换 - 替换优先级 */
  replacePriority?: number;

  // === 通用选项 ===
  /** 最多替换条目数（仅搜索模式，默认 1） */
  limit?: number;
  /** 是否仅预览不执行（默认 false） */
  dryRun?: boolean;
  /** 是否自动重新向量化（默认 false） */
  autoVectorize?: boolean;
}

/**
 * 2. updateEntryContent（更新条目内容）返回值
 */
export interface UpdateEntryContentResult {
  success: boolean;
  /** 实际使用的模式 */
  mode?: "exact" | "search";
  /** 匹配到的条目数 */
  matchedCount?: number;
  /** 实际替换的条目数 */
  replacedCount?: number;
  /** 变更条目详情 */
  entries?: Array<{
    id: string;
    key: string;
    /** 原内容（或原片段） */
    oldContent?: string;
    /** 新内容（或新片段） */
    newContent?: string;
    /** 变更描述列表 */
    changes: string[];
  }>;
  /** 提示消息 */
  message: string;
  /** 错误信息（仅 success=false 时存在） */
  error?: string;
}

/**
 * 3. deleteEntry（删除条目）参数
 */
export interface DeleteEntryOptions {
  /** 知识库 ID (与 kbName 二选一) */
  kbId?: string;
  /** 知识库名称 (优先使用，与 kbId 二选一) */
  kbName?: string;

  // === 条目定位（二选一） ===
  /** 条目 ID（与 key 二选一） */
  entryId?: string;
  /** 条目标识（与 entryId 二选一） */
  key?: string;

  /** 确认删除（可选，默认 false） */
  confirm?: boolean;
}

/**
 * 3. deleteEntry（删除条目）返回值
 */
export interface DeleteEntryResult {
  success: boolean;
  /** 删除的条目 ID */
  deletedId?: string;
  /** 删除的条目标识 */
  deletedKey?: string;
  /** 提示消息 */
  message: string;
  /** 错误信息（仅 success=false 时存在） */
  error?: string;
}

/**
 * 4. searchEntries（搜索条目）参数
 */
export interface SearchEntriesOptions {
  /** 知识库 ID 列表 */
  kbIds?: string[];
  /** 知识库名称列表 (与 kbIds 可同时使用，会合并) */
  kbNames?: string[];

  /** 搜索查询 */
  query: string;
  /** 检索引擎（可选，默认 keyword） */
  engineId?: string;
  /** 返回结果数量（可选，默认 10） */
  limit?: number;
  /** 最小分数阈值（可选） */
  minScore?: number;
  /** 标签过滤（可选） */
  tags?: string[];
  /** 仅搜索启用的条目（可选，默认 true） */
  enabledOnly?: boolean;
}

/**
 * 4. searchEntries（搜索条目）返回值
 */
export interface SearchEntriesResult {
  success: boolean;
  /** 命中的条目数量 */
  count?: number;
  /** 搜索结果列表 */
  results?: Array<{
    /** 结果序号 (1-based) */
    index: number;
    id: string;
    key: string;
    content: string;
    summary: string;
    score: number;
    kbId: string;
    kbName: string;
    tags: string[];
    highlight?: string;
  }>;
  /** 提示消息 */
  message: string;
  /** 错误信息（仅 success=false 时存在） */
  error?: string;
}

/**
 * 5. batchUpdateMetadata（批量更新元数据）参数
 */
export interface BatchUpdateMetadataOptions {
  /** 知识库 ID (与 kbName 二选一) */
  kbId?: string;
  /** 知识库名称 (优先使用，与 kbId 二选一) */
  kbName?: string;

  /** 条目 ID 列表 */
  entryIds: string[];
  /** 批量设置启用状态（可选） */
  enabled?: boolean;
  /** 批量设置优先级（可选） */
  priority?: number;
  /** 批量添加标签（可选） */
  addTags?: string[];
  /** 批量移除标签（可选） */
  removeTags?: string[];
}

/**
 * 5. batchUpdateMetadata（批量更新元数据）返回值
 */
export interface BatchUpdateMetadataResult {
  success: boolean;
  /** 成功更新的条目数 */
  updatedCount?: number;
  /** 提示消息 */
  message: string;
  /** 错误信息（仅 success=false 时存在） */
  error?: string;
}

/**
 * 6. listEntriesMetadata（查询条目元数据）参数
 */
export interface ListEntriesMetadataOptions {
  /** 知识库 ID (与 kbName 二选一) */
  kbId?: string;
  /** 知识库名称 (优先使用，与 kbId 二选一) */
  kbName?: string;

  /** 标题关键词搜索（可选，对 key 字段进行模糊匹配） */
  query?: string;
  /** 标签过滤（可选，AND 逻辑：条目必须包含所有指定标签） */
  tags?: string[];
  /** 启用状态过滤（可选） */
  enabled?: boolean;
  /** 向量状态过滤（可选） */
  vectorStatus?: "none" | "pending" | "ready" | "error";
  /** 每页数量（可选，默认 50，最大 200） */
  limit?: number;
  /** 分页偏移（可选，默认 0） */
  offset?: number;
  /** 排序字段（可选，默认 updatedAt） */
  sortBy?: "updatedAt" | "key" | "priority" | "createdAt";
  /** 排序顺序（可选，默认 desc） */
  sortOrder?: "asc" | "desc";
}

/**
 * 6. listEntriesMetadata（查询条目元数据）返回值
 */
export interface ListEntriesMetadataResult {
  success: boolean;
  /** 总条目数（过滤后） */
  total?: number;
  /** 当前页条目数 */
  count?: number;
  /** 当前偏移 */
  offset?: number;
  /** 条目元数据列表 */
  entries?: Array<{
    id: string;
    key: string;
    summary: string;
    tags: string[];
    priority: number;
    enabled: boolean;
    vectorStatus: "none" | "pending" | "ready" | "error";
    updatedAt: number;
    createdAt?: number;
    vectorizedModels: string[];
    totalTokens?: number;
  }>;
  /** 提示消息 */
  message: string;
  /** 错误信息（仅 success=false 时存在） */
  error?: string;
}

/**
 * 7. listKnowledgeBases（列出知识库列表）参数
 */
export interface ListKnowledgeBasesOptions {
  /** 名称关键词搜索（可选，对 name 字段进行模糊匹配） */
  query?: string;
  /** 是否包含统计信息（可选，默认 true） */
  includeStats?: boolean;
}

/**
 * 7. listKnowledgeBases（列出知识库列表）返回值
 */
export interface ListKnowledgeBasesResult {
  success: boolean;
  /** 知识库总数 */
  total?: number;
  /** 知识库列表 */
  bases?: Array<{
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    /** 统计信息（仅 includeStats=true 时存在） */
    stats?: {
      totalEntries: number;
      enabledEntries: number;
      totalTokens: number;
      vectorizedEntries: number;
    };
  }>;
  /** 提示消息 */
  message: string;
  /** 错误信息（仅 success=false 时存在） */
  error?: string;
}
