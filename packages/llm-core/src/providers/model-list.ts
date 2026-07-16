import type { JsonValue } from "../types/json";
import type {
  ModelListProviderAdapter,
  ModelListRequest,
  ProviderModelInfo,
} from "../types/model-list";
import type { ProviderProfile } from "../types/provider";
import { readWireResponseJson } from "../utils/wire-response";

const OPENAI_FAMILY = new Set([
  "openai",
  "openai-responses",
  "openai-compatible",
  "deepseek",
  "siliconflow",
  "groq",
  "openrouter",
  "xai",
]);

export const modelListAdapter: ModelListProviderAdapter = {
  buildRequest(profile, request) {
    let url = buildModelListUrl(profile, request);
    if (request.includeAllOutputModalities) {
      url += `${url.includes("?") ? "&" : "?"}output_modalities=all`;
    }
    return {
      method: "GET",
      url,
      headers: buildModelListHeaders(profile, request.provider),
      streaming: false,
    };
  },
  async parseResponse(response, request) {
    const value = normalizeJson(await readWireResponseJson(response));
    return { models: parseProviderModels(value, request.provider), raw: value };
  },
};

export function parseProviderModels(
  value: JsonValue,
  provider: string
): ProviderModelInfo[] {
  const root = asRecord(value);
  if (OPENAI_FAMILY.has(provider) || provider === "vertexai") {
    const entries =
      readArray(root.data).length > 0
        ? readArray(root.data)
        : readArray(root.models);
    return entries.flatMap((entry) => {
      const model = asRecord(entry);
      const id = readString(model.id) ?? readString(model.name);
      if (!id) return [];
      return [fromOpenAiModel(model, id, provider)];
    });
  }
  if (provider === "claude") {
    return readArray(root.data).flatMap((entry) => {
      const model = asRecord(entry);
      const id = readString(model.id);
      if (!id || (model.type !== undefined && model.type !== "model"))
        return [];
      return [
        baseModel(
          model,
          id,
          readString(model.display_name) ?? id,
          "anthropic",
          "Claude"
        ),
      ];
    });
  }
  if (provider === "gemini") {
    return readArray(root.models).flatMap((entry) => {
      const model = asRecord(entry);
      const rawId = readString(model.name);
      if (!rawId) return [];
      const id = rawId.replace(/^models\//, "");
      const result = baseModel(
        model,
        id,
        readString(model.displayName) ?? id,
        "gemini",
        "Gemini"
      );
      result.supportedGenerationMethods = readStringArray(
        model.supportedGenerationMethods
      );
      result.contextLength = readNumber(model.inputTokenLimit);
      result.maxOutputTokens = readNumber(model.outputTokenLimit);
      return [result];
    });
  }
  if (provider === "cohere") {
    return readArray(root.models).flatMap((entry) => {
      const model = asRecord(entry);
      const id = readString(model.model_id) ?? readString(model.name);
      return id ? [baseModel(model, id, id, "cohere", "Cohere")] : [];
    });
  }
  if (provider === "ollama") {
    return readArray(root.models).flatMap((entry) => {
      const model = asRecord(entry);
      const id = readString(model.name);
      if (!id) return [];
      const result = baseModel(model, id, id, "ollama", "Ollama");
      const size = readNumber(model.size);
      if (size !== undefined) {
        result.description = `Size: ${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
      }
      return [result];
    });
  }
  return [];
}

function fromOpenAiModel(
  model: Record<string, JsonValue>,
  id: string,
  fallbackProvider: string
): ProviderModelInfo {
  const owner = readString(model.owned_by) ?? fallbackProvider;
  const result = baseModel(
    model,
    id.replace(/^models\//, ""),
    readString(model.displayName) ?? readString(model.name) ?? id,
    owner,
    owner
  );
  result.contextLength = readNumber(model.context_length);
  result.maxOutputTokens = readNumber(
    asRecord(model.top_provider).max_completion_tokens
  );
  const architecture = asRecord(model.architecture);
  result.inputModalities = readStringArray(architecture.input_modalities);
  result.outputModalities = readStringArray(architecture.output_modalities);
  result.supportedParameters = readStringArray(model.supported_parameters);
  const pricing = asRecord(model.pricing);
  if (Object.keys(pricing).length > 0) {
    result.pricing = Object.fromEntries(
      Object.entries(pricing).filter(
        (entry): entry is [string, string | number] =>
          typeof entry[1] === "string" || typeof entry[1] === "number"
      )
    );
  }
  return result;
}

function baseModel(
  raw: Record<string, JsonValue>,
  id: string,
  name: string,
  provider: string,
  group: string
): ProviderModelInfo {
  return {
    id,
    name,
    provider,
    group,
    description: readString(raw.description),
    raw,
  };
}

function buildModelListUrl(
  profile: ProviderProfile,
  request: ModelListRequest
): string {
  const custom = profile.endpoints?.models;
  const endpoint = custom || request.endpoint;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const base = profile.baseUrl.replace(/\/+$/, "");
  if (request.provider === "ollama") return joinUrl(base, endpoint);
  if (request.provider === "gemini") {
    const versioned = /\/v1(?:beta)?$/i.test(base) ? base : `${base}/v1beta`;
    return joinUrl(versioned, endpoint);
  }
  const versioned = /\/v\d+(?:beta)?$/i.test(base) ? base : `${base}/v1`;
  return joinUrl(versioned, endpoint);
}

function buildModelListHeaders(
  profile: ProviderProfile,
  provider: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...profile.headers,
  };
  if (!profile.apiKey) return headers;
  if (provider === "claude") {
    headers["x-api-key"] = profile.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (provider === "gemini") {
    headers["x-goog-api-key"] = profile.apiKey;
    headers["x-goog-api-client"] = "google-genai-sdk/1.0.1 gl-node/web";
  } else {
    headers.Authorization = `Bearer ${profile.apiKey}`;
  }
  return headers;
}

function joinUrl(base: string, endpoint: string): string {
  return `${base.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function normalizeJson(value: unknown): JsonValue {
  if (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  ) {
    return value as JsonValue;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeJson(item)])
    );
  }
  return null;
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function readArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readStringArray(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter(
    (item): item is string => typeof item === "string"
  );
  return result.length > 0 ? result : undefined;
}
