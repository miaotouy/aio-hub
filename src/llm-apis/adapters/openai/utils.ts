import type { LlmProfile, LlmModelInfo } from "@/types/llm-profiles";
import { DEFAULT_METADATA_RULES, testRuleMatch } from "@/config/model-metadata";

/**
 * OpenAI 适配器的 URL 处理逻辑
 */
export const openAiUrlHandler = {
  buildUrl: (
    baseUrl: string,
    endpoint?: string,
    profile?: LlmProfile,
    pathParams?: Record<string, string>
  ): string => {
    // 如果提供了 profile 且有对应的自定义端点，则优先使用
    if (profile?.customEndpoints) {
      const custom = profile.customEndpoints as Record<string, string | undefined>;
      // 根据 endpoint 映射到对应的自定义配置键
      const mapping: Record<string, keyof NonNullable<LlmProfile["customEndpoints"]>> = {
        "chat/completions": "chatCompletions",
        completions: "completions",
        models: "models",
        embeddings: "embeddings",
        rerank: "rerank",
        "images/generations": "imagesGenerations",
        "images/edits": "imagesEdits",
        "images/variations": "imagesVariations",
        "audio/speech": "audioSpeech",
        "audio/transcriptions": "audioTranscriptions",
        "audio/translations": "audioTranslations",
        moderations: "moderations",
        videos: "videos",
        videoStatus: "videoStatus",
      };

      const customKey = endpoint ? mapping[endpoint] : "chatCompletions";
      if (customKey && custom[customKey]) {
        let customEndpoint = custom[customKey]!;

        // 处理路径参数替换，例如 /v1/videos/{video_id}
        if (pathParams) {
          for (const [key, value] of Object.entries(pathParams)) {
            customEndpoint = customEndpoint.replace(`{${key}}`, value);
          }
        }

        // 如果自定义端点是完整的 URL，直接返回
        if (customEndpoint.startsWith("http")) return customEndpoint;
        // 否则将其拼接到 baseUrl
        const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
        // 去掉自定义端点开头的 /
        const cleanEndpoint = customEndpoint.startsWith("/")
          ? customEndpoint.substring(1)
          : customEndpoint;
        return `${host}${cleanEndpoint}`;
      }
    }

    // 确保 baseUrl 以 / 结尾
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    // 智能添加 v1 版本路径（如果没加的话）
    // 如果已经包含 /v1, /v2, /v3 或 /api/v3 等，则不再添加
    const versionedHost =
      host.includes("/v1") ||
      host.includes("/v2") ||
      host.includes("/v3") ||
      host.includes("/api/v")
        ? host
        : `${host}v1/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}chat/completions`;
  },
  getHint: (): string => {
    return "将自动补全版本号(如 /v1/)及端点(如 /chat/completions)，如需禁用请在URL末尾加#";
  },
};

/**
 * OpenAI Responses 适配器的 URL 处理逻辑
 */
export const openAiResponsesUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    // 智能添加 v1 版本路径（如果没加的话），同时兼容 v2, v3 等
    const versionedHost =
      host.includes("/v1") ||
      host.includes("/v2") ||
      host.includes("/v3") ||
      host.includes("/api/v")
        ? host
        : `${host}v1/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}responses`;
  },
  getHint: (): string => {
    return "将自动补全版本号(如 /v1/)及端点(如 /responses)，支持工具调用和推理的有状态交互";
  },
};

/**
 * 构建 OpenAI 请求头
 */
export const buildOpenAiHeaders = (profile: LlmProfile): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 使用第一个可用的 API Key
  if (profile.apiKeys && profile.apiKeys.length > 0) {
    headers["Authorization"] = `Bearer ${profile.apiKeys[0]}`;
  }

  // 应用自定义请求头
  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  return headers;
};

/**
 * 解析 OpenAI 风格的模型列表响应
 */
export function parseOpenAiModelsResponse(data: any): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  if (data.data && Array.isArray(data.data)) {
    for (const model of data.data) {
      // 检测是否为增强格式（有更多字段，如 OpenRouter）
      const isEnhancedFormat = model.context_length || model.architecture || model.pricing;

      const modelInfo: LlmModelInfo = {
        id: model.id,
        name: model.name || model.id,
        group: extractModelGroup(model.id, "openai", model.owned_by || "openai"),
        provider: model.owned_by || "openai",
        description: model.description,
        capabilities: extractModelCapabilities(model.id, model.owned_by || "openai"),
      };

      // 解析增强字段
      if (isEnhancedFormat) {
        if (model.context_length) {
          modelInfo.tokenLimits = { contextLength: model.context_length };
          if (model.top_provider?.max_completion_tokens) {
            modelInfo.tokenLimits.output = model.top_provider.max_completion_tokens;
          }
        }

        if (model.architecture) {
          modelInfo.architecture = {
            modality: model.architecture.modality,
            inputModalities: model.architecture.input_modalities,
            outputModalities: model.architecture.output_modalities,
          };

          const inputMods = model.architecture.input_modalities || [];
          modelInfo.capabilities = {
            ...modelInfo.capabilities,
            vision: inputMods.includes("image"),
            thinking:
              model.supported_parameters?.includes("reasoning") ||
              model.supported_parameters?.includes("include_reasoning"),
          };
        }

        if (model.pricing) {
          modelInfo.pricing = {
            prompt: model.pricing.prompt,
            completion: model.pricing.completion,
            request: model.pricing.request,
            image: model.pricing.image,
          };
        }

        if (model.supported_parameters) {
          modelInfo.supportedFeatures = { parameters: model.supported_parameters };
        }

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

  return models;
}

/**
 * 内部辅助：提取模型能力
 */
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

/**
 * 内部辅助：提取模型分组
 */
function extractModelGroup(modelId: string, _providerType: string, provider?: string): string {
  const rules = DEFAULT_METADATA_RULES.filter(
    (r) => r.enabled !== false && r.properties?.group
  ).sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of rules) {
    if (testRuleMatch(rule, modelId, provider) && rule.properties?.group) {
      return rule.properties.group;
    }
  }

  const id = modelId.toLowerCase();
  if (id.includes("gpt-4")) return "GPT-4";
  if (id.includes("gpt-3.5")) return "GPT-3.5";
  if (id.includes("o1")) return "o1";
  if (id.includes("o3")) return "o3";
  return "Other";
}
