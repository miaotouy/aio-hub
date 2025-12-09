/**
 * Token 计算器 Composable
 * 提供 Token 计算的核心业务逻辑和响应式状态管理
 */

import { ref, computed, watch } from 'vue';
import debounce from 'lodash-es/debounce';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { useLlmProfiles } from '@composables/useLlmProfiles';
import { tokenCalculatorEngine, type TokenCalculationResult } from './useTokenCalculator';
import { getMatchedModelProperties } from '@/config/model-metadata';
import {
  loadTokenCalculatorConfig,
  debouncedSaveConfig,
  type TokenCalculatorConfig
} from '../config';

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

/** 媒体类型 */
export type MediaType = 'image' | 'video' | 'audio';

/** 媒体项 */
export interface MediaItem {
  id: string;
  type: MediaType;
  name: string;
  params: {
    width?: number;
    height?: number;
    duration?: number;
  };
  tokenCount?: number;
}

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

  /** 媒体列表 */
  const mediaItems = ref<MediaItem[]>([]);

  /** 计算模式 */
  const calculationMode = ref<CalculationMode>('model');

  /** 选中的模型 ID 或分词器名称 */
  const selectedModelId = ref('');

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

  /** 配置是否已加载 */
  const configLoaded = ref(false);

  // ==================== 配置持久化 ====================

  /**
   * 保存当前配置
   */
  const saveCurrentConfig = (): void => {
    if (!configLoaded.value) {
      return; // 配置未加载完成时不保存
    }

    const config: TokenCalculatorConfig = {
      inputPanelWidthPercent: 50, // 这个值由 usePanelResize 管理
      calculationMode: calculationMode.value,
      selectedModelId: selectedModelId.value,
      maxDisplayTokens: maxDisplayTokens.value,
      version: '1.0.0'
    };
    
    // 注意：我们暂不持久化 mediaItems，因为通常这是临时计算

    debouncedSaveConfig(config);
    logger.info('配置已保存', config);
  };

  /**
   * 加载保存的配置
   */
  const loadConfig = async (): Promise<void> => {
    try {
      const config = await loadTokenCalculatorConfig();
      
      // 恢复配置
      if (config.calculationMode) {
        calculationMode.value = config.calculationMode;
      }
      if (config.selectedModelId) {
        selectedModelId.value = config.selectedModelId;
      }
      if (config.maxDisplayTokens) {
        maxDisplayTokens.value = config.maxDisplayTokens;
      }

      configLoaded.value = true;
      logger.info('配置加载成功', config);
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: '加载配置失败', showToUser: false });
      configLoaded.value = true; // 即使失败也标记为已加载，使用默认值
    }
  };

  // ==================== 计算属性 ====================

  /** 净化后的字符数（用于显示） */
  const sanitizedCharacterCount = computed(() => {
    if (!inputText.value) return 0;
    // 正则表达式匹配 Markdown 图片语法中的 data:image/...;base64,...
    const base64ImageRegex = /!\[.*?\]\(data:image\/[a-zA-Z0-9-+.]+;base64,.*?\)/g;
    // 替换为简短占位符后再计算长度
    const sanitizedText = inputText.value.replace(base64ImageRegex, '[IMAGE]');
    return sanitizedText.length;
  });

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
          // 尝试从元数据获取分词器名称作为标识
          const metadata = getMatchedModelProperties(model.id, model.provider);
          const tokenizerName = metadata?.tokenizer;
          
          models.push({
            id: model.id,
            name: model.name,
            // 优先显示分词器名称，否则显示渠道名称
            provider: tokenizerName || profile.name,
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
      errorHandler.handle(error as Error, { userMessage: '分词可视化失败，使用简单分词', showToUser: false });
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
    // 如果没有文本且没有媒体，直接归零
    if (!inputText.value && mediaItems.value.length === 0) {
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

        // === 计算媒体 Token ===
        let mediaTotal = 0;
        let imageTotal = 0;
        let videoTotal = 0;
        let audioTotal = 0;
        
        // 获取模型元数据以确定视觉计算规则
        // 如果是 tokenizer 模式，或者模型未定义视觉规则，我们默认使用 Gemini 2.0 规则作为参考
        // 这样用户添加了媒体至少能看到一个合理的数字，而不是 0
        const metadata = getMatchedModelProperties(selectedModelId.value);
        const defaultVisionCost = { calculationMethod: 'gemini_2_0', parameters: {} } as const;
        const visionTokenCost = metadata?.capabilities?.visionTokenCost || defaultVisionCost;

        mediaItems.value.forEach(item => {
          let count = 0;
          if (item.type === 'image' && item.params.width && item.params.height) {
            count = tokenCalculatorEngine.calculateImageTokens(
              item.params.width,
              item.params.height,
              visionTokenCost
            );
            imageTotal += count;
          } else if (item.type === 'video' && item.params.duration) {
            count = tokenCalculatorEngine.calculateVideoTokens(item.params.duration);
            videoTotal += count;
          } else if (item.type === 'audio' && item.params.duration) {
            count = tokenCalculatorEngine.calculateAudioTokens(item.params.duration);
            audioTotal += count;
          }
          
          // 更新单个 item 的 token 数（用于 UI 显示）
          item.tokenCount = count;
          mediaTotal += count;
        });

        // 记录文本 Token 数量（当前 result.count 仅包含文本）
        const textTokenCount = result.count;

        // 将媒体 Token 累加到总数
        result.count += mediaTotal;
        
        // 填充详细统计
        result.textTokenCount = textTokenCount;
        result.mediaTokenCount = mediaTotal;
        result.imageTokenCount = imageTotal;
        result.videoTokenCount = videoTotal;
        result.audioTokenCount = audioTotal;
        
        calculationResult.value = result;
        await generateTokenizedText();
        
        logger.info('Token 计算完成', {
          mode: calculationMode.value,
          count: result.count,
          mediaTokenCount: mediaTotal,
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
    mediaItems.value = [];
    calculationResult.value = {
      count: 0,
      isEstimated: false,
      tokenizerName: 'none',
    };
    tokenizedText.value = [];
    logger.info('清空所有内容');
  };

  // ==================== 媒体操作 ====================

  /**
   * 添加媒体项
   */
  const addMediaItem = (item: Omit<MediaItem, 'id' | 'tokenCount'>): void => {
    const newItem: MediaItem = {
      ...item,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      tokenCount: 0
    };
    mediaItems.value.push(newItem);
    calculateTokens();
  };

  /**
   * 移除媒体项
   */
  const removeMediaItem = (id: string): void => {
    const index = mediaItems.value.findIndex(item => item.id === id);
    if (index !== -1) {
      mediaItems.value.splice(index, 1);
      calculateTokens();
    }
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
    // 保存配置
    saveCurrentConfig();
    logger.info('切换计算模式', { mode: newMode });
  });

  /**
   * 监听选中模型/分词器变化，自动重新计算
   */
  watch(selectedModelId, (newId, oldId) => {
    // 只有在真正切换了模型时才重新计算（避免初始化时重复计算）
    if (oldId && newId !== oldId) {
      calculateTokens();
      logger.info('切换模型/分词器', {
        mode: calculationMode.value,
        from: oldId,
        to: newId
      });
    }
    // 保存配置
    if (configLoaded.value) {
      saveCurrentConfig();
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
    // 保存配置
    saveCurrentConfig();
  });

  /**
   * 初始化默认模型
   */
  const initializeDefaultModel = async (): Promise<void> => {
    // 首先加载配置
    await loadConfig();

    // 如果配置中有保存的模型ID，先尝试验证它是否仍然可用
    if (selectedModelId.value && availableModels.value.length > 0) {
      const modelExists = availableModels.value.some(m => m.id === selectedModelId.value);
      if (modelExists) {
        logger.info('使用配置中保存的模型', { modelId: selectedModelId.value });
        return;
      } else {
        logger.warn('配置中的模型不再可用，将选择默认模型', { savedModelId: selectedModelId.value });
      }
    }

    // 如果没有保存的模型或保存的模型不可用，选择第一个可用模型
    if (availableModels.value.length > 0) {
      const firstModel = availableModels.value[0];
      if (firstModel) {
        selectedModelId.value = firstModel.id;
        logger.info('Token 计算器初始化完成', { defaultModel: firstModel.id });
      }
    }
  };
  
  /**
   * 监听模型列表变化，自动初始化默认模型
   */
  watch(availableModels, (models) => {
    // 当模型列表加载完成且还没有选中模型时，自动选择第一个
    if (models.length > 0 && !selectedModelId.value) {
      const firstModel = models[0];
      if (firstModel) {
        selectedModelId.value = firstModel.id;
        logger.info('自动选择默认模型', { modelId: firstModel.id, modelName: firstModel.name });
      }
    }
  }, { immediate: true });

  // ==================== 返回 ====================

  return {
    // 状态
    inputText,
    mediaItems,
    calculationMode,
    selectedModelId,
    isCalculating,
    calculationResult,
    tokenizedText,
    maxDisplayTokens,
    
    // 计算属性
    availableModels,
    sanitizedCharacterCount,
    
    // 方法
    calculateTokens,
    handleInputChange,
    setInputText,
    clearAll,
    addMediaItem,
    removeMediaItem,
    getTokenColor,
    initializeDefaultModel,
  };
}