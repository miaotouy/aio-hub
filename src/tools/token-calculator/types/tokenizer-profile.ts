/**
 * 分词器资产注册表类型定义
 *
 * 详见 docs/Plan/分词器资产注册表方案.md
 */

/**
 * 分词器置信度
 * - exact: 与该模型的官方分词完全一致
 * - close: 同家族近似分词
 * - estimated: 字符级或经验估算
 */
export type TokenizerConfidence = "exact" | "close" | "estimated";

/**
 * 用户导入 / 远端下载资产的原始形态
 */
export type TokenizerAssetFormat =
  | "hf-tokenizer-json"
  | "hf-directory"
  | "tiktoken-bpe"
  | "sentencepiece-model"
  | "tekken-json"
  | "gguf-metadata"
  | "legacy-bpe"
  | "wordpiece-vocab"
  | "unknown";

/**
 * Profile 来源类型
 */
export type TokenizerSource =
  | {
      /** 应用打包内置 */
      type: "bundled";
      /** 用于动态 import 的标识（仅供主线程注册器识别） */
      packageName: string;
      /** 模块导出的成员名（默认 fromPreTrained） */
      exportName?: string;
    }
  | {
      /** 用户从本地导入的 tokenizer 资产 */
      type: "local";
      /** 导入资产形态 */
      format?: TokenizerAssetFormat;
      /** tokenizer.json 在 AppData 中的绝对路径 */
      tokenizerJsonPath: string;
      tokenizerConfigPath?: string;
      /** 其它被识别但当前版本暂不直接消费的资产 */
      assetFilePaths?: Record<string, string>;
      /** 原始导入路径（便于 UI 排查来源） */
      originalPath?: string;
    }
  | {
      /** 远端下载的 tokenizer 资产 */
      type: "remote";
      format?: TokenizerAssetFormat;
      tokenizerJsonUrl: string;
      tokenizerConfigUrl?: string;
      tokenizerJsonSha256?: string;
      tokenizerConfigSha256?: string;
      assetFileUrls?: Record<string, string>;
      assetFileSha256?: Record<string, string>;
      /** 下载到本地后的缓存路径（首次安装后写入） */
      cachedTokenizerJsonPath?: string;
      cachedTokenizerConfigPath?: string;
    };

/**
 * 校准参数（针对没有精确分词器的供应商，例如新 Claude）
 */
export interface TokenizerCalibration {
  /** 乘性倍率，默认 1 */
  multiplier?: number;
  /** 每次调用的固定 overhead */
  fixedOverhead?: number;
  /** 每条 chat 消息的额外 overhead（LLM Chat 用） */
  perMessageOverhead?: number;
  /** 每个工具/函数 schema 的额外 overhead */
  perToolOverhead?: number;
  /** 上下文截断时保留的安全比例（0-1） */
  reserveRatio?: number;
}

/**
 * 分词器 Profile
 */
export interface TokenizerProfile {
  /** Profile 唯一 ID（命名空间：内置=直接 ID，用户=user.xxx，远端=remote.xxx） */
  id: string;
  /** 显示名 */
  name: string;
  /** Profile 版本，便于后续升级 */
  version: string;
  /** 描述 */
  description?: string;
  /** 用于 modelId → profile 自动匹配的正则模式 */
  modelPatterns: string[];
  /** 来源 */
  source: TokenizerSource;
  /** 置信度 */
  confidence: TokenizerConfidence;
  /** 校准参数（可选） */
  calibration?: TokenizerCalibration;
  /** 许可证 */
  license?: string;
  /** 主页 / 来源链接 */
  homepage?: string;
  /** 标签（用于检索） */
  tags?: string[];
  /** 是否启用（用户可在 UI 上禁用，默认 true） */
  enabled?: boolean;
  /** 安装时间（ISO 8601，远端 / 用户导入时由系统写入） */
  installedAt?: string;
}

/**
 * 用户自定义匹配规则
 *
 * 在 modelId → profile 的解析中，用户规则优先于 metadata.tokenizer 与 profile.modelPatterns
 */
export interface TokenizerRule {
  id: string;
  /** 匹配模型 ID 的正则 */
  pattern: string;
  /** 目标 profileId */
  profileId: string;
  /** 优先级（数字越大优先级越高，默认 0） */
  priority?: number;
  /** 是否启用 */
  enabled?: boolean;
  /** 备注 */
  description?: string;
}

/**
 * 内置 profile 索引项（应用打包入 bundle 的轻量元数据）
 */
export interface BuiltinTokenizerEntry extends TokenizerProfile {
  source: Extract<TokenizerSource, { type: "bundled" }>;
  /**
   * 动态加载器（仅在主线程或 Worker 内有效，不会被序列化）
   *
   * 这是一个不可序列化的函数，所以不会进入持久化/postMessage 通道，
   * 仅在 Worker 内根据 packageName 重新解析。
   */
  loader?: () => Promise<{
    fromPreTrained: () => unknown;
  }>;
}

/**
 * 导入前的资产探测结果
 */
export interface TokenizerImportScanResult {
  format: TokenizerAssetFormat;
  files: Record<string, string>;
  warnings: string[];
  loadability: "direct" | "convertible" | "unsupported";
  suggestedConfidence: TokenizerConfidence;
  detectedTokenizerClass?: string;
  detectedModelType?: string;
  detectedSpecialTokens?: string[];
  sourceKind: "file" | "directory" | "remote";
  rootPath?: string;
  tokenizerConfigGenerated?: boolean;
}
