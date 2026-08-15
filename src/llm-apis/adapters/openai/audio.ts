// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeSyncMediaRequest,
  openAiAudioAdapter,
  type ProviderProfile,
} from "@aiohub/llm-core";
import type { MediaGenerationOptions, LlmResponse } from "@/llm-apis/common";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmProfile } from "@/types/llm-profiles";
import { buildOpenAiHeaders } from "./utils";

export async function callOpenAiAudioApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const requestedFormat = options.audioConfig?.responseFormat ?? "mp3";
  const extendedOptions = options as unknown as Record<string, unknown>;
  const providerProfile: ProviderProfile = {
    provider: profile.type,
    baseUrl: profile.baseUrl || "https://api.openai.com/v1",
    apiKey: profile.apiKeys?.[0],
    headers: buildOpenAiHeaders(profile, options.requestId),
    endpoints: profile.customEndpoints as Record<string, string> | undefined,
  };
  const result = await executeSyncMediaRequest({
    adapter: openAiAudioAdapter,
    profile: providerProfile,
    request: {
      kind: "audio",
      model: options.modelId,
      prompt: options.prompt ?? "",
      audio: {
        voice: options.audioConfig?.voice,
        format: requestedFormat,
        speed: options.audioConfig?.speed,
        pitch: options.audioConfig?.pitch,
      },
      extensions: {
        ...((typeof extendedOptions.instructions === "string" && {
          instructions: extendedOptions.instructions,
        }) ||
          {}),
      },
    },
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? `audio-${Date.now()}`,
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
  const buffer = result.binary?.slice().buffer as ArrayBuffer | undefined;
  // 以服务端实际返回的格式为准 (audio.cpp 等忽略非 WAV 的 response_format)
  const format =
    (result.metadata?.format as string | undefined) ?? requestedFormat;
  return {
    content: result.content,
    audioData: buffer,
    audios: [{ b64_json: buffer, format }],
  };
}
