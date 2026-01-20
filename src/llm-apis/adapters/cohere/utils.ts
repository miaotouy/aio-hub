import type { LlmModelInfo } from "../../../types/llm-profiles";
import { DEFAULT_METADATA_RULES, testRuleMatch } from "../../../config/model-metadata";

/**
 * Cohere 适配器的 URL 处理逻辑
 */
export const cohereUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const versionedHost = host.includes('/v2') ? host : `${host}v2/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}chat`;
  },
  getHint: (): string => {
    return '将自动添加 /v2/chat';
  }
};

/**
 * 解析 Cohere 模型列表响应
 */
export function parseCohereModelsResponse(data: any): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  if (data.models && Array.isArray(data.models)) {
    for (const model of data.models) {
      const modelId = model.name;
      const presetCapabilities = extractModelCapabilities(modelId, "cohere");

      models.push({
        id: modelId,
        name: modelId,
        group: extractModelGroup(modelId, "cohere"),
        provider: "cohere",
        capabilities: presetCapabilities,
      });
    }
  }

  return models;
}

function extractModelCapabilities(modelId: string, provider?: string) {
  const rules = DEFAULT_METADATA_RULES.filter(
    (r) => r.enabled !== false && r.properties?.capabilities
  ).sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of rules) {
    if (testRuleMatch(rule, modelId, provider) && rule.properties?.capabilities) {
      return rule.properties.capabilities;
    }
  }
  return undefined;
}

function extractModelGroup(modelId: string, provider?: string): string {
  const rules = DEFAULT_METADATA_RULES.filter(
    (r) => r.enabled !== false && r.properties?.group
  ).sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of rules) {
    if (testRuleMatch(rule, modelId, provider) && rule.properties?.group) {
      return rule.properties.group;
    }
  }

  const id = modelId.toLowerCase();
  if (id.includes("command")) return "Command";
  return "Cohere";
}