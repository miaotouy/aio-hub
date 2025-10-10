/**
 * OCR引擎类型
 */
export type OcrEngineType = 'tesseract' | 'native' | 'vlm' | 'cloud';

/**
 * OCR引擎配置
 */
export type OcrEngineConfig =
  | {
      type: 'tesseract';
      name: string;
      language: string;
    }
  | {
      type: 'native';
      name: string;
    }
  | {
      type: 'vlm';
      name: string;
      profileId: string; // 对应 LlmProfile 的 id
      modelId: string;   // 对应 LlmModelInfo 的 id
      prompt: string;    // OCR 提示词
      temperature?: number;  // 温度参数
      maxTokens?: number;    // 最大 token 数
    }
  | {
      type: 'cloud';
      name: string;
      apiEndpoint: string;
      apiKey: string;
    };

/**
 * Tesseract 引擎配置
 */
export interface TesseractEngineConfig {
  name: string;
  language: string;
}

/**
 * Native 引擎配置
 */
export interface NativeEngineConfig {
  name: string;
}

/**
 * VLM 引擎配置
 */
export interface VlmEngineConfig {
  name: string;
  profileId: string;
  modelId: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Cloud 引擎配置
 */
export interface CloudEngineConfig {
  name: string;
  apiEndpoint: string;
  apiKey: string;
}

/**
 * 所有引擎的配置集合
 */
export interface EngineConfigs {
  tesseract: TesseractEngineConfig;
  native: NativeEngineConfig;
  vlm: VlmEngineConfig;
  cloud: CloudEngineConfig;
}

/**
 * 上传的图片信息
 */
export interface UploadedImage {
  id: string;
  file: File;
  img: HTMLImageElement;
  name: string;
  size: number;
  dataUrl: string;
}

/**
 * 图片块信息
 */
export interface ImageBlock {
  id: string;
  imageId: string; // 所属图片ID
  canvas: HTMLCanvasElement;
  dataUrl: string;
  startY: number;
  endY: number;
  width: number;
  height: number;
}

/**
 * OCR识别结果
 */
export interface OcrResult {
  blockId: string;
  text: string;
  confidence?: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

/**
 * 智能切图配置
 */
export interface SlicerConfig {
  enabled: boolean;
  aspectRatioThreshold: number; // 长宽比阈值，超过此值才触发切图
  blankThreshold: number; // 空白行判定阈值：黑色像素占比小于此值视为空白行（0-1，默认0.05表示5%）
  minBlankHeight: number; // 最小空白横带高度（像素）
  minCutHeight: number; // 最小切割块高度（像素），小于此高度的块会被跳过
}

/**
 * 切割线信息
 */
export interface CutLine {
  y: number; // Y坐标
  height: number; // 空白区域高度
}