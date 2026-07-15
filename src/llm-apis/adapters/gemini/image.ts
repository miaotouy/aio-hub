// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeSyncMediaRequest,
  geminiImageAdapter,
  type JsonValue,
} from "@aiohub/llm-core";
import type { MediaGenerationOptions, LlmResponse } from "@/llm-apis/common";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmProfile } from "@/types/llm-profiles";
import { toCoreImageRequest } from "../openai/image";
import {
  toGeminiCoreRequest,
  toGeminiProviderProfile,
} from "./chat";

export async function callGeminiImageApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const request = await toCoreImageRequest(options);
  const { responseFormat: _responseFormat, ...geminiOptions } = options;
  request.messages = toGeminiCoreRequest({
    ...geminiOptions,
    stream: false,
  }).messages;
  request.extensions = {
    ...request.extensions,
    ...definedJson({
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
      maxTokens: options.maxTokens,
      stop: options.stop,
      webSearch: (options.tools as Array<{ type: string }> | undefined)?.some(
        (tool) => tool.type === "web_search"
      ),
    }),
  };
  const result = await executeSyncMediaRequest({
    adapter: geminiImageAdapter,
    profile: toGeminiProviderProfile(profile),
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? `gemini-image-${Date.now()}`,
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
  const images = result.assets.map((asset) =>
    asset.kind === "inline-base64"
      ? { b64_json: asset.data, revisedPrompt: asset.revisedPrompt }
      : {
          url: asset.kind === "remote-url" ? asset.url : asset.id,
          revisedPrompt: asset.revisedPrompt,
        }
  );
  return {
    content: result.content,
    images,
    revisedPrompt: images[0]?.revisedPrompt,
  };
}

function definedJson(values: Record<string, unknown>): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      result[key] = value as JsonValue;
    } else if (Array.isArray(value)) {
      result[key] = value.filter(
        (item): item is string | number | boolean | null =>
          item === null || ["string", "number", "boolean"].includes(typeof item)
      );
    }
  }
  return result;
}
