/**
 * SmartOCR 配置管理
 * 使用 Tauri 文件系统存储配置
 * 为每种引擎类型分别存储配置，切换引擎时不会丢失其他引擎的配置
 */

import { createConfigManager } from '@/utils/configManager';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import type { OcrEngineConfig, OcrEngineType, SlicerConfig, EngineConfigs } from './types';

// 创建模块错误处理器
const errorHandler = createModuleErrorHandler('smart-ocr/config');

export interface SmartOcrConfig {
  // 当前选择的引擎类型
  currentEngineType: OcrEngineType;
  // 所有引擎的配置（按类型分别存储）
  engineConfigs: EngineConfigs;
  // 智能切图配置
  slicerConfig: SlicerConfig;
  // 配置版本
  version: string;
}

// 默认配置
export const defaultSmartOcrConfig: SmartOcrConfig = {
  currentEngineType: 'tesseract',
  engineConfigs: {
    tesseract: {
      name: 'Tesseract.js',
      language: 'chi_sim+eng'
    },
    native: {
      name: 'Native OCR'
    },
    vlm: {
      name: 'Vision Language Model',
      profileId: '',
      modelId: '',
      prompt: '请识别图片中的所有文字内容，直接输出文字，不要添加任何解释。',
      temperature: 0.3,
      maxTokens: 8192,
      concurrency: 3,
      delay: 0
    },
    cloud: {
      name: 'Cloud OCR',
      activeProfileId: '' // 默认未选中任何云端服务
    }
  },
  slicerConfig: {
    enabled: true,
    aspectRatioThreshold: 3,
    blankThreshold: 0.30,
    minBlankHeight: 20,
    minCutHeight: 480,
    cutLineOffset: 0.2
  },
  version: '1.0.0'
};

// 创建配置管理器实例
const smartOcrConfigManager = createConfigManager<SmartOcrConfig>({
  moduleName: 'smart-ocr',
  fileName: 'config.json',
  version: '1.0.0',
  debounceDelay: 200,
  createDefault: () => defaultSmartOcrConfig,
  mergeConfig: (defaultConfig, loadedConfig) => {
    // 合并当前引擎类型
    const currentEngineType = loadedConfig.currentEngineType || defaultConfig.currentEngineType;
    
    // 合并各个引擎的配置
    const mergedEngineConfigs: EngineConfigs = {
      tesseract: {
        ...defaultConfig.engineConfigs.tesseract,
        ...(loadedConfig.engineConfigs?.tesseract || {})
      },
      native: {
        ...defaultConfig.engineConfigs.native,
        ...(loadedConfig.engineConfigs?.native || {})
      },
      vlm: {
        ...defaultConfig.engineConfigs.vlm,
        ...(loadedConfig.engineConfigs?.vlm || {})
      },
      cloud: {
        ...defaultConfig.engineConfigs.cloud,
        ...(loadedConfig.engineConfigs?.cloud || {})
      }
    };
    
    // 合并切图配置
    const mergedSlicerConfig = {
      ...defaultConfig.slicerConfig,
      ...loadedConfig.slicerConfig
    };
    
    return {
      currentEngineType,
      engineConfigs: mergedEngineConfigs,
      slicerConfig: mergedSlicerConfig,
      version: '1.0.0'
    };
  }
});

/**
 * 加载配置
 */
export const loadSmartOcrConfig = async (): Promise<SmartOcrConfig> => {
  try {
    return await smartOcrConfigManager.load();
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: '加载 SmartOCR 配置失败', showToUser: false });
    return defaultSmartOcrConfig;
  }
};

/**
 * 保存配置
 */
export const saveSmartOcrConfig = async (config: SmartOcrConfig): Promise<void> => {
  try {
    await smartOcrConfigManager.save(config);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: '保存 SmartOCR 配置失败', showToUser: false });
    throw error;
  }
};

/**
 * 更新部分配置
 */
export const updateSmartOcrConfig = async (updates: Partial<SmartOcrConfig>): Promise<SmartOcrConfig> => {
  try {
    return await smartOcrConfigManager.update(updates);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: '更新 SmartOCR 配置失败', showToUser: false });
    throw error;
  }
};

/**
 * 防抖保存函数
 */
export const debouncedSaveConfig = smartOcrConfigManager.saveDebounced;

/**
 * 根据当前引擎类型获取对应的引擎配置
 */
export const getCurrentEngineConfig = (config: SmartOcrConfig): OcrEngineConfig => {
  const { currentEngineType, engineConfigs } = config;
  
  switch (currentEngineType) {
    case 'tesseract':
      return {
        type: 'tesseract',
        ...engineConfigs.tesseract
      };
    case 'native':
      return {
        type: 'native',
        ...engineConfigs.native
      };
    case 'vlm':
      return {
        type: 'vlm',
        ...engineConfigs.vlm
      };
    case 'cloud':
      return {
        type: 'cloud',
        ...engineConfigs.cloud
      };
  }
};

/**
 * 更新特定引擎的配置
 */
export const updateEngineConfig = (
  config: SmartOcrConfig,
  engineType: OcrEngineType,
  engineConfig: Partial<OcrEngineConfig>
): SmartOcrConfig => {
  const newEngineConfigs = { ...config.engineConfigs };
  
  switch (engineType) {
    case 'tesseract':
      newEngineConfigs.tesseract = {
        ...newEngineConfigs.tesseract,
        ...(engineConfig as Partial<typeof newEngineConfigs.tesseract>)
      };
      break;
    case 'native':
      newEngineConfigs.native = {
        ...newEngineConfigs.native,
        ...(engineConfig as Partial<typeof newEngineConfigs.native>)
      };
      break;
    case 'vlm':
      newEngineConfigs.vlm = {
        ...newEngineConfigs.vlm,
        ...(engineConfig as Partial<typeof newEngineConfigs.vlm>)
      };
      break;
    case 'cloud':
      newEngineConfigs.cloud = {
        ...newEngineConfigs.cloud,
        ...(engineConfig as Partial<typeof newEngineConfigs.cloud>)
      };
      break;
  }
  
  return {
    ...config,
    engineConfigs: newEngineConfigs
  };
};