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

import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmResponse, MediaGenerationOptions } from "@/llm-apis/common";
import {
  executeAsyncMediaTask,
  minimaxMusicTaskAdapter,
  type JsonValue,
  type ProviderProfile,
} from "@aiohub/llm-core";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";
import type { LlmAdapter } from "../index";
import { MinimaxMusicClient } from "./client";
import type {
  MinimaxLyricsResponse,
  MinimaxMusicModel,
  MinimaxMusicOutputFormat,
  MinimaxMusicRequest,
} from "./types";
import { MINIMAX_MUSIC_DEFAULTS, stripBase64DataUrl } from "./utils";

type MinimaxMusicMode = "song" | "instrumental" | "cover";
type LyricsSource = "optimizer" | "manual" | "generate";
type CoverReferenceMode = "audio" | "feature";

export const minimaxMusicAdapter: LlmAdapter = {
  async chat() {
    return {
      content: "MiniMax Music 仅支持音乐和歌词生成，请在媒体工具中使用。",
    };
  },

  async audio(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse> {
    const params = {
      ...(options as Record<string, any>),
      ...(options.params || {}),
    };
    const client = new MinimaxMusicClient({
      baseUrl: profile.baseUrl || MINIMAX_MUSIC_DEFAULTS.baseUrl,
      apiKey: profile.apiKeys?.[0] || "",
      signal: options.signal,
      timeout: options.timeout,
      requestId: options.requestId,
      customHeaders: profile.customHeaders,
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    });

    const model = normalizeModel(options.modelId, params);
    const mode = resolveMode(model, params);
    const outputFormat = normalizeOutputFormat(params.output_format);
    const audioFormat = normalizeAudioFormat(params.audio_setting?.format);

    let generatedLyrics: MinimaxLyricsResponse | undefined;
    let lyrics = normalizeString(params.lyrics);
    const lyricsSource = resolveLyricsSource(params);

    if (mode !== "instrumental" && lyricsSource === "generate") {
      generatedLyrics = await client.generateLyrics({
        mode: lyrics ? "edit" : "write_full_song",
        prompt:
          normalizeString(params.lyrics_generation_prompt) ||
          options.prompt ||
          "",
        lyrics,
        title: normalizeString(params.title),
      });
      lyrics = normalizeString(generatedLyrics.lyrics) || lyrics;
    }

    const request = buildMusicRequest({
      model,
      mode,
      prompt: options.prompt || "",
      lyrics,
      outputFormat,
      params,
    });

    const providerProfile: ProviderProfile = {
      provider: "minimax-music",
      baseUrl: profile.baseUrl || MINIMAX_MUSIC_DEFAULTS.baseUrl,
      apiKey: profile.apiKeys?.[0],
      headers: resolveCustomHeaders(profile.customHeaders),
    };
    const task = await executeAsyncMediaTask({
      adapter: minimaxMusicTaskAdapter,
      profile: providerProfile,
      request: {
        kind: "music",
        model,
        prompt: options.prompt || "",
        parameters: {
          outputFormat,
          audioFormat,
          body: toJsonValue(request) as Record<string, JsonValue>,
        },
      },
      transport: desktopLlmTransport,
      transportOptions: {
        requestId: options.requestId ?? `minimax-music-${Date.now()}`,
        signal: options.signal,
        timeoutMs: options.timeout,
        network: {
          strategy: options.forceProxy ? "proxy" : options.networkStrategy,
          relaxInvalidCerts: options.relaxIdCerts,
          http1Only: options.http1Only,
        },
      },
    });
    if (!task.assets?.length) {
      throw new Error("MiniMax 音乐生成响应中没有音频");
    }
    const duration =
      typeof task.metadata?.duration === "number"
        ? task.metadata.duration
        : undefined;
    const title = generatedLyrics?.song_title;
    const styleTags = generatedLyrics?.style_tags;
    const summary = [
      title ? `标题：${title}` : "",
      styleTags ? `风格：${styleTags}` : "",
    ].filter(Boolean);
    return {
      content: summary.length
        ? `音乐生成完成\n${summary.join("\n")}`
        : "音乐生成完成",
      audios: task.assets.map((asset) =>
        asset.kind === "inline-base64"
          ? { b64_json: asset.data, format: audioFormat, duration }
          : {
              url: asset.kind === "remote-url" ? asset.url : asset.id,
              format: audioFormat,
              duration,
            }
      ),
      revisedPrompt: generatedLyrics?.lyrics,
      progress: task.progress ?? 100,
    };
  },
};

function normalizeModel(
  modelId: string,
  params: Record<string, any>
): MinimaxMusicModel {
  const model = (params.model || modelId || "music-2.6") as MinimaxMusicModel;
  if (
    model === "music-2.6" ||
    model === "music-cover" ||
    model === "music-2.6-free" ||
    model === "music-cover-free"
  ) {
    return model;
  }
  return "music-2.6";
}

export function resolveMode(
  model: MinimaxMusicModel,
  params: Record<string, any>
): MinimaxMusicMode {
  if (model.startsWith("music-cover")) return "cover";
  if (params.minimax_music_mode === "instrumental") return "instrumental";
  if (params.minimax_music_mode === "song") return "song";
  if (params.is_instrumental) return "instrumental";
  return "song";
}

function resolveLyricsSource(params: Record<string, any>): LyricsSource {
  if (params.lyrics_source) return params.lyrics_source as LyricsSource;
  if (params.lyrics_generation_enabled) return "generate";
  if (normalizeString(params.lyrics)) return "manual";
  return "optimizer";
}

function normalizeOutputFormat(value: unknown): MinimaxMusicOutputFormat {
  return value === "url" ? "url" : "hex";
}

function normalizeAudioFormat(value: unknown): string {
  return value === "wav" || value === "pcm" ? value : "mp3";
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  ) {
    return value as JsonValue;
  }
  if (Array.isArray(value)) {
    const result = value.map(toJsonValue);
    return result.every((item) => item !== undefined)
      ? (result as JsonValue[])
      : undefined;
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = toJsonValue(item);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return undefined;
}

export function buildMusicRequest(input: {
  model: MinimaxMusicModel;
  mode: MinimaxMusicMode;
  prompt: string;
  lyrics?: string;
  outputFormat: MinimaxMusicOutputFormat;
  params: Record<string, any>;
}): MinimaxMusicRequest {
  const { model, mode, prompt, lyrics, outputFormat, params } = input;
  const request: MinimaxMusicRequest = {
    model,
    prompt,
    output_format: outputFormat,
    stream: false,
    audio_setting: {
      sample_rate: Number(params.audio_setting?.sample_rate || 44100) as any,
      bitrate: Number(params.audio_setting?.bitrate || 256000) as any,
      format: normalizeAudioFormat(params.audio_setting?.format) as any,
    },
  };

  if (params.aigc_watermark !== undefined) {
    request.aigc_watermark = !!params.aigc_watermark;
  }

  if (mode === "instrumental") {
    request.is_instrumental = true;
    delete request.lyrics;
    delete request.lyrics_optimizer;
    return request;
  }

  if (mode === "cover" || model.startsWith("music-cover")) {
    request.model = model.startsWith("music-cover") ? model : "music-cover";
    request.prompt = prompt;
    if (lyrics) request.lyrics = lyrics;
    applyCoverReference(request, params);
    return request;
  }

  if (lyrics) {
    request.lyrics = lyrics;
  } else {
    request.lyrics_optimizer = params.lyrics_optimizer !== false;
  }

  return request;
}

function applyCoverReference(
  request: MinimaxMusicRequest,
  params: Record<string, any>
): void {
  const coverReferenceMode = normalizeCoverReferenceMode(
    params.cover_reference_mode
  );
  const audioUrl = normalizeString(params.audio_url);
  const audioBase64 = normalizeString(params.audio_base64);
  const coverFeatureId = normalizeString(params.cover_feature_id);

  if (coverReferenceMode === "feature") {
    if (!coverFeatureId) {
      throw new Error("两步翻唱模式下，必须先预处理参考音频以获取特征 ID");
    }
    if (!request.lyrics) {
      throw new Error("使用 cover_feature_id 翻唱时必须提供歌词");
    }
    request.cover_feature_id = coverFeatureId;
    return;
  }

  const provided = [audioUrl, audioBase64, coverFeatureId].filter(Boolean);

  if (provided.length > 1) {
    throw new Error(
      "MiniMax 翻唱参数 audio_url、audio_base64、cover_feature_id 只能提供一个"
    );
  }

  if (audioUrl) {
    request.audio_url = audioUrl;
  } else if (audioBase64) {
    request.audio_base64 = stripBase64DataUrl(audioBase64);
  } else if (coverFeatureId) {
    request.cover_feature_id = coverFeatureId;
    if (!request.lyrics) {
      throw new Error("使用 cover_feature_id 翻唱时必须提供歌词");
    }
  } else {
    throw new Error("MiniMax 翻唱需要填写参考音频 URL 或添加一个音频附件");
  }
}

function normalizeCoverReferenceMode(value: unknown): CoverReferenceMode {
  return value === "feature" ? "feature" : "audio";
}
