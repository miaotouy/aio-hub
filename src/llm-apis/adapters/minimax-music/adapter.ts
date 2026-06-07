import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmResponse, MediaGenerationOptions } from "@/llm-apis/common";
import type { LlmAdapter } from "../index";
import { MinimaxMusicClient } from "./client";
import type {
  MinimaxLyricsResponse,
  MinimaxMusicModel,
  MinimaxMusicOutputFormat,
  MinimaxMusicRequest,
} from "./types";
import {
  MINIMAX_MUSIC_DEFAULTS,
  normalizeMinimaxMusicResponse,
  stripBase64DataUrl,
} from "./utils";

type MinimaxMusicMode = "song" | "instrumental" | "cover";
type LyricsSource = "optimizer" | "manual" | "generate";

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

    const response = await client.generateMusic(request);
    return normalizeMinimaxMusicResponse(
      response,
      outputFormat,
      audioFormat,
      generatedLyrics
    );
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

function resolveMode(
  model: MinimaxMusicModel,
  params: Record<string, any>
): MinimaxMusicMode {
  if (params.minimax_music_mode) {
    return params.minimax_music_mode as MinimaxMusicMode;
  }
  if (model.startsWith("music-cover")) return "cover";
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

function buildMusicRequest(input: {
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
  const audioUrl = normalizeString(params.audio_url);
  const audioBase64 = normalizeString(params.audio_base64);
  const coverFeatureId = normalizeString(params.cover_feature_id);
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
