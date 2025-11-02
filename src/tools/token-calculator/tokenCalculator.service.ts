/**
 * Token 计算器服务
 * 服务层外壳，负责将 tokenCalculatorEngine 的功能注册为可跨模块调用的服务
 */

import type { ToolService } from '@/services/types';
import { tokenCalculatorEngine, type TokenCalculationResult } from './composables/useTokenCalculator';
import type { Asset } from '@/types/asset-management';
import { getMatchedModelProperties } from '@/config/model-metadata';

/**
 * Token 计算器服务类
 * 
 * 这是一个轻量级的服务外壳，主要职责：
 * 1. 实现 ToolService 接口，使其能够被服务注册系统识别
 * 2. 将 tokenCalculatorEngine 的功能暴露给外部模块
 * 3. 提供服务元数据供监控和文档使用
 * 
 * 注意：内部 UI 逻辑应直接使用 composables/useTokenCalculator，
 * 而不是通过这个 service 绕远路
 */
class TokenCalculatorService implements ToolService {
  public readonly id = 'token-calculator';
  public readonly name = 'Token 计算器';
  public readonly description = '计算文本的 Token 数量，支持多种 LLM 分词器';

  /**
   * 计算文本的 Token 数量
   * @param text - 要计算的文本
   * @param modelId - 模型ID
   * @returns Token 计算结果
   */
  async calculateTokens(text: string, modelId: string): Promise<TokenCalculationResult> {
    return tokenCalculatorEngine.calculateTokens(text, modelId);
  }

  /**
   * 直接使用分词器名称计算 Token 数量
   * @param text - 要计算的文本
   * @param tokenizerName - 分词器名称
   * @returns Token 计算结果
   */
  async calculateTokensByTokenizer(text: string, tokenizerName: string): Promise<TokenCalculationResult> {
    return tokenCalculatorEngine.calculateTokensByTokenizer(text, tokenizerName);
  }

  /**
   * 获取所有可用的分词器列表
   * @returns 分词器信息数组
   */
  getAvailableTokenizers(): Array<{ name: string; description: string }> {
    return tokenCalculatorEngine.getAvailableTokenizers();
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
    return tokenCalculatorEngine.getTokenizedText(text, identifier, useTokenizerName);
  }

  /**
   * 清除所有缓存的 tokenizer 实例
   */
  clearCache(): void {
    tokenCalculatorEngine.clearCache();
  }

  /**
   * 获取缓存的 tokenizer 数量
   */
  getCacheSize(): number {
    return tokenCalculatorEngine.getCacheSize();
  }

  /**
   * 计算包含文本和附件的完整消息的 Token 数量
   * @param text - 文本内容
   * @param modelId - 模型ID
   * @param attachments - 附件列表（可选）
   * @returns Token 计算结果
   */
  async calculateMessageTokens(
    text: string,
    modelId: string,
    attachments?: Asset[]
  ): Promise<TokenCalculationResult> {
    // 1. 计算文本 Token
    const textResult = await tokenCalculatorEngine.calculateTokens(text, modelId);
    let totalTokens = textResult.count;

    // 2. 如果有附件，计算附件 Token
    if (attachments && attachments.length > 0) {
      // 获取模型的视觉 token 计费规则
      const metadata = getMatchedModelProperties(modelId);
      const visionTokenCost = metadata?.capabilities?.visionTokenCost;

      if (visionTokenCost) {
        // 只处理图片类型的附件
        const imageAttachments = attachments.filter(asset => asset.type === 'image');
        
        for (const asset of imageAttachments) {
          // 检查是否有宽高信息
          if (asset.metadata?.width && asset.metadata?.height) {
            const imageTokens = tokenCalculatorEngine.calculateImageTokens(
              asset.metadata.width,
              asset.metadata.height,
              visionTokenCost
            );
            totalTokens += imageTokens;
          } else {
            // 如果没有宽高信息，使用默认值（假设是常见分辨率）
            // 这里使用 1024x1024 作为默认值
            const imageTokens = tokenCalculatorEngine.calculateImageTokens(
              1024,
              1024,
              visionTokenCost
            );
            totalTokens += imageTokens;
          }
        }
      }
    }

    // 判断是否为估算值
    const hasAttachmentsWithoutDimensions = attachments && attachments.length > 0 &&
      !attachments.every(a => a.type !== 'image' || (a.metadata?.width && a.metadata?.height));

    return {
      count: totalTokens,
      isEstimated: (textResult.isEstimated ?? false) || !!hasAttachmentsWithoutDimensions,
      tokenizerName: textResult.tokenizerName,
    };
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
        {
          name: 'calculateTokensByTokenizer',
          description: '使用指定分词器计算 Token 数量',
          parameters: [
            {
              name: 'text',
              type: 'string',
              description: '要计算的文本',
              required: true,
            },
            {
              name: 'tokenizerName',
              type: 'string',
              description: '分词器名称',
              required: true,
            },
          ],
          returnType: 'Promise<TokenCalculationResult>',
        },
        {
          name: 'getAvailableTokenizers',
          description: '获取所有可用的分词器列表',
          parameters: [],
          returnType: 'Array<{ name: string; description: string }>',
        },
        {
          name: 'calculateMessageTokens',
          description: '计算包含文本和附件的完整消息的 Token 数量',
          parameters: [
            {
              name: 'text',
              type: 'string',
              description: '文本内容',
              required: true,
            },
            {
              name: 'modelId',
              type: 'string',
              description: '模型 ID',
              required: true,
            },
            {
              name: 'attachments',
              type: 'Asset[]',
              description: '附件列表（可选）',
              required: false,
            },
          ],
          returnType: 'Promise<TokenCalculationResult>',
          example: `
const result = await tokenCalculatorService.calculateMessageTokens(
  'Describe this image',
  'gpt-4o',
  [imageAsset]
);
console.log(result);
// {
//   count: 355, // 文本 token + 图片 token
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

// 同时导出单例实例供直接使用（跨模块调用场景）
export const tokenCalculatorService = new TokenCalculatorService();

// 重新导出类型，方便外部模块导入
export type { TokenCalculationResult } from './composables/useTokenCalculator';