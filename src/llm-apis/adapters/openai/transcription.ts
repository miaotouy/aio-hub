// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  executeTranscriptionRequest,
  openAiTranscriptionAdapter,
  type MediaInput,
  type ProviderProfile,
} from "@aiohub/llm-core";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type {
  TranscriptionAudioSource,
  TranscriptionRequestOptions,
  TranscriptionResponse,
} from "@/llm-apis/transcription-types";
import type { LlmProfile } from "@/types/llm-profiles";
import { buildOpenAiHeaders } from "./utils";

/**
 * OpenAI 兼容的语音转写 (ASR/STT)
 * 走 /v1/audio/transcriptions (Whisper 风格 multipart)，适用于
 * audio.cpp、whisper.cpp、Groq 等 OpenAI 兼容 STT 服务。
 */
export async function callOpenAiTranscriptionApi(
  profile: LlmProfile,
  options: TranscriptionRequestOptions
): Promise<TranscriptionResponse> {
  const providerProfile: ProviderProfile = {
    provider: profile.type,
    baseUrl: profile.baseUrl || "https://api.openai.com/v1",
    apiKey: profile.apiKeys?.[0],
    headers: buildOpenAiHeaders(profile, options.requestId),
    endpoints: profile.customEndpoints as Record<string, string> | undefined,
  };

  const result = await executeTranscriptionRequest({
    adapter: openAiTranscriptionAdapter,
    profile: providerProfile,
    request: {
      model: options.modelId,
      audio: toMediaInput(options.audio),
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature,
    },
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? `transcribe-${Date.now()}`,
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

  return {
    text: result.text,
    language: result.language,
    duration: result.duration,
    segments: result.segments,
  };
}

function toMediaInput(source: TranscriptionAudioSource): MediaInput {
  switch (source.kind) {
    case "base64":
      return {
        type: "audio",
        source: {
          kind: "inline-base64",
          data: source.data,
          contentType: source.mediaType ?? "audio/mpeg",
        },
        filename: source.filename,
      };
    case "bytes":
      return {
        type: "audio",
        source: {
          kind: "bytes",
          data: source.data,
          contentType: source.mediaType ?? "audio/mpeg",
        },
        filename: source.filename,
      };
    case "local-file":
      return {
        type: "audio",
        source: {
          kind: "local-file",
          ref: {
            kind: "local-file-ref",
            path: source.path,
            contentType: source.mediaType,
          },
        },
        filename: source.filename,
      };
  }
}
