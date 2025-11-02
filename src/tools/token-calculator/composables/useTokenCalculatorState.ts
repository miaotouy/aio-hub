/**
 * Token 计算器 Composable
 * 提供 Token 计算的核心业务逻辑和响应式状态管理
 */

import { ref, computed, watch } from 'vue';
import debounce from 'lodash-es/debounce';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { useLlmProfiles } from '../../../composables/useLlmProfiles';
import { tokenCalculatorEngine, type TokenCalculationResult } from './useTokenCalculator';

const logger = createModuleLogger('composables/token-calculator');
const errorHandler = createModuleErrorHandler('composables/token-calculator');

// ==================== 类型定义 ====================

/** 计算模式 */
export type CalculationMode = 'model' | 'tokenizer';

/** Token 块（用于可视化） */
export interface TokenBlock {
  text: string;
  index: number;
}

/** 可用的模型或分词器 */
export interface AvailableModel {
  id: string;
  name: string;
  provider?: string;
}

// 重新导出 engine 中的类型，方便统一从 composable 导入
export type { TokenCalculationResult } from './useTokenCalculator';

/**
 * Token 计算器 Composable
 * 
 * 提供 Token 计算的完整功能，包括：
 * - 响应式状态管理
 * - 自动 Token 计算（带防抖）
 * - 模型选择
 * - Token 可视化
 */
export function useTokenCalculator() {
  // ==================== 响应式状态 ====================

  /** 输入文本 */
  const inputText = ref('');

  /** 计算模式 */
  const calculationMode = ref<CalculationMode>('model');

  /** 选中的模型 ID 或分词器名称 */
  const selectedModelId = ref('gpt-4o');

  /** 是否正在计算 */
  const isCalculating = ref(false);

  /** 计算结果 */
  const calculationResult = ref<TokenCalculationResult>({
    count: 0,
    isEstimated: false,
    tokenizerName: 'none',
  });

  /** Token 可视化数据 */
  const tokenizedText = ref<TokenBlock[]>([]);

  /** 最大显示 Token 数量 */
  const maxDisplayTokens = ref(5000);

  // ==================== 计算属性 ====================

  /** 可用模型列表 */
  const { profiles } = useLlmProfiles();
  const availableModels = computed(() => {
    // 如果是分词器模式，返回分词器列表
    if (calculationMode.value === 'tokenizer') {
      const tokenizers = tokenCalculatorEngine.getAvailableTokenizers();
      return tokenizers.map(t => ({
        id: t.name,
        name: t.description,
        provider: '分词器',
      }));
    }

    // 否则返回模型列表
    const models: AvailableModel[] = [];
    
    profiles.value.forEach(profile => {
      if (profile.enabled && profile.models) {
        profile.models.forEach(model => {
          models.push({
            id: model.id,
            name: model.name,
            provider: model.provider || profile.name,
          });
        });
      }
    });

    return models;
  });

  // ==================== Token 计算 ====================

  /**
   * 生成真实的分词可视化数据
   * 使用实际的 tokenizer 进行分词，与 Token 计算保持一致
   */
  const generateTokenizedText = async (): Promise<void> => {
    const text = inputText.value;
    
    if (!text) {
      tokenizedText.value = [];
      return;
    }

    try {
      // 尝试使用真实的 tokenizer 获取分词结果
      let tokenizerResult;
      
      if (calculationMode.value === 'tokenizer') {
        tokenizerResult = await tokenCalculatorEngine.getTokenizedText(
          text,
          selectedModelId.value,
          true // 使用分词器名称
        );
      } else {
        tokenizerResult = await tokenCalculatorEngine.getTokenizedText(
          text,
          selectedModelId.value,
          false // 使用模型 ID
        );
      }

      if (tokenizerResult && tokenizerResult.tokens) {
        // 使用真实的分词结果
        const tokens: TokenBlock[] = tokenizerResult.tokens.map((tokenText: string, index: number) => ({
          text: tokenText,
          index,
        }));
        
        // 根据用户设置限制显示数量
        if (tokens.length > maxDisplayTokens.value) {
          tokenizedText.value = tokens.slice(0, maxDisplayTokens.value);
          logger.warn(`分词数量过多 (${tokens.length})，仅显示前 ${maxDisplayTokens.value} 个`);
        } else {
          tokenizedText.value = tokens;
        }
      } else {
        // 如果无法获取真实分词结果，使用简单分词作为回退
        logger.warn('无法获取真实分词结果，使用简单分词');
        await generateSimpleTokenizedText(text);
      }
    } catch (error) {
      // 出错时使用简单分词作为回退
      logger.error('分词可视化失败，使用简单分词', error);
      await generateSimpleTokenizedText(text);
    }
  };

  /**
   * 简单分词（回退方案）
   * 按空格和标点符号分割
   */
  const generateSimpleTokenizedText = async (text: string): Promise<void> => {
    const tokens: TokenBlock[] = [];
    
    // 简单按空格和标点分词作为演示
    const words = text.split(/(\s+|[.,!?;:"'()（）。，！？；：""''《》【】])/);
    let index = 0;
    
    for (const word of words) {
      if (word && word.trim()) {
        tokens.push({ text: word, index: index++ });
      }
    }
    
    // 根据用户设置限制显示数量
    if (tokens.length > maxDisplayTokens.value) {
      tokenizedText.value = tokens.slice(0, maxDisplayTokens.value);
      logger.warn(`简单分词数量过多 (${tokens.length})，仅显示前 ${maxDisplayTokens.value} 个`);
    } else {
      tokenizedText.value = tokens;
    }
  };

  /**
   * 计算 Token（防抖）
   */
  const calculateTokens = debounce(async () => {
    if (!inputText.value) {
      calculationResult.value = {
        count: 0,
        isEstimated: false,
        tokenizerName: 'none',
      };
      tokenizedText.value = [];
      return;
    }

    await errorHandler.wrapAsync(
      async () => {
        isCalculating.value = true;
        
        let result: TokenCalculationResult;
        
        // 根据模式选择不同的计算方法
        if (calculationMode.value === 'tokenizer') {
          result = await tokenCalculatorEngine.calculateTokensByTokenizer(
            inputText.value,
            selectedModelId.value
          );
        } else {
          result = await tokenCalculatorEngine.calculateTokens(
            inputText.value,
            selectedModelId.value
          );
        }
        
        calculationResult.value = result;
        await generateTokenizedText();
        
        logger.info('Token 计算完成', {
          mode: calculationMode.value,
          count: result.count,
          tokenizerName: result.tokenizerName,
          isEstimated: result.isEstimated,
        });
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: 'Token 计算失败',
        context: {
          textLength: inputText.value.length,
          mode: calculationMode.value,
          modelId: selectedModelId.value,
        },
      }
    );

    isCalculating.value = false;
  }, 600);

  // ==================== 文本操作 ====================

  /**
   * 更新输入文本
   */
  const handleInputChange = (): void => {
    calculateTokens();
  };

  /**
   * 设置输入文本
   */
  const setInputText = (text: string): void => {
    inputText.value = text;
    calculateTokens();
  };

  /**
   * 清空所有内容
   */
  const clearAll = (): void => {
    inputText.value = '';
    calculationResult.value = {
      count: 0,
      isEstimated: false,
      tokenizerName: 'none',
    };
    tokenizedText.value = [];
    logger.info('清空所有内容');
  };

  // ==================== 工具方法 ====================

  /**
   * 获取 Token 块的颜色
   */
  const getTokenColor = (index: number): string => {
    const colors = [
      'rgba(59, 130, 246, 0.15)',   // 蓝色
      'rgba(16, 185, 129, 0.15)',   // 绿色
      'rgba(245, 158, 11, 0.15)',   // 橙色
      'rgba(139, 92, 246, 0.15)',   // 紫色
      'rgba(236, 72, 153, 0.15)',   // 粉色
      'rgba(6, 182, 212, 0.15)',    // 青色
    ];
    return colors[index % colors.length];
  };

  // ==================== 监听器 ====================

  /**
   * 监听计算模式变化，自动重置选择并重新计算
   */
  watch(calculationMode, (newMode) => {
    // 切换模式时重置选择为第一个可用项
    if (availableModels.value.length > 0) {
      const firstItem = availableModels.value[0];
      if (firstItem) {
        selectedModelId.value = firstItem.id;
      }
    }
    // 重新计算
    calculateTokens();
    logger.info('切换计算模式', { mode: newMode });
  });

  /**
   * 监听选中模型/分词器变化，自动重新计算
   */
  watch(selectedModelId, (newId, oldId) => {
    // 只有在真正切换了模型时才重新计算（避免初始化时重复计算）
    if (oldId && newId !== oldId && inputText.value) {
      calculateTokens();
      logger.info('切换模型/分词器', {
        mode: calculationMode.value,
        from: oldId,
        to: newId
      });
    }
  });

  /**
   * 监听最大显示数量变化，重新生成可视化
   */
  watch(maxDisplayTokens, () => {
    if (inputText.value) {
      generateTokenizedText();
      logger.info('更新最大显示数量', { maxDisplayTokens: maxDisplayTokens.value });
    }
  });

  /**
   * 初始化默认模型
   */
  const initializeDefaultModel = (): void => {
    if (availableModels.value.length > 0) {
      const firstModel = availableModels.value[0];
      if (firstModel) {
        selectedModelId.value = firstModel.id;
      }
    }
    logger.info('Token 计算器初始化完成');
  };

  // ==================== 返回 ====================

  return {
    // 状态
    inputText,
    calculationMode,
    selectedModelId,
    isCalculating,
    calculationResult,
    tokenizedText,
    maxDisplayTokens,
    
    // 计算属性
    availableModels,
    
    // 方法
    calculateTokens,
    handleInputChange,
    setInputText,
    clearAll,
    getTokenColor,
    initializeDefaultModel,
  };
}