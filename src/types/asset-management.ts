/**
 * 全局资产管理系统类型定义
 * 
 * 本文件定义了应用级资产管理系统的核心数据结构。
 * 这些类型可被所有需要文件处理的模块复用。
 */

/**
 * 资产的来源类型
 */
export type AssetOriginType = "local" | "clipboard" | "network";

/**
 * 资产的通用类型
 */
export type AssetType = "image" | "audio" | "video" | "document" | "other";

/**
 * 资产来源信息
 */
export interface AssetOrigin {
  /** 来源类型 */
  type: AssetOriginType;
  /** 原始路径或 URL */
  source: string;
}

/**
 * 资产元数据
 */
export interface AssetMetadata {
  /** 图片宽度（像素） */
  width?: number;
  /** 图片高度（像素） */
  height?: number;
  /** 音视频时长（秒） */
  duration?: number;
  /** 文件 SHA-256 哈希值，用于去重 */
  sha256?: string;
}

/**
 * 代表一个由应用管理的资产文件
 * 
 * 这是核心数据结构，可被应用内任何需要引用本地文件的功能模块复用。
 * 
 * 使用示例：
 * - LLM 聊天: `ChatMessage.attachments?: Asset[]`
 * - OCR 记录: `OcrRecord.sourceImage: Asset`
 * - 其他工具: 任何处理输入输出文件的工具
 */
export interface Asset {
  /**
   * 资产的唯一标识符 (UUID)
   */
  id: string;

  /**
   * 文件的通用类型，用于 UI 快速判断如何展示
   */
  type: AssetType;

  /**
   * 文件的 MIME 类型 (例如 'image/jpeg', 'application/pdf')
   */
  mimeType: string;

  /**
   * 文件的原始名称
   */
  name: string;

  /**
   * 文件在资产存储根目录中的相对路径
   * 例如: 'images/2025-10/f81d4fae-7dec-11d0-a765-00a0c91e6bf6.png'
   */
  path: string;

  /**
   * 可选的预览图/缩略图的相对路径
   */
  thumbnailPath?: string;

  /**
   * 文件大小 (字节)
   */
  size: number;

  /**
   * 文件被添加到系统时的 ISO 8601 时间戳
   */
  createdAt: string;

  /**
   * 资产的来源信息（可选）
   */
  origin?: AssetOrigin;

  /**
   * 可选的、特定于文件类型的元数据
   */
  metadata?: AssetMetadata;
}

/**
 * 资产导入选项
 */
export interface AssetImportOptions {
  /**
   * 是否生成缩略图（默认: true）
   */
  generateThumbnail?: boolean;

  /**
   * 是否计算哈希值进行去重（默认: true）
   */
  enableDeduplication?: boolean;

  /**
   * 自定义来源信息
   */
  origin?: AssetOrigin;
}

/**
 * 资产管理配置
 */
export interface AssetManagerConfig {
  /**
   * 自定义资产存储根目录（可选）
   * 如果未设置，使用默认的 {appDataDir}/assets
   */
  customBasePath?: string;

  /**
   * 缩略图最大尺寸（像素）
   */
  thumbnailMaxSize?: number;
}