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
  mimeType?: string;
  filename?: string;
  resultPath?: string;
  resultText?: string;
  tempFilePath?: string;
  // 覆盖配置
  overrideConfig?: Partial<TranscriptionConfig>;
}

/**
 * 分类型精细配置
 */
export interface TypeSpecificConfig {
  modelIdentifier: string;
  customPrompt: string;
  temperature: number;
  maxTokens: number;
}

/**
 * 视频特定配置
 */
export interface VideoSpecificConfig extends TypeSpecificConfig {
  maxDirectSizeMB: number;
  enableCompression: boolean;
  maxFps: number;
  maxResolution: number;
}

/**
 * 全局转写配置
 */
export interface TranscriptionConfig {
  autoStartOnImport: boolean;
  modelIdentifier: string;
  customPrompt: string;
  temperature: number;
  maxTokens: number;
  maxConcurrentTasks: number;
  executionDelay: number;
  maxRetries: number;
  timeout: number; // 秒
  enableRepetitionDetection: boolean;
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