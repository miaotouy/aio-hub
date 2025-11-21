/**
 * Token 计算引擎
 * 纯计算逻辑，不包含任何 Vue 响应式状态或服务注册逻辑
 */

import { getMatchedModelProperties } from '@/config/model-metadata';
import type { VisionTokenCost } from '@/types/llm-profiles';

// 使用 any 类型暂时绕过类型导出问题
type PreTrainedTokenizer = any;

/**
 * 模型到 tokenizer 加载器的映射
 * 使用懒加载策略，只在需要时导入对应的 tokenizer
 */
type TokenizerLoader = () => Promise<{ fromPreTrained: () => PreTrainedTokenizer }>;

interface TokenizerMapping {
  /** 匹配模型 ID 的正则表达式 */
  pattern: RegExp;
  /** 动态加载 tokenizer 的函数 */
  loader: TokenizerLoader;
  /** tokenizer 名称（用于日志和调试） */
  name: string;
  /** 备注说明（可选） */
  description?: string;
}

/**
 * Token 计算结果
 */
export interface TokenCalculationResult {
  /** Token 数量 */
  count: number;
  /** 是否为估算值 */
  isEstimated: boolean;
  /** 使用的 tokenizer 名称 */
  tokenizerName: string;
}

/**
 * Token 计算引擎类
 * 负责管理 tokenizer 的加载、缓存和计算
 */
class TokenCalculatorEngine {
  /** tokenizer 实例缓存 */
  private tokenizerCache = new Map<string, PreTrainedTokenizer>();

  /** 分词器名称到加载器的直接映射 */
  private tokenizerLoaders: Record<string, TokenizerLoader> = {
    'gpt4o': () => import('@lenml/tokenizer-gpt4o'),
    'gpt4': () => import('@lenml/tokenizer-gpt4'),
    'claude': () => import('@lenml/tokenizer-claude'),
    'gemini': () => import('@lenml/tokenizer-gemini'),
    'llama3_2': () => import('@lenml/tokenizer-llama3_2'),
    'deepseek_v3': () => import('@lenml/tokenizer-deepseek_v3'),
    'qwen3': () => import('@lenml/tokenizer-qwen3'),
  };

  /** 模型匹配规则和加载器映射（只包含已安装的 tokenizer） */
  private tokenizerMappings: TokenizerMapping[] = [
    // === OpenAI 系列 ===
    {
      pattern: /^(gpt-5|gpt-4o|o[134])/i,
      loader: () => import('@lenml/tokenizer-gpt4o'),
      name: 'gpt4o',
      description: 'GPT-4o, GPT-5, o1, o3, o4 系列',
    },
    {
      pattern: /^gpt-4(?!o)/i,
      loader: () => import('@lenml/tokenizer-gpt4'),
      name: 'gpt4',
      description: 'GPT-4 系列（不包括 4o）',
    },

    // === Anthropic Claude 系列 ===
    {
      pattern: /^claude-/i,
      loader: () => import('@lenml/tokenizer-claude'),
      name: 'claude',
      description: 'Claude 全系列',
    },

    // === Google Gemini/Gemma 系列 ===
    {
      pattern: /^(gemini-|gemma|veo-)/i,
      loader: () => import('@lenml/tokenizer-gemini'),
      name: 'gemini',
      description: 'Gemini, Gemma 全系列, Veo 系列',
    },

    // === Meta Llama 系列 ===
    {
      pattern: /^(llama|meta-llama)/i,
      loader: () => import('@lenml/tokenizer-llama3_2'),
      name: 'llama3_2',
      description: 'Llama 全系列（使用 3.2 分词器）',
    },

    // === DeepSeek 系列 ===
    {
      pattern: /^deepseek-/i,
      loader: () => import('@lenml/tokenizer-deepseek_v3'),
      name: 'deepseek_v3',
      description: 'DeepSeek 全系列（V3, R1 等）',
    },

    // === 通义千问 Qwen 系列 ===
    {
      pattern: /^(qwen|qwq-)/i,
      loader: () => import('@lenml/tokenizer-qwen3'),
      name: 'qwen3',
      description: 'Qwen 全系列（使用 Qwen3 分词器）',
    },
  ];

  /**
   * 根据模型ID查找对应的 tokenizer 加载器
   */
  private findTokenizerMapping(modelId: string): TokenizerMapping | undefined {
    return this.tokenizerMappings.find((mapping) => mapping.pattern.test(modelId));
  }

  /**
   * 根据分词器名称直接获取分词器实例
   */
  async getTokenizerByName(tokenizerName: string): Promise<PreTrainedTokenizer | null> {
    // 先从缓存中查找
    const cacheKey = `tokenizer:${tokenizerName}`;
    if (this.tokenizerCache.has(cacheKey)) {
      return this.tokenizerCache.get(cacheKey)!;
    }

    // 查找对应的加载器
    const loader = this.tokenizerLoaders[tokenizerName];
    if (!loader) {
      console.warn(`Unknown tokenizer name: ${tokenizerName}`);
      return null;
    }

    try {
      // 动态加载 tokenizer 模块
      const module = await loader();
      const tokenizer = module.fromPreTrained();

      // 缓存实例
      this.tokenizerCache.set(cacheKey, tokenizer);

      return tokenizer;
    } catch (error) {
      console.error(`Failed to load tokenizer ${tokenizerName}:`, error);
      return null;
    }
  }

  /**
   * 获取或创建 tokenizer 实例（根据模型ID）
   */
  async getTokenizer(modelId: string): Promise<PreTrainedTokenizer | null> {
    // 先从缓存中查找
    if (this.tokenizerCache.has(modelId)) {
      return this.tokenizerCache.get(modelId)!;
    }

    // 首先尝试从元数据系统获取分词器名称
    const metadata = getMatchedModelProperties(modelId);
    let tokenizerName: string | undefined = metadata?.tokenizer;
    
    // 如果元数据中没有指定，则尝试使用正则匹配（回退方案）
    if (!tokenizerName) {
      const mapping = this.findTokenizerMapping(modelId);
      tokenizerName = mapping?.name;
    }

    // 如果找到了分词器名称，加载对应的分词器
    if (tokenizerName) {
      const loader = this.tokenizerLoaders[tokenizerName];
      if (loader) {
        try {
          // 动态加载 tokenizer 模块
          const module = await loader();
          const tokenizer = module.fromPreTrained();

          // 缓存实例
          this.tokenizerCache.set(modelId, tokenizer);

          return tokenizer;
        } catch (error) {
          console.error(`Failed to load tokenizer ${tokenizerName} for model ${modelId}:`, error);
          return null;
        }
      }
    }

    return null;
  }

  /**
   * 计算文本的 Token 数量
   * @param text - 要计算的文本
   * @param modelId - 模型ID
   * @returns Token 计算结果
   */
  async calculateTokens(text: string, modelId: string): Promise<TokenCalculationResult> {
    if (!text) {
      return {
        count: 0,
        isEstimated: false,
        tokenizerName: 'none',
      };
    }

    const sanitizedText = this._sanitizeText(text);
    const tokenizer = await this.getTokenizer(modelId);

    if (tokenizer) {
      // 使用精确的 tokenizer 进行计算
      // 先尝试从元数据获取分词器名称
      const metadata = getMatchedModelProperties(modelId);
      let tokenizerName = metadata?.tokenizer;

      // 如果元数据中没有，则尝试从正则匹配获取
      if (!tokenizerName) {
        const mapping = this.findTokenizerMapping(modelId);
        tokenizerName = mapping?.name || 'unknown';
      }

      try {
        const encoded = tokenizer.encode(sanitizedText, undefined, {
          add_special_tokens: true,
        });
        return {
          count: encoded.length,
          isEstimated: false,
          tokenizerName,
        };
      } catch (error) {
        console.error(`Error encoding text with ${tokenizerName}:`, error);
        // 降级到估算
        return this.estimateTokens(sanitizedText);
      }
    }

    // 无法找到匹配的 tokenizer，使用估算
    return this.estimateTokens(sanitizedText);
  }

  /**
   * 估算 Token 数量（回退方案）
   * 使用经验公式：
   * - 中文字符：约 1.5 字符 = 1 token
   * - 英文及其他字符：约 4 字符 = 1 token
   * - 特殊字符（标点符号等）：约 1 字符 = 1 token
   */
  estimateTokens(text: string): TokenCalculationResult {
    const sanitizedText = this._sanitizeText(text);
    // 统计不同类型的字符
    const chineseChars = (sanitizedText.match(/[\u4e00-\u9fa5]/g) || []).length;
    const specialChars = (sanitizedText.match(/[^\w\s\u4e00-\u9fa5]/g) || []).length;
    const otherChars = sanitizedText.length - chineseChars - specialChars;

    // 应用不同的估算规则
    const estimatedCount = Math.ceil(
      chineseChars / 1.5 +
      otherChars / 4 +
      specialChars
    );

    return {
      count: estimatedCount,
      isEstimated: true,
      tokenizerName: 'estimator',
    };
  }

  /**
   * 直接使用分词器名称计算 Token 数量
   * @param text - 要计算的文本
   * @param tokenizerName - 分词器名称
   * @returns Token 计算结果
   */
  async calculateTokensByTokenizer(text: string, tokenizerName: string): Promise<TokenCalculationResult> {
    if (!text) {
      return {
        count: 0,
        isEstimated: false,
        tokenizerName: 'none',
      };
    }

    const sanitizedText = this._sanitizeText(text);
    const tokenizer = await this.getTokenizerByName(tokenizerName);

    if (tokenizer) {
      try {
        const encoded = tokenizer.encode(sanitizedText, undefined, {
          add_special_tokens: true,
        });
        return {
          count: encoded.length,
          isEstimated: false,
          tokenizerName,
        };
      } catch (error) {
        console.error(`Error encoding text with ${tokenizerName}:`, error);
        // 降级到估算
        return this.estimateTokens(sanitizedText);
      }
    }

    // 无法找到分词器，使用估算
    return this.estimateTokens(sanitizedText);
  }

  /**
   * 获取所有可用的分词器列表
   * @returns 分词器信息数组
   */
  getAvailableTokenizers(): Array<{ name: string; description: string }> {
    return [
      { name: 'gpt4o', description: 'GPT-4o, GPT-5, o1, o3, o4 系列' },
      { name: 'gpt4', description: 'GPT-4, GPT-3.5 系列' },
      { name: 'claude', description: 'Claude 全系列' },
      { name: 'gemini', description: 'Gemini, Gemma 全系列, Veo 系列' },
      { name: 'llama3_2', description: 'Llama 全系列（3.2 分词器）' },
      { name: 'deepseek_v3', description: 'DeepSeek 全系列（V3, R1 等）' },
      { name: 'qwen3', description: 'Qwen 全系列（Qwen3 分词器）' },
    ];
  }

  /**
   * 获取分词后的文本数组（用于可视化）
   * @param text - 要分词的文本
   * @param identifier - 模型ID或分词器名称
   * @param useTokenizerName - 是否使用分词器名称（true）还是模型ID（false）
   * @returns 包含分词结果的对象，如果无法分词则返回 null
   */
  async getTokenizedText(
    text: string,
    identifier: string,
    useTokenizerName: boolean = false
  ): Promise<{ tokens: string[] } | null> {
    if (!text) {
      return { tokens: [] };
    }

    const sanitizedText = this._sanitizeText(text);
    let tokenizer: PreTrainedTokenizer | null = null;

    // 根据标识符类型获取 tokenizer
    if (useTokenizerName) {
      tokenizer = await this.getTokenizerByName(identifier);
    } else {
      tokenizer = await this.getTokenizer(identifier);
    }

    if (!tokenizer) {
      return null;
    }

    try {
      // 编码文本获取 token IDs
      const encoded = tokenizer.encode(sanitizedText, undefined, {
        add_special_tokens: true,
      });

      // 解码每个 token ID 获取文本
      const tokens: string[] = [];
      for (const tokenId of encoded) {
        try {
          const decoded = tokenizer.decode([tokenId], {
            skip_special_tokens: false,
          });
          tokens.push(decoded);
        } catch (error) {
          // 如果某个 token 无法解码，使用占位符
          tokens.push(`[Token ${tokenId}]`);
        }
      }

      return { tokens };
    } catch (error) {
      console.error('Failed to tokenize text:', error);
      return null;
    }
  }

  /**
   * 清除所有缓存的 tokenizer 实例
   */
  clearCache(): void {
    this.tokenizerCache.clear();
  }

  /**
   * 获取缓存的 tokenizer 数量
   */
  getCacheSize(): number {
    return this.tokenizerCache.size;
  }

  /**
   * 计算图片的 Token 数量
   * @param width - 图片宽度（像素）
   * @param height - 图片高度（像素）
   * @param visionTokenCost - 视觉 Token 计费规则
   * @returns Token 数量
   */
  calculateImageTokens(
    width: number,
    height: number,
    visionTokenCost: VisionTokenCost
  ): number {
    const { calculationMethod, parameters } = visionTokenCost;

    switch (calculationMethod) {
      case 'fixed':
        // 固定成本：每张图片固定 token 数
        return parameters.costPerImage || 0;

      case 'openai_tile':
        // OpenAI 瓦片计算法
        return this.calculateOpenAITileTokens(width, height, parameters);

      case 'claude_3':
        // Claude 3：使用预估值（实际值由 API 返回）
        return parameters.costPerImage || 0;

      default:
        console.warn(`Unknown vision token calculation method: ${calculationMethod}`);
        return 0;
    }
  }

  /**
   * OpenAI 图片 Token 计算（瓦片法）
   *
   * 算法说明：
   * 1. 图片首先被缩放以适应 2048x2048 的正方形，保持宽高比
   * 2. 然后图片的最短边被缩放至 768px
   * 3. 计算需要多少个 512px 的瓦片来覆盖图片
   * 4. 每个瓦片消耗 170 tokens，加上固定的 85 tokens 基础成本
   *
   * 参考：https://platform.openai.com/docs/guides/vision
   */
  private calculateOpenAITileTokens(
    width: number,
    height: number,
    parameters: VisionTokenCost['parameters']
  ): number {
    const baseCost = parameters.baseCost || 85;
    const tileCost = parameters.tileCost || 170;
    const tileSize = parameters.tileSize || 512;

    // 步骤 1: 缩放至 2048x2048 内，保持宽高比
    let scaledWidth = width;
    let scaledHeight = height;
    
    if (width > 2048 || height > 2048) {
      const scale = Math.min(2048 / width, 2048 / height);
      scaledWidth = Math.floor(width * scale);
      scaledHeight = Math.floor(height * scale);
    }

    // 步骤 2: 将最短边缩放至 768px
    const shortestSide = Math.min(scaledWidth, scaledHeight);
    if (shortestSide > 768) {
      const scale = 768 / shortestSide;
      scaledWidth = Math.floor(scaledWidth * scale);
      scaledHeight = Math.floor(scaledHeight * scale);
    }

    // 步骤 3: 计算需要多少个 512px 瓦片
    const tilesX = Math.ceil(scaledWidth / tileSize);
    const tilesY = Math.ceil(scaledHeight / tileSize);
    const totalTiles = tilesX * tilesY;

    // 步骤 4: 计算总成本
    return baseCost + (totalTiles * tileCost);
  }

  /**
   * 从文本中移除 Base64 图像数据，以防止在 Token 计算时造成性能问题。
   * @param text - 原始文本
   * @returns 清理后的文本
   */
  private _sanitizeText(text: string): string {
    // 正则表达式匹配 Markdown 图片语法中的 data:image/...;base64,...
    // 使用非贪婪匹配 (.*?) 来防止匹配到多个图片
    const base64ImageRegex = /!\[.*?\]\(data:image\/[a-zA-Z0-9-+.]+;base64,.*?\)/g;

    // 将匹配到的 Base64 图片替换为一个简短的占位符
    // 这个占位符的 Token 数量是可预测且小的
    return text.replace(base64ImageRegex, '[IMAGE]');
  }
}

// 导出单例实例
export const tokenCalculatorEngine = new TokenCalculatorEngine();