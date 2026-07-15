import {
  AnthropicMessagesStreamDecoder,
  buildAnthropicMessagesBody,
  parseAnthropicMessagesResponse,
} from "./anthropic-messages";
import type { JsonValue, WireJsonValue } from "../types/json";
import type { ProviderAdapter, ProviderProfile } from "../types/provider";
import type { LlmRequest } from "../types/request";
import type { WireRequest } from "../types/transport";

export function buildVertexAnthropicRequest(
  profile: ProviderProfile,
  request: LlmRequest
): WireRequest {
  const body: Record<string, WireJsonValue> = {
    ...buildAnthropicMessagesBody(request),
    anthropic_version:
      readString(profile.options?.anthropicVersion) ?? "vertex-2023-10-16",
  };
  delete body.model;

  return {
    method: "POST",
    url: buildVertexAnthropicUrl(profile, request),
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey
        ? { Authorization: `Bearer ${profile.apiKey}` }
        : {}),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    body: { kind: "json", value: body },
    streaming: request.stream === true,
  };
}

export function buildVertexAnthropicUrl(
  profile: ProviderProfile,
  request: LlmRequest
): string {
  const customEndpoint = profile.endpoints?.chatCompletions;
  if (customEndpoint) {
    const endpoint = customEndpoint.split("{model}").join(request.model);
    return endpoint.startsWith("http")
      ? endpoint
      : `${ensureTrailingSlash(profile.baseUrl)}${endpoint.replace(/^\//, "")}`;
  }

  const host = ensureTrailingSlash(profile.baseUrl);
  const versionedHost = /\/v1(?:\/|$)/.test(host) ? host : `${host}v1/`;
  const projectId = readString(profile.options?.projectId);
  const location = readString(profile.options?.location) ?? "us-central1";
  const hasResourcePrefix = /\/projects\/[^/]+\/locations\/[^/]+\/?$/.test(
    versionedHost
  );
  const resourcePrefix = !hasResourcePrefix && projectId
    ? `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/`
    : "";
  const action = request.stream ? "streamRawPredict" : "rawPredict";
  return `${versionedHost}${resourcePrefix}publishers/anthropic/models/${encodeURIComponent(request.model)}:${action}`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export const vertexAnthropicAdapter: ProviderAdapter = {
  id: "vertex-anthropic",
  buildRequest: buildVertexAnthropicRequest,
  parseResponse: parseAnthropicMessagesResponse,
  createStreamDecoder: () => new AnthropicMessagesStreamDecoder(),
};
