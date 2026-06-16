import {
  ensureResponseOk,
  fetchWithTimeout,
  type LlmResponse,
} from "@/llm-apis/common";
import type {
  MinimaxClientConfig,
  MinimaxMusicResponse,
  MinimaxLyricsResponse,
  MinimaxMusicOutputFormat,
} from "./types";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";

export const MINIMAX_MUSIC_PATHS = {
  lyricsGeneration: "/v1/lyrics_generation",
  musicGeneration: "/v1/music_generation",
  coverPreprocess: "/v1/music_cover_preprocess",
} as const;

export const MINIMAX_MUSIC_DEFAULTS = {
  timeout: 600_000,
  baseUrl: "https://api.minimaxi.com",
} as const;

export function buildMinimaxMusicUrl(baseUrl: string, path: string): string {
  const cleanBase = (baseUrl || MINIMAX_MUSIC_DEFAULTS.baseUrl).replace(
    /\/+$/,
    ""
  );
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (/\/v1$/i.test(cleanBase) && normalizedPath.startsWith("/v1/")) {
    return `${cleanBase}${normalizedPath.slice(3)}`;
  }

  return `${cleanBase}${normalizedPath}`;
}

export function buildMinimaxMusicHeaders(
  config: MinimaxClientConfig
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  if (config.requestId) {
    headers["X-Request-ID"] = config.requestId;
  }

  Object.assign(headers, resolveCustomHeaders(config.customHeaders));

  return headers;
}

export async function minimaxMusicFetch<T>(
  config: MinimaxClientConfig,
  path: string,
  body: unknown
): Promise<T> {
  const response = await fetchWithTimeout(
    buildMinimaxMusicUrl(config.baseUrl, path),
    {
      method: "POST",
      headers: buildMinimaxMusicHeaders(config),
      body: JSON.stringify(body),
      forceProxy: config.forceProxy,
      relaxIdCerts: config.relaxIdCerts,
      http1Only: config.http1Only,
    },
    config.timeout ?? MINIMAX_MUSIC_DEFAULTS.timeout,
    config.signal
  );

  await ensureResponseOk(response);
  return (await response.json()) as T;
}

export function ensureMinimaxSuccess(
  response: { base_resp?: { status_code?: number; status_msg?: string } },
  fallback: string
): void {
  const statusCode = response.base_resp?.status_code;
  if (statusCode !== undefined && statusCode !== 0) {
    throw new Error(
      `MiniMax Music API error ${statusCode}: ${
        response.base_resp?.status_msg || fallback
      }`
    );
  }
}

export function stripBase64DataUrl(input: string): string {
  const match = input.match(/^data:[^;]+;base64,(.+)$/s);
  return match ? match[1] : input;
}

export function hexToBase64(hex: string): string {
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("MiniMax 返回的 hex 音频格式无效");
  }

  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < clean.length; i += chunkSize * 2) {
    const chunk = clean.slice(i, i + chunkSize * 2);
    const bytes = new Uint8Array(chunk.length / 2);
    for (let j = 0; j < chunk.length; j += 2) {
      bytes[j / 2] = parseInt(chunk.slice(j, j + 2), 16);
    }
    binary += String.fromCharCode(...bytes);
  }

  return btoa(binary);
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function normalizeMinimaxMusicResponse(
  response: MinimaxMusicResponse,
  outputFormat: MinimaxMusicOutputFormat,
  audioFormat: string,
  lyrics?: MinimaxLyricsResponse
): LlmResponse {
  ensureMinimaxSuccess(response, "音乐生成失败");

  const data = response.data;
  const audio = data?.audio_url || data?.audio;
  if (!audio) {
    const status = data?.status;
    throw new Error(
      status === 1
        ? "MiniMax 音乐仍在合成中，接口未返回音频"
        : "MiniMax 音乐生成响应中没有音频"
    );
  }

  const durationMs = response.extra_info?.music_duration;
  const duration =
    typeof durationMs === "number" && Number.isFinite(durationMs)
      ? durationMs / 1000
      : undefined;
  const item =
    outputFormat === "url" || isLikelyUrl(audio)
      ? { url: audio, format: audioFormat, duration }
      : {
          b64_json: hexToBase64(audio),
          format: audioFormat,
          duration,
        };

  const title = lyrics?.song_title;
  const styleTags = lyrics?.style_tags;
  const summaryParts = [
    title ? `标题：${title}` : "",
    styleTags ? `风格：${styleTags}` : "",
  ].filter(Boolean);

  return {
    content: summaryParts.length
      ? `音乐生成完成\n${summaryParts.join("\n")}`
      : "音乐生成完成",
    audios: [item],
    revisedPrompt: lyrics?.lyrics,
    progress: 100,
  };
}

export const minimaxMusicUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string) => {
    if (!baseUrl) return "";
    return endpoint
      ? buildMinimaxMusicUrl(baseUrl, endpoint)
      : buildMinimaxMusicUrl(baseUrl, MINIMAX_MUSIC_PATHS.musicGeneration);
  },
  getHint: () => "MiniMax Music API 地址 (默认 https://api.minimaxi.com)",
};
