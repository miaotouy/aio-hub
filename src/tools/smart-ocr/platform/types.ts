import type { PluginOcrSelectOption } from "@/services/plugin-types";
import type {
  CloudEngineConfig,
  CutLine,
  EngineConfigs,
  ImageBlock,
  NativeEngineConfig,
  OcrEngineConfig,
  OcrEngineType,
  OcrHistoryIndexItem,
  OcrHistoryRecord,
  OcrResult,
  PluginOcrEngineConfig,
  SlicerConfig,
  TesseractEngineConfig,
  UploadedImage,
  VlmEngineConfig,
} from "../types";

export type {
  CloudEngineConfig,
  CutLine,
  EngineConfigs,
  ImageBlock,
  NativeEngineConfig,
  OcrEngineConfig,
  OcrEngineType,
  OcrHistoryIndexItem,
  OcrHistoryRecord,
  OcrResult,
  PluginOcrEngineConfig,
  SlicerConfig,
  TesseractEngineConfig,
  UploadedImage,
  VlmEngineConfig,
};

export interface OcrImageInput {
  id: string;
  groupId?: string;
  /** 本地临时图片路径（零拷贝优先） */
  path?: string;
  /** 兼容现有行为：path 不存在时回退到 dataUrl */
  dataUrl?: string;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
}

export interface OcrRunOptions {
  onProgress?: (results: OcrResult[]) => void;
}

export interface OcrBox {
  text?: string;
  confidence?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrExtension {
  id: string;
  contributionId: string;
  pluginId: string;
  pluginName: string;
  name: string;
  description?: string;
  method: string;
  modelProfiles: PluginOcrSelectOption[];
  defaultModelProfile?: string;
  languages: PluginOcrSelectOption[];
  defaultLanguage?: string;
  capabilities?: {
    batch?: boolean;
    detectionBoxes?: boolean;
    confidence?: boolean;
    preferredImageMimeTypes?: string[];
    maxBatchSize?: number;
    maxImagePixels?: number;
  };
  enabled: boolean;
  broken: boolean;
  devMode?: boolean;
}
