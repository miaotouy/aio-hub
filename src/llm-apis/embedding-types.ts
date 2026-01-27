/**
 * 嵌入任务类型 (主要用于 Gemini/Cohere，OpenAI 会忽略)
 * - RETRIEVAL_QUERY: 用于检索查询（如用户的问题）
 * - RETRIEVAL_DOCUMENT: 用于被检索的文档（如知识库内容）
 * - SEMANTIC_SIMILARITY: 用于计算两个文本的语义相似度
 * - CLASSIFICATION: 用于文本分类
 * - CLUSTERING: 用于聚类
 */
export type EmbeddingTaskType = 
  | 'RETRIEVAL_QUERY' 
  | 'RETRIEVAL_DOCUMENT' 
  | 'SEMANTIC_SIMILARITY' 
  | 'CLASSIFICATION' 
  | 'CLUSTERING';

/**
 * Embedding 请求选项
 */
export interface EmbeddingRequestOptions {
  /** 模型 ID */
  modelId: string;
  
  /** 
   * 输入文本
   * 支持单个字符串或字符串数组（批量处理）
   */
  input: string | string[];
  
  /** 
   * 期望的维度 (OpenAI text-embedding-3 等模型支持) 
   */
  dimensions?: number;
  
  /** 
   * 用户标识 
   */
  user?: string;
  
  /** 
   * 任务类型 (Gemini/Cohere 专用)
   * 默认为 'RETRIEVAL_QUERY'
   * 建议上层根据场景显式指定
   */
  taskType?: EmbeddingTaskType;
  
  /**
   * 文档标题 (Gemini 专用，仅当 taskType 为 RETRIEVAL_DOCUMENT 时有效)
   */
  title?: string;

  /**
   * 编码格式 (Cohere 专用)
   * - 'float': 标准浮点数 (默认)
   * - 'int8': 8位整数量化
   * - 'uint8': 无符号8位整数量化
   * - 'binary': 二进制量化
   * - 'ubinary': 无符号二进制量化
   */
  encodingFormat?: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary';

  /** 超时时间 (毫秒) */
  timeout?: number;
  
  /** AbortSignal */
  signal?: AbortSignal;

  /** 是否强制走后端代理 */
  forceProxy?: boolean;
  /** 放宽证书校验 */
  relaxIdCerts?: boolean;
  /** 强制 HTTP/1.1 */
  http1Only?: boolean;
}

/**
 * 单个 Embedding 数据对象
 */
export interface EmbeddingObject {
  /** 嵌入向量 */
  embedding: number[];
  /** 在输入列表中的索引 */
  index: number;
  /** 对象类型，固定为 'embedding' */
  object: 'embedding';
}

/**
 * Embedding 响应
 */
export interface EmbeddingResponse {
  /** Embedding 数据列表 */
  data: EmbeddingObject[];
  /** 模型名称 */
  model: string;
  
  /** Token 使用情况 */
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
  
  /** 对象类型，固定为 'list' */
  object: 'list';
}