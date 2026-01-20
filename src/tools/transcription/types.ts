import type { Asset } from "@/types/asset-management";

/**
 * 转写任务状态
 */
export type TranscriptionTaskStatus = "pending" | "processing" | "completed" | "error" | "cancelled";

/**
 * 转写任务接口
 */
export interface TranscriptionTask {
  id: string;
  assetId: string;
  assetType: "image" | "audio" | "video" | "document";
  path: string; // Asset 相对路径
  status: TranscriptionTaskStatus;
  error?: string;
  retryCount: number;
  createdAt: number;
  startedAt?: number; // 开始处理时间
  completedAt?: number; // 完成/失败时间
  progress?: number; // 处理进度 (0-100)
  mimeType?: string;
  filename?: string;
  resultPath?: string;
  resultText?: string;
  tempFilePath?: string;
  // 覆盖配置
  overrideConfig?: Partial<TranscriptionConfig>;
  // 中断控制
  abortController?: AbortController;
}

/**
 * 分类型精细配置
 */
export interface TypeSpecificConfig {
  modelIdentifier: string;
  customPrompt: string;
  additionalPrompt?: string;
  temperature: number;
  maxTokens: number;
  enableRepetitionDetection?: boolean;
}

/**
 * 视频特定配置
 */
export interface VideoSpecificConfig extends TypeSpecificConfig {
  maxDirectSizeMB: number;
  enableCompression: boolean;
  maxFps: number;
  maxResolution: number;
  enableGpu?: boolean;
  autoAdjustResolution?: boolean;
}

/**
 * 全局转写配置
 */
export interface TranscriptionConfig {
  autoStartOnImport: boolean;
  modelIdentifier: string;
  customPrompt: string;
  additionalPrompt?: string;
  temperature: number;
  maxTokens: number;
  maxConcurrentTasks: number;
  executionDelay: number;
  maxRetries: number;
  timeout: number; // 秒
  enableRepetitionDetection: boolean;
  repetitionConfig?: {
    /** 连续重复的行/句阈值 (默认 3) */
    consecutiveThreshold?: number;
    /** 全局片段高频重复阈值 (默认 5) */
    globalThreshold?: number;
    /** 白名单片段，不触发复读检测 */
    whitelist?: string[];
  };
  enableImageSlicer: boolean;
  imageSlicerConfig: {
    aspectRatioThreshold: number;
    blankThreshold: number;
    minBlankHeight: number;
    minCutHeight: number;
    cutLineOffset: number;
  };
  ffmpegPath?: string;
  image: TypeSpecificConfig;
  audio: TypeSpecificConfig;
  video: VideoSpecificConfig;
  document: TypeSpecificConfig;
}

/**
 * 引擎执行上下文
 */
export interface EngineContext {
  task: TranscriptionTask;
  config: TranscriptionConfig;
  signal?: AbortSignal;
}

/**
 * 引擎执行结果
 */
export interface EngineResult {
  text: string;
  isEmpty?: boolean;
  warning?: string;
}

/**
 * 转写引擎接口
 */
export interface ITranscriptionEngine {
  /**
   * 检查是否能处理该资产
   */
  canHandle(asset: Asset): boolean;
  /**
   * 执行转写/提取
   */
  execute(ctx: EngineContext): Promise<EngineResult>;
}