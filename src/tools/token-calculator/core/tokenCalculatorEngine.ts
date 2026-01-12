/**
 * Token 计算核心引擎
 * 
 * 纯逻辑实现，不依赖 Vue 响应式、Tauri API 或任何 UI 相关工具。
 * 可以在主线程和 Worker 线程中安全运行。
 */

import { DEFAULT_METADATA_RULES } from '@/config/model-metadata-presets';
import type { ModelMetadataRule, ModelMetadataProperties } from '@/types/model-metadata';
import type { VisionTokenCost } from '@/types/llm-profiles';

// 使用 any 类型暂时绕过类型导出问题
type PreTrainedTokenizer = any;

/**
 * Token 计算结果
 */
export interface TokenCalculationResult {
  /** Token 总数量 */
  count: number;
  /** 文本 Token 数量 */
  textTokenCount?: number;
  /** 媒体 Token 总数量 */
  mediaTokenCount?: number;
  /** 图片 Token 数量 */
  imageTokenCount?: number;
  /** 视频 Token 数量 */
  videoTokenCount?: number;
  /** 音频 Token 数量 */
  audioTokenCount?: number;
  /** 是否为估算值 */
  isEstimated: boolean;
  /** 使用的 tokenizer 名称 */
  tokenizerName: string;
}

/**
 * 简单的对象合并函数，替代 lodash.merge 以减少依赖
 */
function simpleMerge(target: any, source: any): any {
  if (!source) return target;
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = simpleMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 轻量级模型规则匹配逻辑
 */
function testRuleMatch(rule: ModelMetadataRule, modelId: string, provider?: string): boolean {
  switch (rule.matchType) {
    case 'model':
      if (rule.useRegex) {
        try {
          return new RegExp(rule.matchValue, 'i').test(modelId);
        } catch { return false; }
      }
      return modelId === rule.matchValue;

    case 'modelPrefix':
      if (rule.useRegex) {
        try {
          return new RegExp(rule.matchValue, 'i').test(modelId);
        } catch { return false; }
      }
      return modelId.toLowerCase().includes(rule.matchValue.toLowerCase());

    case 'provider':
      return !!(provider && provider.toLowerCase() === rule.matchValue.toLowerCase());

    default:
      return false;
  }
}

/**
 * 获取匹配模型的元数据属性 (Worker 安全版)
 */
function getMatchedModelProperties(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): ModelMetadataProperties | undefined {
  const matchedRules = rules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .filter((rule) => testRuleMatch(rule, modelId, provider));

  if (matchedRules.length === 0) return undefined;

  const highestExclusiveRule = matchedRules.find((r) => r.exclusive === true);
  let finalRules = matchedRules;
  if (highestExclusiveRule) {
    const exclusivePriority = highestExclusiveRule.priority || 0;
    finalRules = matchedRules.filter((r) => (r.priority || 0) >= exclusivePriority);
  }

  return finalRules
    .reverse()
    .reduce((acc, rule) => simpleMerge(acc, rule.properties), {} as ModelMetadataProperties);
}

/**
 * 模型到 tokenizer 加载器的映射
 */
type TokenizerLoader = () => Promise<{ fromPreTrained: () => PreTrainedTokenizer }>;

interface TokenizerMapping {
  pattern: RegExp;
  loader: TokenizerLoader;
  name: string;
}

/**
 * Token 计算引擎类
 */
export class TokenCalculatorEngine {
  private tokenizerCache = new Map<string, PreTrainedTokenizer>();

  private tokenizerLoaders: Record<string, TokenizerLoader> = {
    'gpt4o': () => import('@lenml/tokenizer-gpt4o'),
    'gpt4': () => import('@lenml/tokenizer-gpt4'),
    'claude': () => import('@lenml/tokenizer-claude'),
    'gemini': () => import('@lenml/tokenizer-gemini'),
    'llama3_2': () => import('@lenml/tokenizer-llama3_2'),
    'deepseek_v3': () => import('@lenml/tokenizer-deepseek_v3'),
    'qwen3': () => import('@lenml/tokenizer-qwen3'),
  };

  private tokenizerMappings: TokenizerMapping[] = [
    { pattern: /^(gpt-5|gpt-4o|o[134])/i, loader: () => import('@lenml/tokenizer-gpt4o'), name: 'gpt4o' },
    { pattern: /^gpt-4(?!o)/i, loader: () => import('@lenml/tokenizer-gpt4'), name: 'gpt4' },
    { pattern: /^claude-/i, loader: () => import('@lenml/tokenizer-claude'), name: 'claude' },
    { pattern: /^(gemini-|gemma|veo-)/i, loader: () => import('@lenml/tokenizer-gemini'), name: 'gemini' },
    { pattern: /^(llama|meta-llama)/i, loader: () => import('@lenml/tokenizer-llama3_2'), name: 'llama3_2' },
    { pattern: /^deepseek-/i, loader: () => import('@lenml/tokenizer-deepseek_v3'), name: 'deepseek_v3' },
    { pattern: /^(qwen|qwq-)/i, loader: () => import('@lenml/tokenizer-qwen3'), name: 'qwen3' },
  ];

  async getTokenizerByName(tokenizerName: string): Promise<PreTrainedTokenizer | null> {
    const cacheKey = `tokenizer:${tokenizerName}`;
    if (this.tokenizerCache.has(cacheKey)) return this.tokenizerCache.get(cacheKey)!;

    const loader = this.tokenizerLoaders[tokenizerName];
    if (!loader) return null;

    try {
      const module = await loader();
      const tokenizer = module.fromPreTrained();
      this.tokenizerCache.set(cacheKey, tokenizer);
      return tokenizer;
    } catch (error) {
      console.error(`[TokenCalculator] Failed to load tokenizer ${tokenizerName}:`, error);
      return null;
    }
  }

  async getTokenizer(modelId: string): Promise<PreTrainedTokenizer | null> {
    if (this.tokenizerCache.has(modelId)) return this.tokenizerCache.get(modelId)!;

    const metadata = getMatchedModelProperties(modelId);
    let tokenizerName: string | undefined = metadata?.tokenizer;

    if (!tokenizerName) {
      const mapping = this.tokenizerMappings.find((m) => m.pattern.test(modelId));
      tokenizerName = mapping?.name;
    }

    if (tokenizerName) {
      const tokenizer = await this.getTokenizerByName(tokenizerName);
      if (tokenizer) {
        this.tokenizerCache.set(modelId, tokenizer);
        return tokenizer;
      }
    }

    return null;
  }

  async calculateTokens(text: string, modelId: string): Promise<TokenCalculationResult> {
    if (!text) return { count: 0, isEstimated: false, tokenizerName: 'none' };

    const sanitizedText = this._sanitizeText(text);
    const tokenizer = await this.getTokenizer(modelId);

    if (tokenizer) {
      const metadata = getMatchedModelProperties(modelId);
      let tokenizerName = metadata?.tokenizer || this.tokenizerMappings.find((m) => m.pattern.test(modelId))?.name || 'unknown';

      try {
        const encoded = tokenizer.encode(sanitizedText, undefined, { add_special_tokens: true });
        return { count: encoded.length, isEstimated: false, tokenizerName };
      } catch (error) {
        console.error(`[TokenCalculator] Error encoding text with ${tokenizerName}:`, error);
        return this.estimateTokens(sanitizedText);
      }
    }

    return this.estimateTokens(sanitizedText);
  }

  estimateTokens(text: string): TokenCalculationResult {
    const sanitizedText = this._sanitizeText(text);
    const chineseChars = (sanitizedText.match(/[\u4e00-\u9fa5]/g) || []).length;
    const specialChars = (sanitizedText.match(/[^\w\s\u4e00-\u9fa5]/g) || []).length;
    const otherChars = sanitizedText.length - chineseChars - specialChars;

    const estimatedCount = Math.ceil(chineseChars / 1.5 + otherChars / 4 + specialChars);

    return { count: estimatedCount, isEstimated: true, tokenizerName: 'estimator' };
  }

  async calculateTokensByTokenizer(text: string, tokenizerName: string): Promise<TokenCalculationResult> {
    if (!text) return { count: 0, isEstimated: false, tokenizerName: 'none' };

    const sanitizedText = this._sanitizeText(text);
    const tokenizer = await this.getTokenizerByName(tokenizerName);

    if (tokenizer) {
      try {
        const encoded = tokenizer.encode(sanitizedText, undefined, { add_special_tokens: true });
        return { count: encoded.length, isEstimated: false, tokenizerName };
      } catch (error) {
        console.error(`[TokenCalculator] Error encoding text with ${tokenizerName}:`, error);
        return this.estimateTokens(sanitizedText);
      }
    }

    return this.estimateTokens(sanitizedText);
  }

  async getTokenizedText(
    text: string,
    identifier: string,
    useTokenizerName: boolean = false
  ): Promise<{ tokens: string[] } | null> {
    if (!text) return { tokens: [] };

    const sanitizedText = this._sanitizeText(text);
    const tokenizer = useTokenizerName
      ? await this.getTokenizerByName(identifier)
      : await this.getTokenizer(identifier);

    if (!tokenizer) return null;

    try {
      const encoded = tokenizer.encode(sanitizedText, undefined, { add_special_tokens: true });
      const tokens: string[] = [];
      for (const tokenId of encoded) {
        try {
          tokens.push(tokenizer.decode([tokenId], { skip_special_tokens: false }));
        } catch {
          tokens.push(`[Token ${tokenId}]`);
        }
      }
      return { tokens };
    } catch (error) {
      console.error('[TokenCalculator] Failed to tokenize text:', error);
      return null;
    }
  }

  clearCache(): void {
    this.tokenizerCache.clear();
  }

  /**
   * 获取所有可用的分词器列表
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
   * 获取缓存的 tokenizer 数量
   */
  getCacheSize(): number {
    return this.tokenizerCache.size;
  }

  calculateImageTokens(width: number, height: number, visionTokenCost: VisionTokenCost): number {
    const { calculationMethod, parameters } = visionTokenCost;
    switch (calculationMethod) {
      case 'fixed': return parameters.costPerImage || 0;
      case 'openai_tile': return this.calculateOpenAITileTokens(width, height, parameters);
      case 'claude_3': return parameters.costPerImage || 0;
      case 'gemini_2_0': return this.calculateGemini2ImageTokens(width, height);
      default: return 0;
    }
  }

  private calculateGemini2ImageTokens(width: number, height: number): number {
    if (width <= 384 && height <= 384) return 258;
    return Math.ceil(width / 768) * Math.ceil(height / 768) * 258;
  }

  calculateVideoTokens(durationSeconds: number): number {
    return Math.ceil(durationSeconds) * 263;
  }

  calculateAudioTokens(durationSeconds: number): number {
    return Math.ceil(durationSeconds) * 32;
  }

  private calculateOpenAITileTokens(width: number, height: number, parameters: any): number {
    const baseCost = parameters.baseCost || 85;
    const tileCost = parameters.tileCost || 170;
    const tileSize = parameters.tileSize || 512;

    let sw = width, sh = height;
    if (width > 2048 || height > 2048) {
      const scale = Math.min(2048 / width, 2048 / height);
      sw = Math.floor(width * scale);
      sh = Math.floor(height * scale);
    }

    const ss = Math.min(sw, sh);
    if (ss > 768) {
      const scale = 768 / ss;
      sw = Math.floor(sw * scale);
      sh = Math.floor(sh * scale);
    }

    return baseCost + (Math.ceil(sw / tileSize) * Math.ceil(sh / tileSize) * tileCost);
  }

  private _sanitizeText(text: string): string {
    return text.replace(/!\[.*?\]\(data:image\/[a-zA-Z0-9-+.]+;base64,.*?\)/g, '[IMAGE]');
  }
}

export const tokenCalculatorEngine = new TokenCalculatorEngine();