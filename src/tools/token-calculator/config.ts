/**
 * Token Calculator 配置管理
 * 使用 Tauri 文件系统存储配置
 */

import { createConfigManager } from '@/utils/configManager';
import { createModuleErrorHandler } from '@/utils/errorHandler';

// 创建模块错误处理器
const errorHandler = createModuleErrorHandler('token-calculator/config');

export interface TokenCalculatorConfig {
  // 面板宽度（百分比）
  inputPanelWidthPercent: number;
  // 计算模式
  calculationMode: 'model' | 'tokenizer';
  // 选中的模型ID或分词器名称
  selectedModelId: string;
  // 最大显示Token数量
  maxDisplayTokens: number;
  // 配置版本
  version: string;
}

// 默认配置
export const defaultTokenCalculatorConfig: TokenCalculatorConfig = {
  inputPanelWidthPercent: 50, // 默认 50%
  calculationMode: 'model', // 默认按模型计算
  selectedModelId: '', // 默认空，将在初始化时设置
  maxDisplayTokens: 5000, // 默认显示5000个token
  version: '1.0.0'
};

// 创建配置管理器实例
const tokenCalculatorConfigManager = createConfigManager<TokenCalculatorConfig>({
  moduleName: 'token-calculator',
  fileName: 'config.json',
  version: '1.0.0',
  createDefault: () => defaultTokenCalculatorConfig,
  mergeConfig: (defaultConfig, loadedConfig) => {
    return {
      inputPanelWidthPercent: loadedConfig.inputPanelWidthPercent ?? defaultConfig.inputPanelWidthPercent,
      calculationMode: loadedConfig.calculationMode ?? defaultConfig.calculationMode,
      selectedModelId: loadedConfig.selectedModelId ?? defaultConfig.selectedModelId,
      maxDisplayTokens: loadedConfig.maxDisplayTokens ?? defaultConfig.maxDisplayTokens,
      version: '1.0.0'
    };
  }
});

/**
 * 加载配置
 */
export const loadTokenCalculatorConfig = async (): Promise<TokenCalculatorConfig> => {
  try {
    return await tokenCalculatorConfigManager.load();
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: '加载 Token Calculator 配置失败', showToUser: false });
    return defaultTokenCalculatorConfig;
  }
};

/**
 * 保存配置
 */
export const saveTokenCalculatorConfig = async (config: TokenCalculatorConfig): Promise<void> => {
  try {
    await tokenCalculatorConfigManager.save(config);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: '保存 Token Calculator 配置失败', showToUser: false });
    throw error;
  }
};

/**
 * 更新部分配置
 */
export const updateTokenCalculatorConfig = async (updates: Partial<TokenCalculatorConfig>): Promise<TokenCalculatorConfig> => {
  try {
    return await tokenCalculatorConfigManager.update(updates);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: '更新 Token Calculator 配置失败', showToUser: false });
    throw error;
  }
};

/**
 * 防抖保存函数
 */
export const debouncedSaveConfig = tokenCalculatorConfigManager.saveDebounced;