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
      concurrency?: number;  // 并发数
      delay?: number;        // 请求延迟（毫秒）
    }
  | {
      type: 'cloud';
      name: string;
      activeProfileId: string; // 当前选中的云端 OCR 服务配置 ID
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
  concurrency: number; // 并发数
  delay: number; // 请求延迟（毫秒）
}

/**
 * Cloud 引擎配置
 */
export interface CloudEngineConfig {
  name: string;
  activeProfileId: string; // 当前选中的云端 OCR 服务配置 ID
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
  imageId: string; // 所属图片ID
  text: string;
  confidence?: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  ignored?: boolean; // 是否被忽略（复制时跳过）
}

/**
 * 智能切图配置
 */
export interface SlicerConfig {
  enabled: boolean;
  aspectRatioThreshold: number; // 长宽比阈值，超过此值才触发切图
  blankThreshold: number; // 空白行判定阈值：方差低于中位数的此比例视为空白行（0-1）
  minBlankHeight: number; // 最小空白横带高度（像素）
  minCutHeight: number; // 最小切割块高度（像素），小于此高度的块会被跳过
  cutLineOffset: number; // 切割线偏移（-1到1，0为居中，负值向上偏移，正值向下偏移）
}

/**
 * 切割线信息
 */
export interface CutLine {
  y: number; // Y坐标
  height: number; // 空白区域高度
}

/**
 * OCR 历史记录索引项 (用于列表快速展示)
 */
export interface OcrHistoryIndexItem {
  id: string;
  assetId: string; // 关联图片的 assetId
  assetPath: string; // 关联图片的相对路径
  assetMimeType: string; // 关联图片的MIME类型
  engine: OcrEngineType;
  createdAt: string;
  textPreview: string; // 识别文本的简短预览
  engineDetail?: string; // 引擎详细信息（如模型名称、语言等）
}

/**
 * OCR 历史记录完整数据
 */
export interface OcrHistoryRecord {
  id: string;
  assetId: string;
  assetPath: string; // 关联图片的相对路径
  assetMimeType: string; // 关联图片的MIME类型
  engine: OcrEngineType;
  engineConfig: OcrEngineConfig; // 完整的引擎配置
  results: OcrResult[]; // 完整的识别结果数组
  createdAt: string;
}