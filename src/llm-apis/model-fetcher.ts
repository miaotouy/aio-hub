/**
 * LLM 模型列表获取工具
 * 支持从不同提供商 API 获取可用模型列表
 */

import type { LlmProfile, LlmModelInfo, ProviderType } from '../types/llm-profiles';
import { getProviderTypeInfo } from '../config/llm-providers';
import { buildLlmApiUrl } from '@utils/llm-api-url';
import { fetchWithRetry } from './common';
import { createModuleLogger } from '@utils/logger';
import { DEFAULT_ICON_CONFIGS } from '../config/model-icons';

const logger = createModuleLogger('ModelFetcher');

/**
 * 从 API 获取模型列表
 */
export async function fetchModelsFromApi(profile: LlmProfile): Promise<LlmModelInfo[]> {
  const providerInfo = getProviderTypeInfo(profile.type);
  
  if (!providerInfo?.supportsModelList || !providerInfo.modelListEndpoint) {
    throw new Error(`提供商 ${providerInfo?.name} 不支持自动获取模型列表`);
  }

  logger.info('开始获取模型列表', {
    profileName: profile.name,
    providerType: profile.type,
    endpoint: providerInfo.modelListEndpoint,
  });

  const url = buildLlmApiUrl(profile.baseUrl, profile.type, providerInfo.modelListEndpoint);
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : '';

  // 根据不同提供商构建请求头
  const headers = buildRequestHeaders(profile.type, apiKey);

  try {
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const models = parseModelsResponse(data, profile.type);

    logger.info('模型列表获取成功', {
      profileName: profile.name,
      modelCount: models.length,
    });

    return models;
  } catch (error) {
    logger.error('获取模型列表失败', error, {
      profileName: profile.name,
      providerType: profile.type,
    });
    throw error;
  }
}

/**
 * 根据提供商类型构建请求头
 */
function buildRequestHeaders(providerType: ProviderType, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  switch (providerType) {
    case 'openai':
    case 'openai-responses':
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      break;

    case 'claude':
      if (apiKey) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }
      break;

    case 'gemini':
      // Gemini 使用 URL 参数传递 API Key，不需要在 header 中
      break;

    case 'cohere':
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      break;

    case 'vertexai':
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      break;
  }

  return headers;
}

/**
 * 解析不同提供商的模型列表响应
 */
function parseModelsResponse(data: any, providerType: ProviderType): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  switch (providerType) {
    case 'openai':
    case 'openai-responses':
      // OpenAI 格式: { data: [{ id, object, created, owned_by }] }
      // 或增强格式 (OpenRouter): { data: [{ id, name, description, context_length, architecture, pricing, ... }] }
      if (data.data && Array.isArray(data.data)) {
        for (const model of data.data) {
          // 检测是否为增强格式（有更多字段）
          const isEnhancedFormat = model.context_length || model.architecture || model.pricing;
          
          const modelInfo: LlmModelInfo = {
            id: model.id,
            name: model.name || model.id,
            group: extractModelGroup(model.id, 'openai', model.owned_by || 'openai'),
            provider: model.owned_by || 'openai',
            description: model.description,
          };

          // 解析增强字段
          if (isEnhancedFormat) {
            // Token 限制
            if (model.context_length) {
              modelInfo.tokenLimits = {
                contextLength: model.context_length,
              };
              
              // 如果有 max_completion_tokens，设置输出限制
              if (model.top_provider?.max_completion_tokens) {
                modelInfo.tokenLimits.output = model.top_provider.max_completion_tokens;
              }
            }
            
            // 架构信息
            if (model.architecture) {
              modelInfo.architecture = {
                modality: model.architecture.modality,
                inputModalities: model.architecture.input_modalities,
                outputModalities: model.architecture.output_modalities,
              };
              
              // 根据架构判断能力
              const inputMods = model.architecture.input_modalities || [];
              modelInfo.capabilities = {
                vision: inputMods.includes('image'),
                thinking: model.supported_parameters?.includes('reasoning') ||
                          model.supported_parameters?.includes('include_reasoning'),
              };
            }
            
            // 价格信息
            if (model.pricing) {
              modelInfo.pricing = {
                prompt: model.pricing.prompt,
                completion: model.pricing.completion,
                request: model.pricing.request,
                image: model.pricing.image,
              };
            }
            
            // 支持的参数
            if (model.supported_parameters) {
              modelInfo.supportedFeatures = {
                parameters: model.supported_parameters,
              };
            }
            
            // 默认参数
            if (model.default_parameters) {
              modelInfo.defaultParameters = {
                temperature: model.default_parameters.temperature,
                topP: model.default_parameters.top_p,
              };
            }
          }
          
          models.push(modelInfo);
        }
      }
      break;

    case 'claude':
      // Claude 格式: { data: [{ id, display_name, type, created_at }] }
      if (data.data && Array.isArray(data.data)) {
        for (const model of data.data) {
          if (model.type === 'model') {
            models.push({
              id: model.id,
              name: model.display_name || model.id,
              group: extractModelGroup(model.id, 'claude', 'anthropic'),
              provider: 'anthropic',
              description: model.description,
              capabilities: {
                vision: model.id.includes('opus') || model.id.includes('sonnet') || model.id.includes('haiku'),
              },
            });
          }
        }
      }
      break;

    case 'gemini':
      // Gemini 格式: { models: [{ name, displayName, supportedGenerationMethods, inputTokenLimit, outputTokenLimit, ... }] }
      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          // 从 name 中提取模型 ID (格式: models/gemini-xxx)
          const modelId = model.name.replace('models/', '');
          
          // 判断是否支持视觉：检查是否支持 generateContent 且不是 embedding 模型
          const supportsVision = model.supportedGenerationMethods?.includes('generateContent')
            && !modelId.includes('embedding');
          
          models.push({
            id: modelId,
            name: model.displayName || modelId,
            group: extractModelGroup(modelId, 'gemini', 'gemini'),
            provider: 'gemini',
            version: model.version,
            description: model.description,
            capabilities: {
              vision: supportsVision,
              thinking: model.thinking === true,
            },
            tokenLimits: {
              contextLength: model.inputTokenLimit,
              output: model.outputTokenLimit,
            },
            supportedFeatures: {
              generationMethods: model.supportedGenerationMethods,
            },
            defaultParameters: {
              temperature: model.temperature,
              topP: model.topP,
              topK: model.topK,
              maxTemperature: model.maxTemperature,
            },
          });
        }
      }
      break;

    case 'cohere':
      // Cohere 格式: { models: [{ name, endpoints }] }
      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          models.push({
            id: model.name,
            name: model.name,
            group: extractModelGroup(model.name, 'cohere', 'cohere'),
            provider: 'cohere',
          });
        }
      }
      break;

    case 'vertexai':
      // Vertex AI 使用与 Gemini 类似的格式
      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          const modelId = model.name.split('/').pop() || model.name;
          models.push({
            id: modelId,
            name: model.displayName || modelId,
            group: extractModelGroup(modelId, 'gemini', 'google'),
            provider: 'google',
            capabilities: {
              vision: true, // Vertex AI 的模型通常都支持视觉
            },
          });
        }
      }
      break;
  }

  return models;
}

/**
 * 从模型 ID 提取分组信息
 * 优先使用图标配置中的 groupName，如果没有则使用默认分组逻辑
 */
function extractModelGroup(modelId: string, providerType: ProviderType, provider?: string): string {
  // 首先尝试从图标配置中获取分组
  const configs = DEFAULT_ICON_CONFIGS
    .filter(c => c.enabled !== false && c.groupName)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const config of configs) {
    let matched = false;
    
    switch (config.matchType) {
      case 'model':
        if (config.useRegex) {
          try {
            const regex = new RegExp(config.matchValue);
            matched = regex.test(modelId);
          } catch (e) {
            // 正则表达式无效，跳过
          }
        } else {
          matched = modelId === config.matchValue;
        }
        break;

      case 'modelPrefix':
        if (config.useRegex) {
          try {
            const regex = new RegExp(config.matchValue);
            matched = regex.test(modelId);
          } catch (e) {
            // 正则表达式无效，跳过
          }
        } else {
          matched = modelId.toLowerCase().includes(config.matchValue.toLowerCase());
        }
        break;

      case 'provider':
        if (provider && provider.toLowerCase() === config.matchValue.toLowerCase()) {
          matched = true;
        }
        break;
    }
    
    if (matched && config.groupName) {
      return config.groupName;
    }
  }
  
  // 如果图标配置中没有匹配，使用默认分组逻辑
  const id = modelId.toLowerCase();
  
  switch (providerType) {
    case 'openai':
      if (id.includes('gpt-4')) return 'GPT-4';
      if (id.includes('gpt-3.5')) return 'GPT-3.5';
      if (id.includes('o1')) return 'o1';
      if (id.includes('o3')) return 'o3';
      return 'Other';
      
    case 'claude':
      if (id.includes('opus')) return 'Claude Opus';
      if (id.includes('sonnet')) return 'Claude Sonnet';
      if (id.includes('haiku')) return 'Claude Haiku';
      return 'Claude';
      
    case 'gemini':
      if (id.includes('2.5')) return 'Gemini 2.5';
      if (id.includes('2.0')) return 'Gemini 2.0';
      if (id.includes('1.5')) return 'Gemini 1.5';
      if (id.includes('1.0')) return 'Gemini 1.0';
      return 'Gemini';
      
    case 'cohere':
      if (id.includes('command')) return 'Command';
      return 'Cohere';
      
    default:
      return 'Models';
  }
}
