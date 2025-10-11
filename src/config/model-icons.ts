/**
 * 模型图标默认配置
 */

import type { ModelIconConfig, PresetIconInfo } from '../types/model-icons';

/**
 * 预设图标目录（相对于 public 目录）
 */
export const PRESET_ICONS_DIR = '/model-icons';

/**
 * 预设图标列表
 */
export const PRESET_ICONS: PresetIconInfo[] = [
  {
    name: 'OpenAI',
    path: 'openai.svg',
    suggestedFor: ['openai'],
    category: 'provider',
  },
  {
    name: 'Anthropic',
    path: 'anthropic.svg',
    suggestedFor: ['anthropic', 'claude'],
    category: 'provider',
  },
  {
    name: 'Google',
    path: 'google.svg',
    suggestedFor: ['gemini'],
    category: 'provider',
  },
  {
    name: 'DeepSeek',
    path: 'deepseek.svg',
    suggestedFor: ['deepseek'],
    category: 'provider',
  },
  {
    name: 'Moonshot',
    path: 'moonshot.svg',
    suggestedFor: ['moonshot'],
    category: 'provider',
  },
  {
    name: 'Zhipu',
    path: 'zhipu.svg',
    suggestedFor: ['zhipu', 'glm'],
    category: 'provider',
  },
  {
    name: 'Groq',
    path: 'groq.svg',
    suggestedFor: ['groq'],
    category: 'provider',
  },
  {
    name: 'xAI',
    path: 'xai.svg',
    suggestedFor: ['grok'],
    category: 'provider',
  },
];

/**
 * 默认图标配置
 */
export const DEFAULT_ICON_CONFIGS: ModelIconConfig[] = [
  // Provider 级别匹配
  {
    id: 'provider-openai',
    matchType: 'provider',
    matchValue: 'openai',
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 10,
    enabled: true,
    description: 'OpenAI 提供商图标',
  },
  {
    id: 'provider-anthropic',
    matchType: 'provider',
    matchValue: 'anthropic',
    iconPath: `${PRESET_ICONS_DIR}/anthropic.svg`,
    priority: 10,
    enabled: true,
    description: 'Anthropic 提供商图标',
  },
  {
    id: 'provider-gemini',
    matchType: 'provider',
    matchValue: 'gemini',
    iconPath: `${PRESET_ICONS_DIR}/google.svg`,
    priority: 10,
    enabled: true,
    description: 'Google Gemini 提供商图标',
  },
  {
    id: 'provider-deepseek',
    matchType: 'provider',
    matchValue: 'deepseek',
    iconPath: `${PRESET_ICONS_DIR}/deepseek.svg`,
    priority: 10,
    enabled: true,
    description: 'DeepSeek 提供商图标',
  },
  {
    id: 'provider-moonshot',
    matchType: 'provider',
    matchValue: 'moonshot',
    iconPath: `${PRESET_ICONS_DIR}/moonshot.svg`,
    priority: 10,
    enabled: true,
    description: 'Moonshot AI 提供商图标',
  },
  {
    id: 'provider-zhipu',
    matchType: 'provider',
    matchValue: 'zhipu',
    iconPath: `${PRESET_ICONS_DIR}/zhipu.svg`,
    priority: 10,
    enabled: true,
    description: '智谱 AI 提供商图标',
  },
  {
    id: 'provider-groq',
    matchType: 'provider',
    matchValue: 'groq',
    iconPath: `${PRESET_ICONS_DIR}/groq.svg`,
    priority: 10,
    enabled: true,
    description: 'Groq 提供商图标',
  },
  
  // Model Prefix 级别匹配（更高优先级）
  {
    id: 'model-prefix-gpt',
    matchType: 'modelPrefix',
    matchValue: 'gpt-',
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 20,
    enabled: true,
    description: 'GPT 系列模型图标',
  },
  {
    id: 'model-prefix-o1',
    matchType: 'modelPrefix',
    matchValue: 'o1',
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 20,
    enabled: true,
    description: 'O1 系列模型图标',
  },
  {
    id: 'model-prefix-claude',
    matchType: 'modelPrefix',
    matchValue: 'claude-',
    iconPath: `${PRESET_ICONS_DIR}/anthropic.svg`,
    priority: 20,
    enabled: true,
    description: 'Claude 系列模型图标',
  },
  {
    id: 'model-prefix-gemini',
    matchType: 'modelPrefix',
    matchValue: 'gemini-',
    iconPath: `${PRESET_ICONS_DIR}/google.svg`,
    priority: 20,
    enabled: true,
    description: 'Gemini 系列模型图标',
  },
  {
    id: 'model-prefix-deepseek',
    matchType: 'modelPrefix',
    matchValue: 'deepseek-',
    iconPath: `${PRESET_ICONS_DIR}/deepseek.svg`,
    priority: 20,
    enabled: true,
    description: 'DeepSeek 系列模型图标',
  },
  {
    id: 'model-prefix-glm',
    matchType: 'modelPrefix',
    matchValue: 'glm-',
    iconPath: `${PRESET_ICONS_DIR}/zhipu.svg`,
    priority: 20,
    enabled: true,
    description: 'GLM 系列模型图标',
  },
  {
    id: 'model-prefix-grok',
    matchType: 'modelPrefix',
    matchValue: 'grok-',
    iconPath: `${PRESET_ICONS_DIR}/xai.svg`,
    priority: 20,
    enabled: true,
    description: 'Grok 系列模型图标',
  },
  
  // 特定模型匹配（最高优先级）
  {
    id: 'model-chatgpt-4o-latest',
    matchType: 'model',
    matchValue: 'chatgpt-4o-latest',
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 30,
    enabled: true,
    description: 'ChatGPT-4o Latest 特定图标',
  },
];

/**
 * 获取模型图标路径
 * @param modelId 模型 ID
 * @param provider 提供商
 * @param configs 图标配置列表（可选，默认使用内置配置）
 * @returns 图标路径或 undefined
 */
export function getModelIconPath(
  modelId: string,
  provider?: string,
  configs: ModelIconConfig[] = DEFAULT_ICON_CONFIGS
): string | undefined {
  // 过滤启用的配置并按优先级排序
  const enabledConfigs = configs
    .filter(c => c.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const config of enabledConfigs) {
    switch (config.matchType) {
      case 'model':
        if (modelId === config.matchValue) {
          return config.iconPath;
        }
        break;
      
      case 'modelPrefix':
        if (modelId.startsWith(config.matchValue)) {
          return config.iconPath;
        }
        break;
      
      case 'modelGroup':
        // 模型分组匹配逻辑（可根据需要扩展）
        break;
      
      case 'provider':
        if (provider && provider === config.matchValue) {
          return config.iconPath;
        }
        break;
    }
  }

  return undefined;
}

/**
 * 验证图标路径是否有效
 * @param iconPath 图标路径
 * @returns 是否有效
 */
export function isValidIconPath(iconPath: string): boolean {
  // 检查是否为有效的路径格式
  if (!iconPath || typeof iconPath !== 'string') {
    return false;
  }
  
  // 支持的图片格式
  const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'];
  const hasValidExtension = validExtensions.some(ext => 
    iconPath.toLowerCase().endsWith(ext)
  );
  
  return hasValidExtension;
}