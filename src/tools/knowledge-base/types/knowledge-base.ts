import type { Caiu, TagWithWeight } from "./caiu";
import type { SearchResult } from "./search";

/**
 * 知识库相关类型定义
 */

/**
 * 向量化元数据
 */
export interface VectorizationMeta {
  /** 是否已建立索引 */
  isIndexed: boolean;
  /** 最后一次索引时间 */
  lastIndexedAt: number | null;
  /** 使用的模型 ID */
  modelId: string;
  /** 供应商 */
  provider: string;
  /** 向量维度 */
  dimension: number;
  /** 累计消耗 Token 数 */
  totalTokens?: number;
}

/**
 * 条目索引项 (轻量级，用于列表展示)
 */
export interface CaiuIndexItem {
  id: string;
  key: string;
  /** 内容摘要 (前 100 字符) */
  summary: string;
  /** 标签快照 (只存名称，用于过滤和显示) */
  tags: string[];
  /** 优先级快照 */
  priority: number;
  /** 是否启用 */
  enabled: boolean;
  updatedAt: number;
  vectorStatus: "none" | "pending" | "ready" | "error";
  /** 内容哈希快照 */
  contentHash?: string;
  /** 已向量化的模型列表 */
  vectorizedModels: string[];
  /** 累计消耗 Token 数 */
  totalTokens?: number;
}

/**
 * 知识库元数据
 */
export interface KnowledgeBaseMeta {
  /** 库 ID */
  id: string;
  /** 知识库名称 */
  name: string;
  /** 知识库描述 */
  description: string | null;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
  /** 向量化配置状态 */
  vectorization: VectorizationMeta;
  /** 已向量化的模型列表 */
  models?: string[];
  /** 条目索引列表 (用于快速显示列表) */
  entries: CaiuIndexItem[];
  /** 标签 */
  tags?: TagWithWeight[];
  /** 图标 Asset ID */
  icon?: string | null;
  /** 库级别配置 */
  config?: KnowledgeBaseConfig;
}

/**
 * 知识库级别配置 (可覆盖全局配置)
 */
export interface KnowledgeBaseConfig {
  /** 针对该库的 RAG 检索 TopK */
  searchTopK?: number;
  /** 最小分数阈值 */
  minScore?: number;
  /** 默认分类/分组 */
  defaultCategory?: string;
  /** 额外元数据 */
  extra?: Record<string, any>;
}

/**
 * 完整知识库结构
 */
export interface KnowledgeBase {
  id: string; // UUID
  /** 元数据 */
  meta: KnowledgeBaseMeta;
  /** 所有的原子知识单元 */
  entries: Caiu[];

  // 以下为 core.rs 中存在的其他字段
  name: string;
  description: string | null;
  schemaVersion: string;
  contentVersion: number;
  vectorization: VectorizationMeta;
}

/**
 * 知识库索引（用于列表展示的轻量级元数据）
 */
export interface KnowledgeBaseIndex {
  id: string;
  name: string;
  description: string | null;
  entryCount: number;
  updatedAt: number;
  /** 累计消耗 Token 数 */
  totalTokens?: number;
  /** 是否已建立索引 */
  isIndexed: boolean;
  /** 存储路径 */
  path: string;
  /** 标签快照 (只存名称) */
  tags?: string[];
  /** 图标快照 */
  icon?: string | null;
}

/**
 * 向量索引配置
 */
export interface VectorIndexConfig {
  /** 是否自动索引 */
  autoIndex: boolean;
  /** 使用的模型 */
  model: string;
  /** 维度 */
  dimension: number;
  /** 算法: "hnsw", "flat" 等 (保留以兼容旧数据或未来扩展) */
  algorithm?: string;
  /** 距离度量: "cosine", "euclidean" (保留以兼容旧数据或未来扩展) */
  metric?: string;
  /** 透镜检索：纹理 (coarse/fine) */
  texture?: "coarse" | "fine";
  /** 透镜检索：折射率 (0.0 - 1.0) */
  refractionIndex?: number;
  /** 向量检索：BM25 k1 */
  k1?: number;
  /** 向量检索：BM25 b */
  b?: number;
  /** 检索数量限制 */
  limit?: number;
  /** 最小分数阈值 */
  minScore?: number;
  /** 兼容动态引擎参数 */
  [key: string]: any;
}

/**
 * 请求配置接口 (限流、重试等)
 */
export interface KnowledgeRequestSettings {
  /** 请求超时时间 (毫秒) */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔 (毫秒) */
  retryInterval: number;
  /** 重试模式：固定间隔或指数退避 */
  retryMode: "fixed" | "exponential";
  /** 并发请求限制 (仅用于批量操作) */
  maxConcurrent: number;
  /** 单次请求包含的批次大小 (仅用于向量化等支持批量的操作) */
  batchSize?: number;
  /** 条目内容最大长度限制 (字符数)，超过此长度将跳过向量化并记录失败 */
  maxContentLength?: number;
}

/**
 * 导入与预处理设置
 */
export interface ImportSettings {
  /** 导入文件时是否自动触发向量化 */
  autoVectorize: boolean;
  /** 导入文件时是否自动提取标签 (从内容标记) */
  autoExtractTags: boolean;
  /** 导入文件时是否自动提取标题 (Markdown H1) */
  autoExtractTitle: boolean;
  /** 批量导入时是否自动去重 (基于内容哈希) */
  deduplicate: boolean;
}

/**
 * 知识库全局工作区配置
 */
export interface WorkspaceConfig {
  /** 当前选中的知识库 ID */
  activeBaseId: string | null;
  /** 向量索引全局配置 */
  vectorIndex: VectorIndexConfig;
  /** 默认嵌入模型 */
  defaultEmbeddingModel?: string;
  /** 导入与预处理设置 */
  importSettings: ImportSettings;
  /** 标签生成配置 */
  tagGeneration: TagGenerationConfig;
  /** 向量化请求设置 */
  embeddingRequestSettings: KnowledgeRequestSettings;
  /** 实验室 (Playground) 配置 */
  playground?: PlaygroundConfig;
}

/**
 * 实验室槽位配置
 */
export interface PlaygroundSlotConfig {
  id: string;
  engineId: string;
  config: {
    embeddingModel: string;
    [key: string]: any;
  };
  results?: SearchResult[];
}

/**
 * 实验室全局配置
 */
export interface PlaygroundConfig {
  /** 选中的知识库 ID 列表 */
  selectedKbIds: string[];
  /** 全局查询词 */
  globalQuery: string;
  /** 槽位配置列表 */
  slots: PlaygroundSlotConfig[];
}

/**
 * 标签生成配置
 */
export interface TagGenerationConfig {
  /** 是否启用自动生成 */
  enabled: boolean;
  /** 使用的模型 ID */
  modelId: string;
  /** 提示词 */
  prompt: string;
  /** 温度 */
  temperature: number;
  /** 最大 Token 数 */
  maxTokens: number;
  /** 请求设置 (独立于向量化) */
  requestSettings: KnowledgeRequestSettings;
}
