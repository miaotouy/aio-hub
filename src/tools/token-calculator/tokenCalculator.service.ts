/**
 * Token 计算器服务
 * 基于 @lenml/tokenizers 提供多模型 Token 计算的核心工具函数
 */

import type { ToolService } from '@/services/types';

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
 * Token 计算器服务类
 *
 * 提供两种调用模式：
 * 1. 直接调用：通过 `calculateTokens` 方法直接计算 Token（无状态）
 * 2. UI 调用：通过 `createContext` 方法获取一个有状态、响应式的 Context 实例
 */
class TokenCalculatorService implements ToolService {
  public readonly id = 'token-calculator';
  public readonly name = 'Token 计算器';
  public readonly description = '计算文本的 Token 数量，支持多种 LLM 分词器';

  /** tokenizer 实例缓存 */
  private tokenizerCache = new Map<string, PreTrainedTokenizer>();

  /** 模型匹配规则和加载器映射（只包含已安装的 tokenizer） */
  private tokenizerMappings: TokenizerMapping[] = [
    // === OpenAI 系列 ===
    {
      pattern: /^(gpt-5|gpt-4o|o[13])/i,
      loader: () => import('@lenml/tokenizer-gpt4o'),
      name: 'gpt4o',
      description: 'GPT-4o, GPT-5, o1, o3 系列',
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
      pattern: /^(gemini-|gemma-|veo-)/i,
      loader: () => import('@lenml/tokenizer-gemini'),
      name: 'gemini',
      description: 'Gemini, Gemma, Veo 系列',
    },

    // === Meta Llama 系列 ===
    {
      pattern: /^(llama|meta-llama)/i,
      loader: () => import('@lenml/tokenizer-llama3_1'),
      name: 'llama3_1',
      description: 'Llama 全系列',
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
      loader: () => import('@lenml/tokenizer-qwen2_5'),
      name: 'qwen2_5',
      description: 'Qwen 全系列（2.x, 3.x, QwQ）',
    },
  ];

  /**
   * 根据模型ID查找对应的 tokenizer 加载器
   */
  private findTokenizerMapping(modelId: string): TokenizerMapping | undefined {
    return this.tokenizerMappings.find((mapping) => mapping.pattern.test(modelId));
  }

  /**
   * 获取或创建 tokenizer 实例
   */
  private async getTokenizer(modelId: string): Promise<PreTrainedTokenizer | null> {
    // 先从缓存中查找
    if (this.tokenizerCache.has(modelId)) {
      return this.tokenizerCache.get(modelId)!;
    }

    // 查找匹配的 tokenizer 加载器
    const mapping = this.findTokenizerMapping(modelId);
    if (!mapping) {
      return null;
    }

    try {
      // 动态加载 tokenizer 模块
      const module = await mapping.loader();
      const tokenizer = module.fromPreTrained();

      // 缓存实例
      this.tokenizerCache.set(modelId, tokenizer);

      return tokenizer;
    } catch (error) {
      console.error(`Failed to load tokenizer for model ${modelId}:`, error);
      return null;
    }
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
      const mapping = this.findTokenizerMapping(modelId)!;
      try {
        const encoded = tokenizer.encode(text, null, {
          add_special_tokens: true,
        });
        return {
          count: encoded.length,
          isEstimated: false,
          tokenizerName: mapping.name,
        };
      } catch (error) {
        console.error(`Error encoding text with ${mapping.name}:`, error);
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
  private estimateTokens(text: string): TokenCalculationResult {
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

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'calculateTokens',
          description: '计算文本的 Token 数量',
          parameters: [
            {
              name: 'text',
              type: 'string',
              description: '要计算的文本',
              required: true,
            },
            {
              name: 'modelId',
              type: 'string',
              description: '模型 ID',
              required: true,
            },
          ],
          returnType: 'Promise<TokenCalculationResult>',
          example: `
const result = await tokenCalculatorService.calculateTokens('Hello, world!', 'gpt-4o');
console.log(result);
// {
//   count: 4,
//   isEstimated: false,
//   tokenizerName: 'gpt4o'
// }`,
        },
      ],
    };
  }
}

// 导出类供自动注册系统使用
export default TokenCalculatorService;

// 同时导出单例实例供直接使用
export const tokenCalculatorService = new TokenCalculatorService();