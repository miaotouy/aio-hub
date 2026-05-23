/**
 * 支持的配置文件格式
 */
export type ConfigFormat = "json" | "yaml" | "toml" | "ini" | "xml" | "env";

/**
 * 转换选项
 */
export interface ConvertOptions {
  /** INI 格式的 Section 展平分隔符，默认是 "." */
  iniDelimiter?: string;
  /** XML 格式的根节点名称，默认是 "root" */
  xmlRootName?: string;
  /** XML 格式是否格式化输出 */
  xmlFormat?: boolean;
  /** YAML 格式的缩进空格数，默认是 2 */
  yamlIndent?: number;
  /** JSON 格式的缩进空格数，默认是 2 */
  jsonIndent?: number;
}

/**
 * 转换结果
 */
export interface ConvertResult {
  /** 是否成功 */
  success: boolean;
  /** 转换后的文本内容 */
  output: string;
  /** 错误信息 */
  error?: string;
  /** 警告信息列表 */
  warnings?: string[];
}

/**
 * 批量模式下的文件条目
 */
export interface BatchFileItem {
  /** 唯一标识（通常是完整路径） */
  id: string;
  /** 文件名 */
  name: string;
  /** 完整路径 */
  path: string;
  /** 文件大小（字节） */
  size: number;
  /** 检测到的源格式 */
  sourceFormat: ConfigFormat | "unknown";
  /** 目标格式 */
  targetFormat: ConfigFormat;
  /** 转换状态 */
  status: "pending" | "converting" | "success" | "error" | "skipped";
  /** 转换后的内容（仅预览模式下保存） */
  convertedContent?: string;
  /** 错误信息 */
  error?: string;
  /** 警告信息 */
  warnings?: string[];
}

/**
 * 扫描选项
 */
export interface ScanOptions {
  /** 扫描深度，0 表示无限制 */
  maxDepth: number;
  /** 是否包含隐藏文件 */
  showHidden: boolean;
}
