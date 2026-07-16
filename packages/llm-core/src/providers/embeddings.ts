import type {
  EmbeddingProviderAdapter,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingTaskType,
} from "../types/embedding";
import type { JsonValue, WireJsonValue } from "../types/json";
import type { ProviderProfile } from "../types/provider";
import type { WireRequest, WireResponse } from "../types/transport";

type JsonObject = Record<string, JsonValue>;

export function buildOpenAiEmbeddingRequest(
  profile: ProviderProfile,
  request: EmbeddingRequest
): WireRequest {
  const body: Record<string, WireJsonValue> = {
    model: request.model,
    input: request.input,
    ...request.extensions,
  };
  assignDefined(body, "dimensions", request.dimensions);
  assignDefined(body, "user", request.user);
  assignDefined(body, "encoding_format", request.encodingFormat);
  return jsonRequest(
    buildEndpointUrl(profile, "embeddings", "v1/embeddings"),
    {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    body
  );
}

export async function parseOpenAiEmbeddingResponse(
  response: WireResponse,
  request: EmbeddingRequest
): Promise<EmbeddingResponse> {
  const root = await readJsonObject(response, "OpenAI Embedding");
  throwProviderError(root, "OpenAI Embedding");
  const usage = asObject(root.usage);
  return {
    object: "list",
    data: parseEmbeddingData(root.data),
    model: readString(root.model) ?? request.model,
    usage: {
      promptTokens: readNumber(usage?.prompt_tokens) ?? 0,
      totalTokens: readNumber(usage?.total_tokens) ?? 0,
    },
  };
}

export function isGeminiEmbedding2(model: string): boolean {
  return model.includes("gemini-embedding-2");
}

export function formatGeminiEmbedding2Input(
  text: string,
  taskType: EmbeddingTaskType,
  title?: string
): string {
  switch (taskType) {
    case "RETRIEVAL_QUERY":
      return `task: search result | query: ${text}`;
    case "RETRIEVAL_DOCUMENT":
      return `title: ${title || "none"} | text: ${text}`;
    case "CLASSIFICATION":
      return `task: classification | query: ${text}`;
    case "CLUSTERING":
      return `task: clustering | query: ${text}`;
    case "SEMANTIC_SIMILARITY":
      return `task: sentence similarity | query: ${text}`;
  }
}

export function buildGeminiEmbeddingRequest(
  profile: ProviderProfile,
  request: EmbeddingRequest
): WireRequest {
  const batch = Array.isArray(request.input);
  const gemini2 = isGeminiEmbedding2(request.model);
  const action = batch ? "batchEmbedContents" : "embedContent";
  const customEndpoint = profile.endpoints?.embeddings;
  const host = ensureTrailingSlash(profile.baseUrl);
  const versionedHost = /\/v1(?:beta)?\/?$/.test(host)
    ? host
    : `${host}v1beta/`;
  const rawUrl = customEndpoint
    ? customEndpoint.startsWith("http")
      ? customEndpoint
      : `${host}${customEndpoint.replace(/^\//, "")}`
    : `${versionedHost}models/${encodeURIComponent(request.model)}:${action}`;
  const url = profile.apiKey
    ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}key=${encodeURIComponent(profile.apiKey)}`
    : rawUrl;
  const inputs = Array.isArray(request.input) ? request.input : [request.input];
  const items = inputs.map((text) =>
    buildGeminiEmbeddingItem(request, text, gemini2)
  );
  const body: Record<string, WireJsonValue> = batch
    ? { requests: items, ...request.extensions }
    : { ...items[0], ...request.extensions };
  return jsonRequest(
    url,
    {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { "x-goog-api-key": profile.apiKey } : {}),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    body
  );
}

function buildGeminiEmbeddingItem(
  request: EmbeddingRequest,
  text: string,
  gemini2: boolean
): JsonObject {
  const input =
    gemini2 && request.taskType
      ? formatGeminiEmbedding2Input(text, request.taskType, request.title)
      : text;
  return {
    model: `models/${request.model}`,
    content: { parts: [{ text: input }] },
    ...(!gemini2 && request.taskType
      ? {
          taskType: request.taskType,
          ...(request.title && request.taskType === "RETRIEVAL_DOCUMENT"
            ? { title: request.title }
            : {}),
        }
      : {}),
    ...(gemini2 && request.dimensions
      ? { outputDimensionality: request.dimensions }
      : {}),
  };
}

export async function parseGeminiEmbeddingResponse(
  response: WireResponse,
  request: EmbeddingRequest
): Promise<EmbeddingResponse> {
  const root = await readJsonObject(response, "Gemini Embedding");
  throwProviderError(root, "Gemini Embedding");
  const rawEmbeddings = readArray(root.embeddings);
  const embeddings = rawEmbeddings?.length
    ? rawEmbeddings
    : root.embedding !== undefined
      ? [root.embedding]
      : [];
  return {
    object: "list",
    data: embeddings.map((rawEmbedding, index) => ({
      object: "embedding",
      index,
      embedding: readNumberArray(asObject(rawEmbedding)?.values),
    })),
    model: request.model,
    usage: { promptTokens: 0, totalTokens: 0 },
  };
}

export function buildCohereEmbeddingRequest(
  profile: ProviderProfile,
  request: EmbeddingRequest
): WireRequest {
  let baseUrl = profile.baseUrl.replace(/\/$/, "");
  if (baseUrl.endsWith("/v1")) baseUrl = baseUrl.slice(0, -3);
  const taskTypeMap: Record<EmbeddingTaskType, string> = {
    RETRIEVAL_QUERY: "search_query",
    RETRIEVAL_DOCUMENT: "search_document",
    SEMANTIC_SIMILARITY: "search_query",
    CLASSIFICATION: "classification",
    CLUSTERING: "clustering",
  };
  return jsonRequest(
    profile.endpoints?.embeddings ?? `${baseUrl}/v2/embed`,
    {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    {
      model: request.model,
      texts: Array.isArray(request.input) ? request.input : [request.input],
      input_type: taskTypeMap[request.taskType ?? "RETRIEVAL_QUERY"],
      embedding_types: [request.encodingFormat ?? "float"],
      ...request.extensions,
    }
  );
}

export async function parseCohereEmbeddingResponse(
  response: WireResponse,
  request: EmbeddingRequest
): Promise<EmbeddingResponse> {
  const root = await readJsonObject(response, "Cohere Embedding");
  throwProviderError(root, "Cohere Embedding");
  const embeddings = asObject(root.embeddings);
  const format = request.encodingFormat ?? "float";
  const meta = asObject(root.meta);
  const billedUnits = asObject(meta?.billed_units);
  const tokens = readNumber(billedUnits?.input_tokens) ?? 0;
  return {
    object: "list",
    data: (readArray(embeddings?.[format]) ?? []).map((value, index) => ({
      object: "embedding",
      index,
      embedding: readNumberArray(value),
    })),
    model: request.model,
    usage: { promptTokens: tokens, totalTokens: tokens },
  };
}

export function buildVertexEmbeddingRequest(
  profile: ProviderProfile,
  request: EmbeddingRequest
): WireRequest {
  const customEndpoint = profile.endpoints?.embeddings;
  const host = ensureTrailingSlash(profile.baseUrl);
  const versionedHost = /\/v1(?:\/|$)/.test(host) ? host : `${host}v1/`;
  const projectId = readString(profile.options?.projectId);
  const location = readString(profile.options?.location) ?? "us-central1";
  const hasResourcePrefix = /\/projects\/[^/]+\/locations\/[^/]+\/?$/.test(
    versionedHost
  );
  const resourcePrefix =
    !hasResourcePrefix && projectId
      ? `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/`
      : "";
  const url = customEndpoint
    ? customEndpoint.startsWith("http")
      ? customEndpoint
      : `${host}${customEndpoint.replace(/^\//, "")}`
    : `${versionedHost}${resourcePrefix}publishers/google/models/${encodeURIComponent(request.model)}:predict`;
  const taskType = request.taskType ?? "RETRIEVAL_QUERY";
  const inputs = Array.isArray(request.input) ? request.input : [request.input];
  return jsonRequest(
    url,
    {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    {
      instances: inputs.map((text) => ({
        content: text,
        task_type: taskType,
        ...(request.title && taskType === "RETRIEVAL_DOCUMENT"
          ? { title: request.title }
          : {}),
      })),
      ...request.extensions,
    }
  );
}

export async function parseVertexEmbeddingResponse(
  response: WireResponse,
  request: EmbeddingRequest
): Promise<EmbeddingResponse> {
  const root = await readJsonObject(response, "Vertex Embedding");
  throwProviderError(root, "Vertex Embedding");
  return {
    object: "list",
    data: (readArray(root.predictions) ?? []).map((rawPrediction, index) => ({
      object: "embedding",
      index,
      embedding: readNumberArray(
        asObject(asObject(rawPrediction)?.embeddings)?.values
      ),
    })),
    model: request.model,
    usage: { promptTokens: 0, totalTokens: 0 },
  };
}

export const openAiEmbeddingAdapter: EmbeddingProviderAdapter = {
  id: "openai-embedding",
  buildRequest: buildOpenAiEmbeddingRequest,
  parseResponse: parseOpenAiEmbeddingResponse,
};

export const geminiEmbeddingAdapter: EmbeddingProviderAdapter = {
  id: "gemini-embedding",
  buildRequest: buildGeminiEmbeddingRequest,
  parseResponse: parseGeminiEmbeddingResponse,
};

export const cohereEmbeddingAdapter: EmbeddingProviderAdapter = {
  id: "cohere-embedding",
  buildRequest: buildCohereEmbeddingRequest,
  parseResponse: parseCohereEmbeddingResponse,
};

export const vertexEmbeddingAdapter: EmbeddingProviderAdapter = {
  id: "vertex-embedding",
  buildRequest: buildVertexEmbeddingRequest,
  parseResponse: parseVertexEmbeddingResponse,
};

function jsonRequest(
  url: string,
  headers: Record<string, string>,
  value: Record<string, WireJsonValue>
): WireRequest {
  return {
    method: "POST",
    url,
    headers,
    body: { kind: "json", value },
    streaming: false,
  };
}

function buildEndpointUrl(
  profile: ProviderProfile,
  endpoint: string,
  defaultPath: string
): string {
  const customEndpoint = profile.endpoints?.[endpoint];
  if (customEndpoint?.startsWith("http")) return customEndpoint;
  const host = ensureTrailingSlash(profile.baseUrl);
  if (customEndpoint) return `${host}${customEndpoint.replace(/^\//, "")}`;
  if (/\/v1\/?$/.test(host))
    return `${host}${defaultPath.replace(/^v1\//, "")}`;
  return `${host}${defaultPath}`;
}

async function readJsonObject(
  response: WireResponse,
  label: string
): Promise<JsonObject> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of response.body) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} response is not valid JSON`);
  }
  const root = asObject(value);
  if (!root) throw new Error(`${label} response is not a JSON object`);
  return root;
}

function throwProviderError(root: JsonObject, label: string): void {
  const error = asObject(root.error);
  if (error) {
    throw new Error(
      `${label} Error: ${readString(error.message) ?? JSON.stringify(error)}`
    );
  }
}

function parseEmbeddingData(value: unknown) {
  return (readArray(value) ?? []).map((rawItem, fallbackIndex) => {
    const item = asObject(rawItem);
    return {
      object: "embedding" as const,
      index: readNumber(item?.index) ?? fallbackIndex,
      embedding: readNumberArray(item?.embedding),
    };
  });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function assignDefined(
  target: Record<string, WireJsonValue>,
  key: string,
  value: WireJsonValue | undefined
): void {
  if (value !== undefined) target[key] = value;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function readArray(value: unknown): JsonValue[] | undefined {
  return Array.isArray(value) ? (value as JsonValue[]) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === "number" && Number.isFinite(item)
      )
    : [];
}
