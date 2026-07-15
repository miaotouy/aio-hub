// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeSyncMediaRequest,
  openAiImageAdapter,
  type JsonValue,
  type MediaInput,
  type ProviderProfile,
  type SyncMediaRequest,
  type SyncMediaResponse,
} from "@aiohub/llm-core";
import type { MediaGenerationOptions, LlmResponse } from "@/llm-apis/common";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmProfile } from "@/types/llm-profiles";
import { buildOpenAiHeaders } from "./utils";

export async function callOpenAiImageApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const request = await toCoreImageRequest(options);
  const response = await executeSyncMediaRequest({
    adapter: openAiImageAdapter,
    profile: toProviderProfile(profile, options.requestId),
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? createRequestId(),
      signal: options.signal,
      timeoutMs: options.timeout,
      observer: options.transportObserver,
      network: {
        strategy: options.forceProxy ? "proxy" : options.networkStrategy,
        relaxInvalidCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
      },
    },
  });
  return toDesktopImageResponse(response);
}

export async function toCoreImageRequest(
  options: MediaGenerationOptions
): Promise<SyncMediaRequest> {
  const inputs = (
    await Promise.all((options.inputAttachments ?? []).map(toCoreMediaInput))
  ).filter((input): input is MediaInput => input !== undefined);
  const mask = options.mask
    ? await toCoreMediaInput({ type: "mask", b64: options.mask })
    : undefined;
  const ext = options as MediaGenerationOptions & Record<string, unknown>;
  return {
    kind: "image",
    model: options.modelId,
    prompt: options.prompt ?? "",
    inputs,
    mask,
    count: options.n,
    size: options.size,
    quality: options.quality,
    style: options.style,
    responseFormat: resolveResponseFormat(options.responseFormat),
    seed: options.seed,
    negativePrompt: options.negativePrompt,
    guidanceScale: options.guidanceScale,
    inferenceSteps: options.numInferenceSteps,
    aspectRatio: options.aspectRatio,
    extensions: toJsonExtensions({
      user: ext.user,
      background: ext.background,
      inputFidelity: ext.inputFidelity,
      partialImages: ext.partialImages,
      outputCompression: ext.outputCompression,
      moderation: ext.moderation,
      aspect_ratio: ext.aspect_ratio,
      resolution: ext.resolution,
    }),
  };
}

export async function toCoreMediaInput(
  attachment: unknown
): Promise<MediaInput | undefined> {
  if (!attachment) return undefined;
  if (attachment instanceof Blob) {
    return {
      type: "image",
      filename: "reference.png",
      source: {
        kind: "bytes",
        data: new Uint8Array(await attachment.arrayBuffer()),
        contentType: attachment.type || "image/png",
      },
    };
  }
  if (typeof attachment === "string") {
    return fromStringSource("image", attachment);
  }
  if (typeof attachment !== "object") return undefined;
  const value = attachment as Record<string, unknown>;
  const type = normalizeMediaType(value.type);
  if (!type) return undefined;
  const path = readString(value.path);
  const contentType = readString(value.mimeType) ?? defaultContentType(type);
  if (path) {
    return {
      type,
      role: normalizeRole(value.role),
      filename: readString(value.name),
      source: {
        kind: "local-file",
        ref: { kind: "local-file-ref", path, contentType },
      },
    };
  }
  const source = readString(value.b64) ?? readString(value.url);
  const input = source ? fromStringSource(type, source, contentType) : undefined;
  if (!input) return undefined;
  input.role = normalizeRole(value.role);
  input.filename = readString(value.name);
  return input;
}

function fromStringSource(
  type: MediaInput["type"],
  source: string,
  fallbackContentType = defaultContentType(type)
): MediaInput {
  const match = source.match(/^data:([^;,]+);base64,(.*)$/s);
  return {
    type,
    source: match
      ? { kind: "inline-base64", contentType: match[1], data: match[2] }
      : /^https?:\/\//i.test(source)
        ? { kind: "remote-url", url: source }
        : { kind: "inline-base64", contentType: fallbackContentType, data: source },
  };
}

function toProviderProfile(
  profile: LlmProfile,
  requestId?: string
): ProviderProfile {
  return {
    provider: profile.type,
    baseUrl: profile.baseUrl || "https://api.openai.com/v1",
    apiKey: profile.apiKeys?.[0],
    headers: buildOpenAiHeaders(profile, requestId),
    endpoints: profile.customEndpoints as Record<string, string> | undefined,
  };
}

function toDesktopImageResponse(response: SyncMediaResponse): LlmResponse {
  const images = response.assets.map((asset) => {
    if (asset.kind === "remote-url") {
      return { url: asset.url, revisedPrompt: asset.revisedPrompt };
    }
    if (asset.kind === "inline-base64") {
      return { b64_json: asset.data, revisedPrompt: asset.revisedPrompt };
    }
    return { url: asset.id, revisedPrompt: asset.revisedPrompt };
  });
  return {
    content: response.content,
    images,
    revisedPrompt: readString(response.metadata?.revisedPrompt),
    seed: readNumber(response.metadata?.seed),
    timings: asRecord(response.metadata?.timings),
    systemFingerprint: readString(response.metadata?.systemFingerprint),
  };
}

function toJsonExtensions(
  values: Record<string, unknown>
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      result[key] = value as JsonValue;
    }
  }
  return result;
}

function resolveResponseFormat(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeMediaType(value: unknown): MediaInput["type"] | undefined {
  return ["image", "audio", "video", "mask"].includes(String(value))
    ? (value as MediaInput["type"])
    : undefined;
}

function normalizeRole(value: unknown): MediaInput["role"] | undefined {
  return ["reference", "first_frame", "last_frame"].includes(String(value))
    ? (value as MediaInput["role"])
    : undefined;
}

function defaultContentType(type: MediaInput["type"]): string {
  if (type === "audio") return "audio/mpeg";
  if (type === "video") return "video/mp4";
  return "image/png";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function createRequestId(): string {
  return `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
