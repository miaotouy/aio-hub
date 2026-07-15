import type { JsonValue, WireJsonValue } from "../types/json";
import type { ProviderProfile } from "../types/provider";
import type {
  RerankProviderAdapter,
  RerankRequest,
  RerankResponse,
} from "../types/rerank";
import type { WireRequest, WireResponse } from "../types/transport";
import { readWireResponseJson } from "../utils/wire-response";

type JsonObject = Record<string, JsonValue>;

export const rerankAdapter: RerankProviderAdapter = {
  id: "generic-rerank",
  buildRequest: buildRerankRequest,
  parseResponse: parseRerankResponse,
};

export function buildRerankRequest(
  profile: ProviderProfile,
  request: RerankRequest
): WireRequest {
  const endpoint = resolveRerankEndpoint(profile);
  const value: Record<string, WireJsonValue> = {
    model: request.model,
    query: request.query,
    documents: request.documents,
    top_n: request.topN ?? request.documents.length,
    ...request.extensions,
  };
  return {
    method: "POST",
    url: endpoint,
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    body: { kind: "json", value },
    streaming: false,
  };
}

export async function parseRerankResponse(
  response: WireResponse
): Promise<RerankResponse> {
  const root = asObject(await readWireResponseJson(response));
  if (!root) throw new Error("Rerank response is not a JSON object");
  const providerError = asObject(root.error);
  if (providerError) {
    throw new Error(
      `Rerank Error: ${readString(providerError.message) ?? JSON.stringify(providerError)}`
    );
  }

  const rawResults = readArray(root.results) ?? readArray(root.data) ?? [];
  const results = rawResults.flatMap((value, fallbackIndex) => {
    const item = asObject(value);
    const index = readNumber(item?.index) ?? fallbackIndex;
    const relevanceScore =
      readNumber(item?.relevance_score) ??
      readNumber(item?.relevanceScore) ??
      readNumber(item?.score);
    if (!Number.isInteger(index) || relevanceScore === undefined) return [];
    const document = asObject(item?.document);
    return [
      {
        index,
        relevanceScore,
        document: readString(document?.text) ?? readString(item?.document),
      },
    ];
  });
  return {
    results,
    usage: parseUsage(
      asObject(root.usage) ?? asObject(asObject(root.meta)?.billed_units)
    ),
  };
}

function resolveRerankEndpoint(profile: ProviderProfile): string {
  const custom = profile.endpoints?.rerank;
  if (custom?.startsWith("http")) return custom;
  const host = profile.baseUrl.endsWith("/")
    ? profile.baseUrl
    : `${profile.baseUrl}/`;
  if (custom) return `${host}${custom.replace(/^\//, "")}`;
  if (profile.provider === "cohere") {
    return `${host.replace(/v1\/$/, "")}v2/rerank`;
  }
  return /v1\/$/.test(host) ? `${host}rerank` : `${host}v1/rerank`;
}

function parseUsage(value: JsonObject | undefined) {
  const totalTokens =
    readNumber(value?.total_tokens) ??
    readNumber(value?.search_units) ??
    readNumber(value?.input_tokens);
  return totalTokens === undefined ? undefined : { totalTokens };
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
