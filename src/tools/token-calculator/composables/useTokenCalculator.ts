/**
 * Token 计算引擎
 * 纯计算逻辑，不包含任何 Vue 响应式状态或服务注册逻辑
 */

import { getMatchedModelProperties } from '@/config/model-metadata';

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
    'llama3_1': () => import('@lenml/tokenizer-llama3_1'),
    'deepseek_v3': () => import('@lenml/tokenizer-deepseek_v3'),
    'qwen2_5': () => import('@lenml/tokenizer-qwen2_5'),
    'qwen3': () => import('@lenml/tokenizer-qwen3'),
    'gemma3': () => import('@lenml/tokenizer-gemma3'),
    'llama3_2': () => import('@lenml/tokenizer-llama3_2'),
    'gptoss': () => import('@lenml/tokenizer-gptoss'),
    'minicpm_v4_5': () => import('@lenml/tokenizer-minicpm_v4_5'),
  };

  /** 模型匹配规则和加载器映射（只包含已安装的 tokenizer） */
  private tokenizerMappings: TokenizerMapping[] = [
    // === OpenAI 系列 ===
    {
      pattern: /^gpt-oss/i,
      loader: () => import('@lenml/tokenizer-gptoss'),
      name: 'gptoss',
      description: 'GPT-OSS 开源权重模型系列',
    },
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
      pattern: /^gemma3/i,
      loader: () => import('@lenml/tokenizer-gemma3'),
      name: 'gemma3',
      description: 'Gemma 3 系列',
    },
    {
      pattern: /^(gemini-|gemma-|veo-)/i,
      loader: () => import('@lenml/tokenizer-gemini'),
      name: 'gemini',
      description: 'Gemini, Gemma 1/2, Veo 系列',
    },

    // === Meta Llama 系列 ===
    {
      pattern: /^llama-?3[._-]?2/i,
      loader: () => import('@lenml/tokenizer-llama3_2'),
      name: 'llama3_2',
      description: 'Llama 3.2 系列',
    },
    {
      pattern: /^(llama|meta-llama)/i,
      loader: () => import('@lenml/tokenizer-llama3_1'),
      name: 'llama3_1',
      description: 'Llama 全系列（3.1 及更早版本）',
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
      pattern: /^qwen3/i,
      loader: () => import('@lenml/tokenizer-qwen3'),
      name: 'qwen3',
      description: 'Qwen 3 系列',
    },
    {
      pattern: /^(qwen|qwq-)/i,
      loader: () => import('@lenml/tokenizer-qwen2_5'),
      name: 'qwen2_5',
      description: 'Qwen 全系列（2.x, QwQ）',
    },

    // === MiniCPM 系列 ===
    {
      pattern: /^minicpm/i,
      loader: () => import('@lenml/tokenizer-minicpm_v4_5'),
      name: 'minicpm_v4_5',
      description: 'MiniCPM v4.5 系列',
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
        const encoded = tokenizer.encode(text, undefined, {
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
        return this.estimateTokens(text);
      }
    }

    // 无法找到匹配的 tokenizer，使用估算
    return this.estimateTokens(text);
  }

  /**
   * 估算 Token 数量（回退方案）
   * 使用经验公式：
   * - 中文字符：约 1.5 字符 = 1 token
   * - 英文及其他字符：约 4 字符 = 1 token
   * - 特殊字符（标点符号等）：约 1 字符 = 1 token
   */
  estimateTokens(text: string): TokenCalculationResult {
    // 统计不同类型的字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const specialChars = (text.match(/[^\w\s\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars - specialChars;

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

    const tokenizer = await this.getTokenizerByName(tokenizerName);

    if (tokenizer) {
      try {
        const encoded = tokenizer.encode(text, undefined, {
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
        return this.estimateTokens(text);
      }
    }

    // 无法找到分词器，使用估算
    return this.estimateTokens(text);
  }

  /**
   * 获取所有可用的分词器列表
   * @returns 分词器信息数组
   */
  getAvailableTokenizers(): Array<{ name: string; description: string }> {
    return [
      { name: 'gpt4o', description: 'GPT-4o, GPT-5, o1, o3 系列' },
      { name: 'gpt4', description: 'GPT-4 系列（不包括 4o）' },
      { name: 'gptoss', description: 'GPT-OSS 开源权重模型系列' },
      { name: 'claude', description: 'Claude 全系列' },
      { name: 'gemini', description: 'Gemini, Gemma, Veo 系列' },
      { name: 'gemma3', description: 'Gemma 3 系列' },
      { name: 'llama3_1', description: 'Llama 3.1 系列' },
      { name: 'llama3_2', description: 'Llama 3.2 系列' },
      { name: 'deepseek_v3', description: 'DeepSeek 全系列（V3, R1 等）' },
      { name: 'qwen2_5', description: 'Qwen 2.5 系列' },
      { name: 'qwen3', description: 'Qwen 3 系列' },
      { name: 'minicpm_v4_5', description: 'MiniCPM v4.5 系列' },
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
      const encoded = tokenizer.encode(text, undefined, {
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
}

// 导出单例实例
export const tokenCalculatorEngine = new TokenCalculatorEngine();