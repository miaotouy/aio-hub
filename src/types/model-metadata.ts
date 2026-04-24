/**
 * 模型元数据匹配规则配置类型定义
 *
 * 这是一个通用的模型元数据管理系统，支持为模型预设任意属性，
 * 包括但不限于：图标、分组、能力标签、上下文长度、价格等。
 */

/**
 * 匹配规则类型
 */
export type MetadataMatchType = "provider" | "model" | "modelPrefix" | "modelGroup";

/**
 * 模型元数据属性
 *
 * 这是一个开放的接口，允许存储任意模型相关的元数据。
 * 你可以根据需要添加新的属性字段。
 */
export interface ModelMetadataProperties {
  /** 图标路径（相对于 public 目录或绝对路径） */
  icon?: string;

  /** 使用的分词器名称（用于 Token 计算） */
  tokenizer?: string;

  /** 分组名称 */
  group?: string;

  /** 模型能力（与 LlmModelInfo.capabilities 结构相同） */
  capabilities?: import("./llm-profiles").ModelCapabilities;

  /** 上下文长度（token 数） */
  contextLength?: number;

  /** 价格信息 */
  pricing?: {
    /** 输入价格（每百万 token） */
    input?: number;
    /** 输出价格（每百万 token） */
    output?: number;
    /** 缓存命中时的输入价格（每百万 token） */
    cacheHitInput?: number;
    /** 价格单位（如：'USD', 'CNY'） */
    unit?: string;
    /** 额外说明（如：'按需计费', '包月套餐'） */
    note?: string;
  };

  /** 模型描述 */
  description?: string;

  /** 推荐用途（如：['对话', '代码生成', '文档分析']） */
  recommendedFor?: string[];

  /** 模型版本 */
  version?: string;

  /** 发布日期（ISO 8601 格式） */
  releaseDate?: string;

  /** API 端点 URL */
  apiEndpoint?: string;

  /** 支持的功能特性 */
  features?: {
    /** 是否支持流式输出 */
    streaming?: boolean;
    /** 是否支持函数调用 */
    functionCalling?: boolean;
    /** 是否支持视觉输入 */
    vision?: boolean;
    /** 是否支持音频输入 */
    audio?: boolean;
    /** 其他自定义特性 */
    [key: string]: boolean | undefined;
  };

  /** 媒体生成参数规则（仅对图像/视频生成类模型有效） */
  mediaGenParams?: MediaGenParamRules;

  /** 任意其他元数据（允许动态扩展） */
  [key: string]: unknown;
}

/**
 * 媒体生成参数规则配置
 * 描述一个模型支持哪些生成参数，以及各参数的约束。
 *
 * 字段含义：
 * - 字段缺失（undefined）= 不限制，透传用户输入
 * - supported: false = 明确不支持，发送请求时剔除该参数
 * - supported: true = 支持，根据 options/min/max 约束
 */
export interface MediaGenParamRules {
  // ========== 尺寸控制 ==========

  /**
   * 标准尺寸控制（widthxheight 格式，如 "1024x1024"）
   * 用于 OpenAI / SiliconFlow 等接口的 `size` 参数
   */
  size?: {
    /**
     * 尺寸模式
     * - 'preset': 只能从预设列表中选择（如 DALL-E 3、FLUX）
     * - 'free': 自由输入宽高，但有约束条件（如 GPT Image 2）
     */
    mode: "preset" | "free";
    /** 预设尺寸选项（在 UI 中展示为快捷选项） */
    presets?: Array<{ label: string; value: string }>;
    /** 自由模式约束（mode=free 时生效） */
    constraints?: {
      maxWidth?: number;
      maxHeight?: number;
      /** 宽高必须是此值的整数倍（如 GPT Image 2 要求 16px） */
      stepSize?: number;
      /** 长边:短边 最大比例（如 GPT Image 2 为 3） */
      maxAspectRatio?: number;
      minPixels?: number;
      maxPixels?: number;
    };
    default?: string;
  };

  /**
   * 宽高比 + 分辨率模式（xAI grok-imagine 等使用此模式）
   * 对应接口参数：`aspect_ratio` + `resolution`
   */
  aspectRatioMode?: {
    /** 可选的宽高比列表 */
    ratios: Array<{ label: string; value: string }>;
    /** 可选的分辨率列表 */
    resolutions?: Array<{ label: string; value: string }>;
    defaultRatio?: string;
    defaultResolution?: string;
  };

  /**
   * Gemini 图像配置模式（aspectRatio + imageSize）
   * 对应 Gemini generateContent 接口的 imageConfig 参数
   * 注意：imageSize 值为 "512" / "1K" / "2K" / "4K"（大写K）
   *
   * @future 此字段规则可先定义，适配器延期实施
   */
  geminiImageConfig?: {
    aspectRatios: Array<{ label: string; value: string }>;
    imageSizes?: Array<{ label: string; value: string }>;
    defaultAspectRatio?: string;
    defaultImageSize?: string;
  };

  // ========== 质量 ==========

  quality?:
    | {
        supported: true;
        options: Array<{ label: string; value: string }>;
        default?: string;
      }
    | { supported: false };

  // ========== 风格 ==========

  style?:
    | {
        supported: true;
        options: Array<{ label: string; value: string }>;
        default?: string;
      }
    | { supported: false };

  // ========== 负向提示词 ==========

  negativePrompt?: {
    supported: boolean;
  };

  // ========== 随机种子 ==========

  seed?: {
    supported: boolean;
    min?: number;
    max?: number;
  };

  // ========== 迭代步数 ==========

  steps?: {
    supported: boolean;
    min?: number;
    max?: number;
    default?: number;
  };

  // ========== 引导系数 ==========

  guidanceScale?: {
    supported: boolean;
    min?: number;
    max?: number;
    step?: number;
    default?: number;
  };

  // ========== 背景透明度 ==========

  background?: {
    supported: boolean;
    /** 支持 transparent 时才包含该选项 */
    options?: Array<{ label: string; value: string }>;
  };

  // ========== 输入保真度 ==========

  inputFidelity?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
  };

  // ========== 内容审核 ==========

  moderation?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
  };

  // ========== 输出格式 ==========

  outputFormat?: {
    supported: boolean;
    options?: Array<{ label: string; value: string }>;
    default?: string;
  };

  // ========== 输出压缩 ==========

  outputCompression?: {
    supported: boolean;
    min?: number;
    max?: number;
  };

  // ========== 批量生成 ==========

  batchSize?: {
    supported: boolean;
    min?: number;
    max?: number;
    default?: number;
  };

  // ========== 流式部分图片 ==========

  partialImages?: {
    supported: boolean;
    min?: number;
    max?: number;
  };
}

/**
 * 模型元数据匹配规则
 *
 * 定义了一个匹配规则，当模型 ID 或提供商满足条件时，
 * 将应用 properties 中定义的元数据。
 */
export interface ModelMetadataRule {
  /** 唯一标识 */
  id: string;

  /** 匹配类型 */
  matchType: MetadataMatchType;

  /** 匹配值（可以是字符串或正则表达式） */
  matchValue: string;

  /** 匹配成功后应用的元数据属性 */
  properties: ModelMetadataProperties;

  /** 优先级（数字越大优先级越高，默认 0） */
  priority?: number;

  /** 是否启用（默认 true） */
  enabled?: boolean;

  /** 是否使用正则表达式匹配（仅对 model、modelPrefix 有效） */
  useRegex?: boolean;

  /**
   * 是否为独占规则
   * 如果为 true，则匹配到此规则时，将忽略所有优先级低于此规则的匹配项。
   * 默认为 false。
   */
  exclusive?: boolean;

  /** 备注说明 */
  description?: string;

  /** 创建时间（ISO 8601 格式） */
  createdAt?: string;
}

/**
 * 元数据配置存储结构
 */
export interface ModelMetadataStore {
  /** 配置版本 */
  version: string;

  /** 配置规则列表 */
  rules: ModelMetadataRule[];

  /** 最后更新时间 */
  updatedAt?: string;
}

/**
 * 预设图标信息
 *
 * 用于在 UI 中展示可选的预设图标，
 * 保持向后兼容原有的图标选择器功能。
 */
export interface PresetIconInfo {
  /** 图标名称 */
  name: string;

  /** 图标路径（相对于预设目录） */
  path: string;

  /** 推荐用于的提供商/模型 */
  suggestedFor?: string[];

  /** 图标分类 */
  category?: string;
}
