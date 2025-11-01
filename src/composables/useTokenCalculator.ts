/**
 * Token 计算器 Composable
 * 提供 Token 计算的核心业务逻辑和响应式状态管理
 */

import { ref, computed } from 'vue';
import debounce from 'lodash-es/debounce';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { useLlmProfiles } from './useLlmProfiles';
import { tokenCalculatorService, type TokenCalculationResult } from '@/tools/token-calculator/tokenCalculator.service';

const logger = createModuleLogger('composables/token-calculator');
const errorHandler = createModuleErrorHandler('composables/token-calculator');

// ==================== 类型定义 ====================

/** Token 块（用于可视化） */
export interface TokenBlock {
  text: string;
  index: number;
}

/** 可用的模型 */
export interface AvailableModel {
  id: string;
  name: string;
  provider?: string;
}

// 重新导出 service 中的类型，方便统一从 composable 导入
export type { TokenCalculationResult } from '@/tools/token-calculator/tokenCalculator.service';

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

  /** 选中的模型 ID */
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

  // ==================== 计算属性 ====================

  /** 可用模型列表 */
  const { profiles } = useLlmProfiles();
  const availableModels = computed(() => {
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
   * 生成简单的分词可视化数据
   */
  const generateTokenizedText = async (): Promise<void> => {
    const text = inputText.value;
    const tokens: TokenBlock[] = [];
    
    // 简单按空格和标点分词作为演示
    const words = text.split(/(\s+|[.,!?;:"'()])/);
    let index = 0;
    
    for (const word of words) {
      if (word) {
        tokens.push({ text: word, index: index++ });
      }
    }
    
    tokenizedText.value = tokens.slice(0, 500); // 限制显示数量
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
        
        const result = await tokenCalculatorService.calculateTokens(
          inputText.value,
          selectedModelId.value
        );
        
        calculationResult.value = result;
        await generateTokenizedText();
        
        logger.info('Token 计算完成', {
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
          modelId: selectedModelId.value,
        },
      }
    );

    isCalculating.value = false;
  }, 300);

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
    selectedModelId,
    isCalculating,
    calculationResult,
    tokenizedText,
    
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