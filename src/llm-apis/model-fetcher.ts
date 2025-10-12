
/**
 * LLM 模型列表获取工具
 * 支持从不同提供商 API 获取可用模型列表
 */

import type { LlmProfile, LlmModelInfo, ProviderType } from '../types/llm-profiles';
import { getProviderTypeInfo } from '../config/llm-providers';
import { buildLlmApiUrl } from '@utils/llm-api-url';
import { fetchWithRetry } from './common';
import { createModuleLogger } from '@utils/logger';

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
      if (data.data && Array.isArray(data.data)) {
        for (const model of data.data) {
          models.push({
            id: model.id,
            name: model.id, // 使用 ID 作为默认名称
            group: extractModelGroup(model.id, 'openai'),
            provider: 'openai',
          });
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
              group: extractModelGroup(model.id, 'claude'),
              provider: 'anthropic',
              capabilities: {
                vision: model.id.includes('opus') || model.id.includes('sonnet') || model.id.includes('haiku'),
              },
            });
          }
        }
      }
      break;

    case 'gemini':
      // Gemini 格式: { models: [{ name, displayName, supportedGenerationMethods }] }
      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          // 从 name 中提取模型 ID (格式: models/gemini-xxx)
          const modelId = model.name.replace('models/', '');
          models.push({
            id: modelId,
            name: model.displayName || modelId,
            group: extractModelGroup(modelId, 'gemini'),
            provider: 'gemini',
            capabilities: {
              vision: model.supportedGenerationMethods?.includes('generateContent'),
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
            group: extractModelGroup(model.name, 'cohere'),
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
            group: extractModelGroup(modelId, 'gemini'),
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
 */
function extractModelGroup(modelId: string, providerType: ProviderType): string {
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
