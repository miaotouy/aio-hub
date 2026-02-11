import type { ChatSession } from "@/tools/llm-chat/types/session";
import type { ChatMessageNode } from "@/tools/llm-chat/types/message";
import type { TranslationConfig } from "@/tools/llm-chat/types/settings";
import type { Asset } from "@/types/asset-management";

/**
 * 媒体生成任务类型
 */
export type MediaTaskType = "image" | "video" | "audio";

/**
 * 媒体生成任务状态
 */
export type MediaTaskStatus = "pending" | "processing" | "completed" | "error" | "cancelled";
/**
 * 媒体生成消息
 * 继承自聊天消息节点，增强媒体生成相关的元数据
 */
export interface MediaMessage extends ChatMessageNode {
  /**
   * 附加元数据
   */
  metadata: ChatMessageNode["metadata"] & {
    /** 关联的任务 ID */
    taskId?: string;
    /** 标记是否为生成任务节点 */
    isMediaTask?: boolean;
    /** 该节点生成时是否携带了上下文 (用于多轮对话) */
    includeContext?: boolean;
    /** 媒体任务快照 (用于 UI 快速访问，实际状态应通过 store 获取) */
    taskSnapshot?: MediaTask;
    /** 翻译后的内容 (用于发送给模型的译文) */
    translatedContent?: string;
  };
  /** 是否被选中作为下一轮的上下文 (用于多选模式) */
  isSelected?: boolean;
}

/**
 * 媒体生成任务
 */
export interface MediaTask {
  /** 任务唯一ID (通常与关联的 assistant 消息 ID 一致) */
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
    /** 选中的上下文消息 ID 列表 */
    contextMessageIds?: string[];
    /** 是否包含完整历史上下文 */
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
  /** 生成成功后的资产ID列表 */
  resultAssetIds?: string[];
  /** 关联的完整资产对象列表 (可选，用于 UI 渲染) */
  resultAssets?: Asset[];
  /** 临时预览地址列表 (Base64 或 Blob URL) */
  previewUrls?: string[];

  /** 兼容性字段 (保留单数形式作为首个结果的快捷访问) */
  /** @deprecated 使用 resultAssetIds */
  resultAssetId?: string;
  /** @deprecated 使用 resultAssets */
  resultAsset?: Asset;
  /** @deprecated 使用 previewUrls */
  previewUrl?: string;

  /** 时间线 */
  createdAt: number;
  completedAt?: number;
}

/**
 * 特定媒体类型的配置状态
 */
export interface MediaTypeConfig {
  /** 最近使用的模型组合 (profileId:modelId) */
  modelCombo: string;
  /** 最近使用的参数快照 */
  params: {
    size: string;
    quality: string;
    style: string;
    negativePrompt: string;
    seed: number;
    steps: number;
    cfgScale: number;
    background: string;
    inputFidelity: string;
    duration: number; // 视频时长 (默认 5)
    // Suno 专属
    suno_mode?: "simple" | "custom";
    mv?: string;
    tags?: string;
    title?: string;
    make_instrumental?: boolean;
    [key: string]: any;
  };
}

/**
 * 媒体生成会话配置
 */
export interface MediaGenerationConfig {
  /** 当前选中的媒体类型 */
  activeType: MediaTaskType;
  /** 是否包含上下文 (多轮对话) */
  includeContext?: boolean;
  /** 各类型的独立配置 */
  types: Record<MediaTaskType, MediaTypeConfig>;
}

/**
 * 通用的 LLM 辅助任务配置 (如话题生成、提示词优化)
 */
export interface LlmTaskConfig {
  /** 模型配置 (profileId:modelId) */
  modelCombo: string;
  /** 提示词模板 */
  prompt: string;
  /** 温度 */
  temperature: number;
  /** 最大 token 数 */
  maxTokens: number;
}

/**
 * 媒体生成器全局设置
 */
export interface MediaGeneratorSettings {
  /** 话题生成配置 */
  topicNaming: LlmTaskConfig;
  /** 是否启用自动命名 */
  enableAutoNaming: boolean;
  /** 是否自动清理已完成的任务 */
  autoCleanCompleted: boolean;
  /** 生成成功后是否自动打开资产 */
  autoOpenAsset: boolean;
  /** 最大同时进行的任务数 */
  maxConcurrentTasks: number;
  /** 是否启用通知 */
  enableNotifications: boolean;
  /** 提示词优化配置 */
  promptOptimization: LlmTaskConfig;
  /** 左侧面板折叠状态 */
  leftCollapsed: boolean;
  /** 右侧面板折叠状态 */
  rightCollapsed: boolean;
  /** 翻译设置 */
  translation: TranslationConfig;
}

/**
 * 媒体生成会话
 * 全面对齐 ChatSession 的树形结构，但标记为 media-gen 类型并携带生成配置
 */
export interface GenerationSession extends Omit<ChatSession, "nodes"> {
  /** 标记会话类型 */
  type: "media-gen";
  /** 媒体生成专属配置 */
  generationConfig: MediaGenerationConfig;
  /** 节点池 (MediaMessage 列表) */
  nodes: Record<string, MediaMessage>;
  /** 输入框内容草稿 */
  inputPrompt?: string;

  /** 兼容旧版字段 (可选，迁移后可移除) */
  messages?: MediaMessage[];
}

/**
 * 媒体生成会话索引项
 */
export interface MediaSessionIndexItem {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  taskCount: number;
}

/**
 * 媒体生成会话索引
 */
export interface MediaSessionsIndex {
  version: string;
  currentSessionId: string | null;
  sessions: MediaSessionIndexItem[];
}

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
  sourceModule: "media-generator";
  /** 生成时间 */
  timestamp: number;
}

/**
 * 媒体生成状态同步键
 */
export const MEDIA_GEN_STATE_KEYS = {
  INPUT_STATE: "media-gen-input-state" as const,
} as const;
