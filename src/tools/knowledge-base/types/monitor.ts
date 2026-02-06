/**
 * 知识库监控消息类型
 */
export type KbMessageType = "RAG" | "Index" | "Chain" | "System";

/**
 * 监控消息级别
 */
export type KbMonitorLevel = "info" | "warn" | "error" | "success";

/**
 * 步骤状态
 */
export type KbStepStatus = "pending" | "running" | "completed" | "failed";

/**
 * 基础监控消息接口
 */
interface KbMonitorMessageBase {
  /** 唯一标识符 */
  id: string;
  /** 消息级别 */
  level: KbMonitorLevel;
  /** 时间戳 (ms) */
  timestamp: number;
  /** 标题 */
  title: string;
  /** 简要总结 */
  summary: string;
  /** 细分模块，如 "VectorEngine", "FileScanner" */
  module: string;
}

/**
 * RAG 检索追踪数据结构
 */
export interface RagPayload {
  /** 检索步骤详情 */
  steps: Array<{
    /** 步骤名称 */
    name: string;
    /** 状态 */
    status: KbStepStatus;
    /** 耗时 (ms) */
    duration: number;
    /** 详细信息 */
    details?: string;
  }>;
  /** 检索结果片段 */
  results?: Array<{
    /** 文档片段 ID */
    id: string;
    /** 相似度分数 */
    score: number;
    /** 文本内容 */
    content: string;
    /** 来源文件/路径 */
    source?: string;
    /** 额外元数据 */
    metadata?: Record<string, any>;
  }>;
  /** 统计信息 */
  stats: {
    /** 总耗时 (ms) */
    duration: number;
    /** 消耗 Token 数 */
    tokenCount?: number;
    /** 命中的片段数 */
    hitCount?: number;
    /** 召回的原始片段数 */
    recallCount?: number;
  };
  /** 检索上下文元数据 */
  metadata?: {
    /** 查询语句 */
    query: string;
    /** 使用的模型 ID */
    modelId: string;
    /** 使用的引擎 ID */
    engineId: string;
    /** 检索的知识库 ID 列表 */
    kbIds: string[];
  };
}

/**
 * 索引生命周期追踪数据结构
 */
export interface IndexPayload {
  /** 索引步骤详情 */
  steps: Array<{
    /** 步骤名称 */
    name: string;
    /** 状态 */
    status: KbStepStatus;
    /** 耗时 (ms) */
    duration: number;
    /** 详细信息 */
    details?: string;
  }>;
  /** 索引统计信息 */
  stats: {
    /** 总文件数 */
    totalFiles: number;
    /** 已处理文件数 */
    processedFiles: number;
    /** 总切片数 */
    totalChunks: number;
    /** 已向量化切片数 */
    vectorizedChunks: number;
    /** 总耗时 (ms) */
    duration: number;
  };
  /** 索引任务元数据 */
  metadata?: {
    /** 知识库 ID */
    kbId: string;
    /** 使用的模型 ID */
    modelId: string;
    /** 包含的文件模式 */
    filePatterns: string[];
  };
}

/**
 * 链式处理追踪数据结构
 */
export interface ChainPayload {
  /** 链式步骤详情 */
  steps: Array<{
    /** 步骤名称 */
    name: string;
    /** 状态 */
    status: KbStepStatus;
    /** 耗时 (ms) */
    duration: number;
    /** 详细信息 */
    details?: string;
  }>;
  /** 链式任务元数据 */
  metadata?: {
    /** 链类型 */
    chainType: string;
    /** 参数详情 */
    parameters: Record<string, any>;
  };
}

/**
 * 系统级消息数据结构
 */
export interface SystemPayload {
  /** 系统统计指标 */
  stats?: Record<string, number>;
  /** 系统元数据 */
  metadata?: Record<string, any>;
}

/**
 * 核心监控消息类型 (Tagged Union)
 */
export type KbMonitorMessage =
  | (KbMonitorMessageBase & { type: "RAG"; payload: RagPayload })
  | (KbMonitorMessageBase & { type: "Index"; payload: IndexPayload })
  | (KbMonitorMessageBase & { type: "Chain"; payload: ChainPayload })
  | (KbMonitorMessageBase & { type: "System"; payload: SystemPayload });
