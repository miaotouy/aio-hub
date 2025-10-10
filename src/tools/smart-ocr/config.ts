/**
 * SmartOCR 配置管理
 * 使用 Tauri 文件系统存储配置
 * 为每种引擎类型分别存储配置，切换引擎时不会丢失其他引擎的配置
 */

import { createConfigManager } from '../../utils/configManager';
import type { OcrEngineConfig, OcrEngineType, SlicerConfig, EngineConfigs } from './types';

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
      maxTokens: 4096,
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
    blankThreshold: 0.05,
    minBlankHeight: 20,
    minCutHeight: 10,
    cutLineOffset: 0
  },
  version: '1.0.0'
};

// 创建配置管理器实例
const smartOcrConfigManager = createConfigManager<SmartOcrConfig>({
  moduleName: 'smart-ocr',
  fileName: 'config.json',
  version: '1.0.0',
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
    console.error('加载 SmartOCR 配置失败:', error);
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
    console.error('保存 SmartOCR 配置失败:', error);
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
    console.error('更新 SmartOCR 配置失败:', error);
    throw error;
  }
};

/**
 * 创建防抖保存函数（200ms 延迟）
 */
export const createDebouncedSave = () => {
  return smartOcrConfigManager.createDebouncedSave(200);
};

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
        ...(engineConfig as any)
      };
      break;
    case 'native':
      newEngineConfigs.native = {
        ...newEngineConfigs.native,
        ...(engineConfig as any)
      };
      break;
    case 'vlm':
      newEngineConfigs.vlm = {
        ...newEngineConfigs.vlm,
        ...(engineConfig as any)
      };
      break;
    case 'cloud':
      newEngineConfigs.cloud = {
        ...newEngineConfigs.cloud,
        ...(engineConfig as any)
      };
      break;
  }
  
  return {
    ...config,
    engineConfigs: newEngineConfigs
  };
};