// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeAsyncMediaTask,
  geminiVideoTaskAdapter,
  type AsyncMediaRequest,
  type JsonValue,
} from "@aiohub/llm-core";
import type { LlmResponse, MediaGenerationOptions } from "@/llm-apis/common";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmProfile } from "@/types/llm-profiles";
import { toGeminiProviderProfile } from "./chat";

export async function callGeminiVideoApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const request: AsyncMediaRequest = {
    kind: "video",
    model: options.modelId,
    prompt: options.prompt ?? "",
    parameters: {
      aspectRatio: options.aspectRatio ?? "16:9",
      resolution: options.resolution ?? "720p",
      durationSeconds: options.durationSeconds ?? 8,
      ...definedJson({
        negativePrompt: options.negativePrompt,
        seed: options.seed === -1 ? undefined : options.seed,
        promptEnhancement: options.promptEnhancement,
        safetySetting: options.safetySetting,
      }),
      providerParameters: definedJson({
        ...(options.params ?? {}),
        ...(options.extraBody ?? {}),
      }),
    },
  };
  const extended = options as unknown as Record<string, unknown>;
  const task = await executeAsyncMediaTask({
    adapter: geminiVideoTaskAdapter,
    profile: toGeminiProviderProfile(profile),
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? `gemini-video-${Date.now()}`,
      signal: options.signal,
      timeoutMs: options.timeout,
      network: {
        strategy: options.forceProxy ? "proxy" : options.networkStrategy,
        relaxInvalidCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
      },
    },
    pollIntervalMs:
      typeof extended.pollIntervalMs === "number"
        ? Math.max(0, extended.pollIntervalMs)
        : 10_000,
  });
  return {
    content: task.assets?.length
      ? "Video generated successfully."
      : "No video generated.",
    videos: (task.assets ?? []).map((asset) => ({
      url:
        asset.kind === "remote-url"
          ? asset.url
          : asset.kind === "local-asset"
            ? asset.id
            : undefined,
      b64_json: asset.kind === "inline-base64" ? asset.data : undefined,
      status: "completed" as const,
    })),
    progress: task.progress ?? 100,
  };
}

function definedJson(
  values: Record<string, unknown>
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (
      value === null ||
      ["string", "number", "boolean"].includes(typeof value)
    ) {
      result[key] = value as JsonValue;
    }
  }
  return result;
}
