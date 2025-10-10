/**
 * LLM API URL 处理工具函数
 * 用于格式化LLM服务的API地址和生成端点预览
 */

import type { ProviderType } from '../types/llm-profiles';

/**
 * 格式化 LLM API Host 地址
 * 根据URL特征和Provider类型智能添加版本路径
 *
 * @param host - 原始API地址
 * @param providerType - 服务提供商类型（可选）
 * @returns 格式化后的API地址
 */
export function formatLlmApiHost(host: string, providerType?: ProviderType): string {
  // 特殊情况判断函数
  const shouldKeepOriginal = (): boolean => {
    // 已经以斜杠结尾，不添加
    if (host.endsWith('/')) {
      return true;
    }
    
    // 火山引擎等特殊路径，不添加
    if (host.includes('/api/v3') || host.includes('/api/v4')) {
      return true;
    }
    
    return false;
  };

  if (shouldKeepOriginal()) {
    return host;
  }

  // 根据 Provider 类型添加对应的版本路径
  switch (providerType) {
    case 'gemini':
      // Gemini 使用 /v1beta/
      return `${host}/v1beta/`;
    case 'openai':
    case 'claude':
    default:
      // OpenAI 和 Claude 使用 /v1/
      return `${host}/v1/`;
  }
}

/**
 * 生成完整的 LLM API 端点 URL
 * 根据provider类型自动添加正确的端点路径
 * 
 * @param baseUrl - API基础地址
 * @param providerType - 服务提供商类型
 * @param endpoint - 具体端点（可选，用于实际请求）
 * @returns 完整的端点URL
 */
export function buildLlmApiUrl(
  baseUrl: string,
  providerType: ProviderType,
  endpoint?: string
): string {
  if (!baseUrl) {
    return '';
  }

  // 特殊处理：如果URL以#结尾，去掉#并不添加后缀
  // 这允许用户精确控制URL，禁用自动补全
  if (baseUrl.endsWith('#')) {
    const cleanUrl = baseUrl.replace('#', '');
    return endpoint ? `${cleanUrl}${endpoint}` : cleanUrl;
  }
  
  // 格式化基础URL（传入providerType以便正确处理版本路径）
  const formattedHost = formatLlmApiHost(baseUrl, providerType);
  
  // 如果指定了端点，直接拼接
  if (endpoint) {
    return `${formattedHost}${endpoint}`;
  }
  
  // 根据provider类型返回默认端点
  switch (providerType) {
    case 'openai':
      return `${formattedHost}chat/completions`;
      
    case 'gemini':
      // Gemini 需要模型ID，这里返回模板
      return `${formattedHost}models/{model}:generateContent`;
      
    case 'claude':
      return `${formattedHost}messages`;
      
    default:
      return formattedHost;
  }
}

/**
 * 生成 LLM API 端点预览URL（用于UI显示）
 * 
 * @param baseUrl - API基础地址
 * @param providerType - 服务提供商类型
 * @returns 完整的端点URL预览
 */
export function generateLlmApiEndpointPreview(baseUrl: string, providerType: ProviderType): string {
  return buildLlmApiUrl(baseUrl, providerType);
}

/**
 * 检查URL是否禁用了自动补全
 * 
 * @param url - 要检查的URL
 * @returns 是否禁用自动补全（以#结尾）
 */
export function isLlmUrlAutoCompletionDisabled(url: string): boolean {
  return url.endsWith('#');
}

/**
 * 获取 LLM API 端点路径提示文本
 * 
 * @param providerType - 服务提供商类型
 * @returns 提示文本
 */
export function getLlmEndpointHint(providerType: ProviderType): string {
  switch (providerType) {
    case 'openai':
      return '将自动添加 /v1/chat/completions（如需禁用请在URL末尾加#）';
    case 'gemini':
      return '将自动添加 /v1beta/models/{model}:generateContent';
    case 'claude':
      return '将自动添加 /v1/messages';
    default:
      return '';
  }
}