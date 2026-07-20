export type OllamaPreflightReasonCode =
  | "invalid-base-url"
  | "service-unavailable"
  | "tags-http-error"
  | "invalid-tags-response"
  | "model-not-found"
  | "embedding-capability-missing"
  | "embeddings-http-error"
  | "invalid-embeddings-response";

export interface OllamaPreflightOptions {
  baseUrl: string;
  model: string;
  required?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OllamaPreflightSuccess {
  status: "success";
  baseUrl: string;
  model: string;
  dimension: number;
  probeInputCount: 2;
}

export interface OllamaPreflightUnavailable {
  status: "skip" | "failure";
  baseUrl?: string;
  model: string;
  reason: {
    code: OllamaPreflightReasonCode;
    message: string;
    httpStatus?: number;
  };
}

export type OllamaPreflightResult =
  OllamaPreflightSuccess | OllamaPreflightUnavailable;

const PROBE_INPUTS = [
  "AIO Hub Ollama embedding preflight probe one.",
  "AIO Hub Ollama embedding preflight probe two.",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unavailable(
  options: OllamaPreflightOptions,
  reason: OllamaPreflightUnavailable["reason"],
  baseUrl?: string
): OllamaPreflightUnavailable {
  return {
    status: options.required ? "failure" : "skip",
    ...(baseUrl ? { baseUrl } : {}),
    model: options.model,
    reason,
  };
}

function readBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function findModel(
  tags: unknown,
  modelId: string
): Record<string, unknown> | null {
  if (!isRecord(tags) || !Array.isArray(tags.models)) return null;

  for (const value of tags.models) {
    if (!isRecord(value)) continue;
    if (value.model === modelId || value.name === modelId) return value;
  }
  return null;
}

function hasEmbeddingCapability(model: Record<string, unknown>): boolean {
  return (
    Array.isArray(model.capabilities) &&
    model.capabilities.some((value) => value === "embedding")
  );
}

function readEmbeddingDimension(payload: unknown): number | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  if (payload.data.length !== PROBE_INPUTS.length) return null;

  let dimension: number | null = null;
  for (const item of payload.data) {
    if (!isRecord(item) || !Array.isArray(item.embedding)) return null;
    if (
      item.embedding.length === 0 ||
      !item.embedding.every(
        (value) => typeof value === "number" && Number.isFinite(value)
      )
    ) {
      return null;
    }
    if (dimension === null) dimension = item.embedding.length;
    if (item.embedding.length !== dimension) return null;
  }
  return dimension;
}

export async function preflightOllama(
  options: OllamaPreflightOptions
): Promise<OllamaPreflightResult> {
  const baseUrl = readBaseUrl(options.baseUrl);
  if (!baseUrl) {
    return unavailable(options, {
      code: "invalid-base-url",
      message: "Ollama base URL must be an HTTP(S) origin without credentials.",
    });
  }
  if (!options.model.trim()) {
    return unavailable(
      options,
      {
        code: "model-not-found",
        message: "An Ollama embedding model must be selected.",
      },
      baseUrl
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 90_000;
  let tagsResponse: Response;
  try {
    tagsResponse = await fetchImpl(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return unavailable(
      options,
      {
        code: "service-unavailable",
        message: "Ollama did not respond to the model discovery request.",
      },
      baseUrl
    );
  }
  if (!tagsResponse.ok) {
    return unavailable(
      options,
      {
        code: "tags-http-error",
        message: "Ollama model discovery returned an unsuccessful status.",
        httpStatus: tagsResponse.status,
      },
      baseUrl
    );
  }

  const tags = await readJson(tagsResponse);
  if (!isRecord(tags) || !Array.isArray(tags.models)) {
    return unavailable(
      options,
      {
        code: "invalid-tags-response",
        message: "Ollama model discovery returned an invalid response.",
      },
      baseUrl
    );
  }
  const model = findModel(tags, options.model);
  if (!model) {
    return unavailable(
      options,
      {
        code: "model-not-found",
        message: "The selected Ollama model is not installed.",
      },
      baseUrl
    );
  }
  if (!hasEmbeddingCapability(model)) {
    return unavailable(
      options,
      {
        code: "embedding-capability-missing",
        message:
          "The selected Ollama model does not declare embedding capability.",
      },
      baseUrl
    );
  }

  let embeddingsResponse: Response;
  try {
    embeddingsResponse = await fetchImpl(`${baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: options.model, input: PROBE_INPUTS }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return unavailable(
      options,
      {
        code: "service-unavailable",
        message: "Ollama did not respond to the embedding probe.",
      },
      baseUrl
    );
  }
  if (!embeddingsResponse.ok) {
    return unavailable(
      options,
      {
        code: "embeddings-http-error",
        message:
          "Ollama's OpenAI-compatible embedding endpoint returned an unsuccessful status.",
        httpStatus: embeddingsResponse.status,
      },
      baseUrl
    );
  }

  const dimension = readEmbeddingDimension(await readJson(embeddingsResponse));
  if (dimension === null) {
    return unavailable(
      options,
      {
        code: "invalid-embeddings-response",
        message:
          "Ollama returned invalid, non-finite, or inconsistent embeddings.",
      },
      baseUrl
    );
  }

  return {
    status: "success",
    baseUrl,
    model: options.model,
    dimension,
    probeInputCount: PROBE_INPUTS.length,
  };
}
