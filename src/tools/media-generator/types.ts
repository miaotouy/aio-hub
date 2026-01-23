import type { ChatSession } from '@/tools/llm-chat/types/session';
import type { Asset } from '@/types/asset-management';

/**
 * 媒体生成任务类型
 */
export type MediaTaskType = 'image' | 'video' | 'audio';

/**
 * 媒体生成任务状态
 */
export type MediaTaskStatus = 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';

/**
 * 媒体生成任务
 */
export interface MediaTask {
  /** 任务唯一ID */
  id: string;
  /** 关联的会话ID */
  sessionId?: string;
  /** 媒体类型 */
  type: MediaTaskType;
  /** 当前状态 */
  status: MediaTaskStatus;

  /** 输入参数 */
  input: {
    /** 提示词 */
    prompt: string;
    /** 负向提示词 */
    negativePrompt?: string;
    /** 使用的模型ID */
    modelId: string;
    /** 使用的渠道配置ID */
    profileId: string;
    /** 模型特定参数 (如 seed, sampler, steps, cfg_scale 等) */
    params: Record<string, any>;
    /** 参考资产ID列表 (用于图生图、变体等) */
    referenceAssetIds?: string[];
    /** 是否包含上下文（多轮对话迭代） */
    includeContext?: boolean;
  };

  /** 状态跟踪 */
  /** 生成进度 (0-100) */
  progress: number;
  /** 状态描述文本 */
  statusText?: string;
  /** 错误信息 */
  error?: string;

  /** 结果关联 */
  /** 生成成功后的资产ID */
  resultAssetId?: string;
  /** 关联的完整资产对象 (可选，用于 UI 渲染) */
  resultAsset?: Asset;
  /** 临时预览地址 (Base64 或 Blob URL) */
  previewUrl?: string;

  /** 时间线 */
  createdAt: number;
  completedAt?: number;
}

/**
 * 媒体生成会话配置
 */
export interface MediaGenerationConfig {
  /** 最近使用的模型ID */
  lastUsedModelId: string;
  /** 最近使用的参数快照 */
  lastUsedParams: Record<string, any>;
  /** 默认生成类型 */
  defaultType: MediaTaskType;
}

/**
 * 媒体生成会话
 * 复用 llm-chat 的 Session 结构，但标记为 media-gen 类型并携带生成配置
 */
export type GenerationSession = ChatSession & {
  /** 标记会话类型为媒体生成 */
  type: 'media-gen';
  /** 媒体生成专属配置 */
  generationConfig: MediaGenerationConfig;
};

/**
 * 资产衍生数据中的生成信息
 * 存储于 AssetMetadata.derived["generation"]
 */
export interface AssetGenerationInfo {
  /** 任务ID */
  taskId: string;
  /** 提示词 */
  prompt: string;
  /** 负向提示词 */
  negativePrompt?: string;
  /** 模型ID */
  modelId: string;
  /** 核心参数快照 */
  params: Record<string, any>;
  /** 种子值 */
  seed?: number | string;
  /** 来源模块 */
  sourceModule: 'media-generator';
  /** 生成时间 */
  timestamp: number;
}