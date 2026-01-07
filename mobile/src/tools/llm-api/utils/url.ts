import type { ProviderType, LlmProfile } from '../types';
import { openAiUrlHandler } from '../core/adapters/openai-compatible';
import { claudeUrlHandler } from '../core/adapters/claude';
import { geminiUrlHandler } from '../core/adapters/gemini';
import { cohereUrlHandler } from '../core/adapters/cohere';
import { vertexAiUrlHandler } from '../core/adapters/vertexai';

interface AdapterUrlHandler {
  buildUrl: (baseUrl: string, endpoint?: string, profile?: LlmProfile) => string;
  getHint: () => string;
}

const adapterUrlHandlers: Record<string, AdapterUrlHandler> = {
  openai: openAiUrlHandler,
  'openai-responses': openAiUrlHandler, // 移动端暂未细分
  claude: claudeUrlHandler,
  gemini: geminiUrlHandler,
  cohere: cohereUrlHandler,
  vertexai: vertexAiUrlHandler,
};

export function formatLlmApiHost(host: string): string {
  if (!host) return "";
  if (host.endsWith('#')) {
    return host.slice(0, -1);
  }
  return host.endsWith('/') ? host : `${host}/`;
}

export function buildLlmApiUrl(
  baseUrl: string,
  providerType: ProviderType,
  endpoint?: string,
  profile?: LlmProfile
): string {
  if (!baseUrl) return '';

  if (baseUrl.endsWith('#')) {
    const cleanUrl = formatLlmApiHost(baseUrl);
    return endpoint ? `${cleanUrl}${endpoint}` : cleanUrl;
  }

  const handler = adapterUrlHandlers[providerType];
  if (handler) {
    return handler.buildUrl(baseUrl, endpoint, profile);
  }

  const formattedHost = formatLlmApiHost(baseUrl);
  return endpoint ? `${formattedHost}${endpoint}` : formattedHost;
}

export function generateLlmApiEndpointPreview(baseUrl: string, providerType: ProviderType): string {
  return buildLlmApiUrl(baseUrl, providerType);
}

export function getLlmEndpointHint(providerType: ProviderType): string {
  const handler = adapterUrlHandlers[providerType];
  return handler ? handler.getHint() : '';
}