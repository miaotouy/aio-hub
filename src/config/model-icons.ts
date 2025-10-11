/**
 * 模型图标默认配置
 */

import type { ModelIconConfig, PresetIconInfo } from '../types/model-icons';

/**
 * 预设图标目录（相对于 public 目录）
 */
export const PRESET_ICONS_DIR = '/model-icons';

/**
 * 预设图标列表（按分类组织）
 */
export const PRESET_ICONS: PresetIconInfo[] = [
  // === 主流 AI 服务商 ===
  {
    name: 'OpenAI',
    path: 'openai.svg',
    suggestedFor: ['openai', 'gpt', 'chatgpt'],
    category: 'AI 服务商',
  },
  {
    name: 'Anthropic',
    path: 'anthropic.svg',
    suggestedFor: ['anthropic'],
    category: 'AI 服务商',
  },
  {
    name: 'Claude (彩色)',
    path: 'claude-color.svg',
    suggestedFor: ['claude'],
    category: 'AI 服务商',
  },
  {
    name: 'Google',
    path: 'google-color.svg',
    suggestedFor: ['google'],
    category: 'AI 服务商',
  },
  {
    name: 'Gemini (彩色)',
    path: 'gemini-color.svg',
    suggestedFor: ['gemini'],
    category: 'AI 服务商',
  },
  {
    name: 'Gemma (彩色)',
    path: 'gemma-color.svg',
    suggestedFor: ['gemma'],
    category: 'AI 服务商',
  },
  {
    name: 'DeepSeek (彩色)',
    path: 'deepseek-color.svg',
    suggestedFor: ['deepseek'],
    category: 'AI 服务商',
  },
  {
    name: 'Groq',
    path: 'groq.svg',
    suggestedFor: ['groq'],
    category: 'AI 服务商',
  },
  {
    name: 'xAI (Grok)',
    path: 'xai.svg',
    suggestedFor: ['xai', 'grok'],
    category: 'AI 服务商',
  },
  {
    name: 'Grok',
    path: 'grok.svg',
    suggestedFor: ['grok'],
    category: 'AI 服务商',
  },
  {
    name: 'Mistral (彩色)',
    path: 'mistral-color.svg',
    suggestedFor: ['mistral'],
    category: 'AI 服务商',
  },
  {
    name: 'Cohere (彩色)',
    path: 'cohere-color.svg',
    suggestedFor: ['cohere'],
    category: 'AI 服务商',
  },
  {
    name: 'Meta (彩色)',
    path: 'meta-color.svg',
    suggestedFor: ['meta', 'llama'],
    category: 'AI 服务商',
  },
  {
    name: 'DeepMind (彩色)',
    path: 'deepmind-color.svg',
    suggestedFor: ['deepmind'],
    category: 'AI 服务商',
  },
  {
    name: 'AI21 Labs (彩色)',
    path: 'aionlabs-color.svg',
    suggestedFor: ['ai21', 'jamba'],
    category: 'AI 服务商',
  },

  // === 国内 AI 服务商 ===
  {
    name: 'Moonshot (Kimi)',
    path: 'moonshot.svg',
    suggestedFor: ['moonshot', 'kimi'],
    category: '国内 AI',
  },
  {
    name: 'Kimi (彩色)',
    path: 'kimi-color.svg',
    suggestedFor: ['kimi', 'moonshot'],
    category: '国内 AI',
  },
  {
    name: '智谱 AI (彩色)',
    path: 'zhipu-color.svg',
    suggestedFor: ['zhipu', 'glm'],
    category: '国内 AI',
  },
  {
    name: 'ChatGLM (彩色)',
    path: 'chatglm-color.svg',
    suggestedFor: ['chatglm', 'glm'],
    category: '国内 AI',
  },
  {
    name: 'GLM-V (彩色)',
    path: 'glmv-color.svg',
    suggestedFor: ['glmv'],
    category: '国内 AI',
  },
  {
    name: '通义千问 (彩色)',
    path: 'qwen-color.svg',
    suggestedFor: ['qwen', 'tongyi'],
    category: '国内 AI',
  },
  {
    name: '百度文心 (彩色)',
    path: 'wenxin-color.svg',
    suggestedFor: ['wenxin', 'ernie'],
    category: '国内 AI',
  },
  {
    name: '百度 (彩色)',
    path: 'baidu-color.svg',
    suggestedFor: ['baidu'],
    category: '国内 AI',
  },
  {
    name: '豆包 (彩色)',
    path: 'doubao-color.svg',
    suggestedFor: ['doubao'],
    category: '国内 AI',
  },
  {
    name: '字节跳动 (彩色)',
    path: 'bytedance-color.svg',
    suggestedFor: ['bytedance'],
    category: '国内 AI',
  },
  {
    name: '混元 (彩色)',
    path: 'hunyuan-color.svg',
    suggestedFor: ['hunyuan'],
    category: '国内 AI',
  },
  {
    name: '腾讯 (彩色)',
    path: 'tencent-color.svg',
    suggestedFor: ['tencent'],
    category: '国内 AI',
  },
  {
    name: 'MiniMax (彩色)',
    path: 'minimax-color.svg',
    suggestedFor: ['minimax'],
    category: '国内 AI',
  },
  {
    name: '零一万物 (彩色)',
    path: 'yi-color.svg',
    suggestedFor: ['yi', '01'],
    category: '国内 AI',
  },
  {
    name: '商汤 (彩色)',
    path: 'sensenova-color.svg',
    suggestedFor: ['sensenova'],
    category: '国内 AI',
  },
  {
    name: '百川 (彩色)',
    path: 'baichuan-color.svg',
    suggestedFor: ['baichuan'],
    category: '国内 AI',
  },
  {
    name: '天工 (彩色)',
    path: 'tiangong-color.svg',
    suggestedFor: ['tiangong'],
    category: '国内 AI',
  },
  {
    name: '海螺 (彩色)',
    path: 'hailuo-color.svg',
    suggestedFor: ['hailuo'],
    category: '国内 AI',
  },
  {
    name: 'InternLM (彩色)',
    path: 'internlm-color.svg',
    suggestedFor: ['internlm'],
    category: '国内 AI',
  },
  {
    name: '智谱清言 (彩色)',
    path: 'qingyan-color.svg',
    suggestedFor: ['qingyan'],
    category: '国内 AI',
  },
  {
    name: '元宝 (彩色)',
    path: 'yuanbao-color.svg',
    suggestedFor: ['yuanbao'],
    category: '国内 AI',
  },
  {
    name: 'Skywork (彩色)',
    path: 'skywork-color.svg',
    suggestedFor: ['skywork'],
    category: '国内 AI',
  },
  {
    name: 'RWKV (彩色)',
    path: 'rwkv-color.svg',
    suggestedFor: ['rwkv'],
    category: '国内 AI',
  },
  {
    name: 'Z AI',
    path: 'zai.svg',
    suggestedFor: ['z-ai'],
    category: '国内 AI',
  },

  // === 云服务商 ===
  {
    name: 'AWS (彩色)',
    path: 'aws-color.svg',
    suggestedFor: ['aws', 'bedrock'],
    category: '云服务',
  },
  {
    name: 'Bedrock (彩色)',
    path: 'bedrock-color.svg',
    suggestedFor: ['bedrock'],
    category: '云服务',
  },
  {
    name: 'Azure (彩色)',
    path: 'azure-color.svg',
    suggestedFor: ['azure'],
    category: '云服务',
  },
  {
    name: 'Azure AI (彩色)',
    path: 'azureai-color.svg',
    suggestedFor: ['azureai'],
    category: '云服务',
  },
  {
    name: 'Vertex AI (彩色)',
    path: 'vertexai-color.svg',
    suggestedFor: ['vertexai'],
    category: '云服务',
  },
  {
    name: '百度云 (彩色)',
    path: 'baiducloud-color.svg',
    suggestedFor: ['baiducloud'],
    category: '云服务',
  },
  {
    name: '腾讯云 (彩色)',
    path: 'tencentcloud-color.svg',
    suggestedFor: ['tencentcloud'],
    category: '云服务',
  },
  {
    name: '火山引擎 (彩色)',
    path: 'volcengine-color.svg',
    suggestedFor: ['volcengine'],
    category: '云服务',
  },
  {
    name: '阿里百炼 (彩色)',
    path: 'bailian-color.svg',
    suggestedFor: ['bailian'],
    category: '云服务',
  },
  {
    name: 'Cloudflare (彩色)',
    path: 'cloudflare-color.svg',
    suggestedFor: ['cloudflare'],
    category: '云服务',
  },
  {
    name: 'Workers AI (彩色)',
    path: 'workersai-color.svg',
    suggestedFor: ['workersai'],
    category: '云服务',
  },
  {
    name: 'Nebius',
    path: 'nebius.svg',
    suggestedFor: ['nebius'],
    category: '云服务',
  },

  // === API 服务 ===
  {
    name: 'OpenRouter',
    path: 'openrouter.svg',
    suggestedFor: ['openrouter'],
    category: 'API 服务',
  },
  {
    name: 'SiliconFlow (彩色)',
    path: 'siliconcloud-color.svg',
    suggestedFor: ['siliconflow', 'siliconcloud'],
    category: 'API 服务',
  },
  {
    name: 'DeepInfra (彩色)',
    path: 'deepinfra-color.svg',
    suggestedFor: ['deepinfra'],
    category: 'API 服务',
  },
  {
    name: 'Together (彩色)',
    path: 'together-color.svg',
    suggestedFor: ['together'],
    category: 'API 服务',
  },
  {
    name: 'Fireworks (彩色)',
    path: 'fireworks-color.svg',
    suggestedFor: ['fireworks'],
    category: 'API 服务',
  },
  {
    name: 'Perplexity (彩色)',
    path: 'perplexity-color.svg',
    suggestedFor: ['perplexity'],
    category: 'API 服务',
  },
  {
    name: 'Infermatic (彩色)',
    path: 'infermatic-color.svg',
    suggestedFor: ['infermatic'],
    category: 'API 服务',
  },
  {
    name: 'Hyperbolic (彩色)',
    path: 'hyperbolic-color.svg',
    suggestedFor: ['hyperbolic'],
    category: 'API 服务',
  },
  {
    name: 'Featherless (彩色)',
    path: 'featherless-color.svg',
    suggestedFor: ['featherless'],
    category: 'API 服务',
  },

  // === 开源/自托管 ===
  {
    name: 'Ollama',
    path: 'ollama.svg',
    suggestedFor: ['ollama'],
    category: '开源工具',
  },
  {
    name: 'HuggingFace (彩色)',
    path: 'huggingface-color.svg',
    suggestedFor: ['huggingface'],
    category: '开源工具',
  },
  {
    name: 'ModelScope (彩色)',
    path: 'modelscope-color.svg',
    suggestedFor: ['modelscope'],
    category: '开源工具',
  },
  {
    name: 'Open WebUI',
    path: 'openwebui.svg',
    suggestedFor: ['openwebui'],
    category: '开源工具',
  },
  {
    name: 'Dify (彩色)',
    path: 'dify-color.svg',
    suggestedFor: ['dify'],
    category: '开源工具',
  },
  {
    name: 'FastGPT (彩色)',
    path: 'fastgpt-color.svg',
    suggestedFor: ['fastgpt'],
    category: '开源工具',
  },
  {
    name: 'LobeHub (彩色)',
    path: 'lobehub-color.svg',
    suggestedFor: ['lobehub'],
    category: '开源工具',
  },
  {
    name: 'NewAPI (彩色)',
    path: 'newapi-color.svg',
    suggestedFor: ['newapi', 'one-api'],
    category: '开源工具',
  },

  // === 其他服务 ===
  {
    name: 'Microsoft (彩色)',
    path: 'microsoft-color.svg',
    suggestedFor: ['microsoft'],
    category: '其他',
  },
  {
    name: 'GitHub',
    path: 'github.svg',
    suggestedFor: ['github'],
    category: '其他',
  },
  {
    name: 'GitHub Copilot',
    path: 'githubcopilot.svg',
    suggestedFor: ['copilot'],
    category: '其他',
  },
  {
    name: 'Nvidia (彩色)',
    path: 'nvidia-color.svg',
    suggestedFor: ['nvidia'],
    category: '其他',
  },
  {
    name: 'IBM',
    path: 'ibm.svg',
    suggestedFor: ['ibm'],
    category: '其他',
  },
  {
    name: 'Coze',
    path: 'coze.svg',
    suggestedFor: ['coze'],
    category: '其他',
  },
  {
    name: 'POE (彩色)',
    path: 'poe-color.svg',
    suggestedFor: ['poe'],
    category: '其他',
  },
  {
    name: 'Notion',
    path: 'notion.svg',
    suggestedFor: ['notion'],
    category: '其他',
  },
  {
    name: 'NotebookLM',
    path: 'notebooklm.svg',
    suggestedFor: ['notebooklm'],
    category: '其他',
  },
];

/**
 * 默认图标配置（使用彩色图标）
 */
export const DEFAULT_ICON_CONFIGS: ModelIconConfig[] = [
  // === Provider 级别匹配（优先级 10） ===
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
    iconPath: `${PRESET_ICONS_DIR}/claude-color.svg`,
    priority: 10,
    enabled: true,
    description: 'Anthropic (Claude) 提供商图标',
  },
  {
    id: 'provider-gemini',
    matchType: 'provider',
    matchValue: 'gemini',
    iconPath: `${PRESET_ICONS_DIR}/gemini-color.svg`,
    priority: 10,
    enabled: true,
    description: 'Google Gemini 提供商图标',
  },
  {
    id: 'provider-deepseek',
    matchType: 'provider',
    matchValue: 'deepseek',
    iconPath: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
    priority: 10,
    enabled: true,
    description: 'DeepSeek 提供商图标',
  },
  {
    id: 'provider-moonshot',
    matchType: 'provider',
    matchValue: 'moonshot',
    iconPath: `${PRESET_ICONS_DIR}/kimi-color.svg`,
    priority: 10,
    enabled: true,
    description: 'Moonshot AI (Kimi) 提供商图标',
  },
  {
    id: 'provider-zhipu',
    matchType: 'provider',
    matchValue: 'zhipu',
    iconPath: `${PRESET_ICONS_DIR}/zhipu-color.svg`,
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
  {
    id: 'provider-z-ai',
    matchType: 'provider',
    matchValue: 'z-ai',
    iconPath: `${PRESET_ICONS_DIR}/zai.svg`,
    priority: 10,
    enabled: true,
    description: 'Z AI 提供商图标',
  },
  {
    id: 'provider-ai21',
    matchType: 'provider',
    matchValue: 'ai21',
    iconPath: `${PRESET_ICONS_DIR}/aionlabs-color.svg`,
    priority: 10,
    enabled: true,
    description: 'AI21 Labs 提供商图标',
  },
  {
    id: 'provider-nebius',
    matchType: 'provider',
    matchValue: 'nebius',
    iconPath: `${PRESET_ICONS_DIR}/nebius.svg`,
    priority: 10,
    enabled: true,
    description: 'Nebius 提供商图标',
  },

  // === Model Prefix 级别匹配（优先级 20） ===
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
    iconPath: `${PRESET_ICONS_DIR}/claude-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Claude 系列模型图标',
  },
  {
    id: 'model-prefix-gemini',
    matchType: 'modelPrefix',
    matchValue: 'gemini-',
    iconPath: `${PRESET_ICONS_DIR}/gemini-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Gemini 系列模型图标',
  },
  {
    id: 'model-prefix-gemma',
    matchType: 'modelPrefix',
    matchValue: 'gemma-',
    iconPath: `${PRESET_ICONS_DIR}/gemma-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Gemma 系列模型图标',
  },
  {
    id: 'model-prefix-deepseek',
    matchType: 'modelPrefix',
    matchValue: 'deepseek-',
    iconPath: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
    priority: 20,
    enabled: true,
    description: 'DeepSeek 系列模型图标',
  },
  {
    id: 'model-prefix-glm',
    matchType: 'modelPrefix',
    matchValue: 'glm-',
    iconPath: `${PRESET_ICONS_DIR}/chatglm-color.svg`,
    priority: 20,
    enabled: true,
    description: 'GLM 系列模型图标',
  },
  {
    id: 'model-prefix-grok',
    matchType: 'modelPrefix',
    matchValue: 'grok-',
    iconPath: `${PRESET_ICONS_DIR}/grok.svg`,
    priority: 20,
    enabled: true,
    description: 'Grok 系列模型图标',
  },
  {
    id: 'model-prefix-moonshot',
    matchType: 'modelPrefix',
    matchValue: 'moonshot-',
    iconPath: `${PRESET_ICONS_DIR}/kimi-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Moonshot 系列模型图标',
  },
  {
    id: 'model-prefix-llama',
    matchType: 'modelPrefix',
    matchValue: 'llama-',
    iconPath: `${PRESET_ICONS_DIR}/meta-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Llama 系列模型图标',
  },
  {
    id: 'model-prefix-mixtral',
    matchType: 'modelPrefix',
    matchValue: 'mixtral-',
    iconPath: `${PRESET_ICONS_DIR}/mistral-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Mixtral 系列模型图标',
  },
  {
    id: 'model-prefix-qwen',
    matchType: 'modelPrefix',
    matchValue: 'qwen-',
    iconPath: `${PRESET_ICONS_DIR}/qwen-color.svg`,
    priority: 20,
    enabled: true,
    description: '通义千问系列模型图标',
  },
  {
    id: 'model-prefix-command',
    matchType: 'modelPrefix',
    matchValue: 'command-',
    iconPath: `${PRESET_ICONS_DIR}/cohere-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Command 系列模型图标',
  },
  {
    id: 'model-prefix-jamba',
    matchType: 'modelPrefix',
    matchValue: 'jamba-',
    iconPath: `${PRESET_ICONS_DIR}/aionlabs-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Jamba 系列模型图标',
  },
  {
    id: 'model-prefix-phi',
    matchType: 'modelPrefix',
    matchValue: 'phi-',
    iconPath: `${PRESET_ICONS_DIR}/microsoft-color.svg`,
    priority: 20,
    enabled: true,
    description: 'Phi 系列模型图标',
  },

  // === 特定模型匹配（优先级 30） ===
  {
    id: 'model-chatgpt-4o-latest',
    matchType: 'model',
    matchValue: 'chatgpt-4o-latest',
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 30,
    enabled: true,
    description: 'ChatGPT-4o Latest 特定图标',
  },
  {
    id: 'model-gpt-5',
    matchType: 'model',
    matchValue: '^gpt-5',
    useRegex: true,
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 30,
    enabled: true,
    description: 'GPT-5 系列特定图标',
  },
  {
    id: 'model-claude-4',
    matchType: 'model',
    matchValue: '^claude-4',
    useRegex: true,
    iconPath: `${PRESET_ICONS_DIR}/claude-color.svg`,
    priority: 30,
    enabled: true,
    description: 'Claude 4 系列特定图标',
  },
  {
    id: 'model-gemini-2-flash',
    matchType: 'model',
    matchValue: 'gemini-2.0-flash-exp',
    iconPath: `${PRESET_ICONS_DIR}/gemini-color.svg`,
    priority: 30,
    enabled: true,
    description: 'Gemini 2.0 Flash 特定图标',
  },
  {
    id: 'model-gemini-2-5-pro',
    matchType: 'model',
    matchValue: 'gemini-2.5-pro',
    iconPath: `${PRESET_ICONS_DIR}/gemini-color.svg`,
    priority: 30,
    enabled: true,
    description: 'Gemini 2.5 Pro 特定图标',
  },
  {
    id: 'model-gemini-2-5-flash',
    matchType: 'model',
    matchValue: 'gemini-2.5-flash',
    iconPath: `${PRESET_ICONS_DIR}/gemini-color.svg`,
    priority: 30,
    enabled: true,
    description: 'Gemini 2.5 Flash 特定图标',
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
        if (config.useRegex) {
          try {
            const regex = new RegExp(config.matchValue);
            if (regex.test(modelId)) {
              return config.iconPath;
            }
          } catch (e) {
            // 正则表达式无效，跳过
            console.warn(`Invalid regex pattern: ${config.matchValue}`, e);
          }
        } else {
          if (modelId === config.matchValue) {
            return config.iconPath;
          }
        }
        break;

      case 'modelPrefix':
        if (config.useRegex) {
          try {
            const regex = new RegExp(config.matchValue);
            if (regex.test(modelId)) {
              return config.iconPath;
            }
          } catch (e) {
            // 正则表达式无效，跳过
            console.warn(`Invalid regex pattern: ${config.matchValue}`, e);
          }
        } else {
          if (modelId.startsWith(config.matchValue)) {
            return config.iconPath;
          }
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