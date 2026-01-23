/**
 * 全局资产管理系统类型定义
 * 
 * 本文件定义了应用级资产管理系统的核心数据结构。
 * 这些类型可被所有需要文件处理的模块复用。
 */

/**
 * 资产的来源类型
 */
export type AssetOriginType = "local" | "clipboard" | "network" | "generated";

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
  /** 来源模块 (e.g., 'llm-chat', 'smart-ocr') */
  sourceModule: string;
}

/**
 * 衍生数据信息 (例如：转录文本、OCR 结果、翻译等)
 */
export interface DerivedDataInfo {
  /** 衍生数据文件的相对路径 (例如: "transcriptions/uuid.json") */
  path?: string;
  /** 最后更新时间 (ISO 8601) */
  updatedAt: string;
  /** 提供者标识 (例如: "whisper-local", "azure-ocr") */
  provider?: string;
  /** 错误信息 (如果生成失败) */
  error?: string;
  /** 警告信息 (如果生成成功但结果可能有问题，例如内容为空) */
  warning?: string;
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
  /** 衍生数据映射表，key 为类型 (e.g., "transcription", "ocr") */
  derived?: Record<string, DerivedDataInfo>;
}

/**
 * 资产导入状态
 */
export type AssetImportStatus = 'pending' | 'importing' | 'complete' | 'error';

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
   * 资产来源的模块标识 (e.g., 'llm-chat', 'smart-ocr')
   *
   * 为了便于索引和筛选，此字段直接在 Asset 对象上提供，
   * 尽管它也存在于 origin 对象中。
   */
  sourceModule: string;

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
   *
   * 注意：当 importStatus 为 'pending' 或 'importing' 时，
   * 这个字段存储的是原始文件的绝对路径，用于立即预览
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
   * 资产的来源信息列表（支持多个来源）
   * 当相同内容从不同来源导入时，会合并到同一个资产的来源列表中
   */
  origins: AssetOrigin[];

  /**
   * 可选的、特定于文件类型的元数据
   */
  metadata?: AssetMetadata;

  /**
   * 导入状态（可选，默认为 'complete'）
   * - pending: 待导入（刚拖入，还未开始导入）
   * - importing: 导入中（正在复制文件、生成缩略图等）
   * - complete: 导入完成（已成功导入到资产库）
   * - error: 导入失败
   */
  importStatus?: AssetImportStatus;

  /**
   * 导入错误信息（仅当 importStatus 为 'error' 时）
   */
  importError?: string;

  /**
   * 原始文件路径（仅用于 pending/importing 状态，导入完成后会被清除）
   * 用于在导入前进行即时预览
   */
  originalPath?: string;
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

  /**
   * 来源模块 ID (e.g., 'llm-chat')
   *
   * 如果提供了 origin 对象，此字段将被忽略。
   * 如果只提供了 sourceModule，将用于构建一个默认的 origin 对象。
   */
  sourceModule?: string;

  /**
   * 指定一个子目录来存储资产，而不是按类型和日期
   */
  subfolder?: string;
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

/**
 * 重复文件信息
 */
export interface DuplicateFileInfo {
  /** 文件哈希值 */
  hash: string;
  /** 重复文件的相对路径列表 */
  files: string[];
  /** 文件总大小（单个文件大小） */
  size: number;
  /** 重复文件数量 */
  count: number;
}

/**
 * 重复文件检测结果
 */
export interface DuplicateFilesResult {
  /** 重复文件组列表 */
  duplicates: DuplicateFileInfo[];
  /** 总共的重复文件组数 */
  totalGroups: number;
  /** 总共的重复文件数 */
  totalFiles: number;
  /** 可节省的空间（字节） */
  wastedSpace: number;
}

/**
 * 资产分组方式
 */
export type AssetGroupBy = 'month' | 'type' | 'origin' | 'source-module' | 'none';

// --- 懒加载与分页类型 ---

export type AssetSortBy = 'date' | 'name' | 'size';
export type SortOrder = 'asc' | 'desc';

export interface ListAssetsPaginatedPayload {
  page: number;
  pageSize: number;
  sortBy: AssetSortBy;
  sortOrder: SortOrder;
  filterType?: AssetType | 'all';
  filterOrigin?: AssetOriginType | 'all';
  filterSourceModule?: string | 'all';
  searchQuery?: string;
  showDuplicatesOnly?: boolean;
}

export interface PaginatedAssetsResponse {
  items: Asset[];
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
  page: number;
}

export interface AssetStats {
  totalAssets: number;
  totalSize: number;
  typeCounts: Record<AssetType, number>;
  sourceModuleCounts: Record<string, number>;
  originCounts: Record<AssetOriginType, number>;
}

/**
 * 资产附属操作接口
 * 用于在资产管理器等地方为资产提供额外的操作菜单
 */
export interface AssetSidecarAction {
  /** 操作唯一标识 */
  id: string;
  /** 显示名称 */
  label: string;
  /** 图标 (Element Plus 图标组件名称或 Lucide 图标名称) */
  icon?: any;
  /** 执行操作的处理函数 */
  handler: (asset: Asset) => void | Promise<void>;
  /** 判断该操作是否对当前资产可见 */
  isVisible: (asset: Asset) => boolean;
  /** 是否在上方显示分割线 */
  divided?: boolean;
  /** 排序权重，越小越靠前 */
  order?: number;
}