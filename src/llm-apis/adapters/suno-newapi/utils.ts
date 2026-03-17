/**
 * Suno 适配器 - 工具函数
 *
 * URL 构建、请求头构建、响应解析等通用工具。
 */

import { fetchWithTimeout, ensureResponseOk, type LlmResponse } from "@/llm-apis/common";
import type { SunoClientConfig, SunoClipInfo } from "./types";

/** Suno API 默认路径 */
export const SUNO_PATHS = {
  submitMusic: "/suno/submit/music",
  submitLyrics: "/suno/submit/lyrics",
  submitConcat: "/suno/submit/concat",
  fetch: "/suno/fetch",
  feed: "/suno/feed",
  actTags: "/suno/act/tags",
  actVox: "/suno/act/vox",
  actMidi: "/suno/act/midi",
  actMp4: "/suno/act/mp4",
  actTiming: "/suno/act/timing",
  actWav: "/suno/act/wav",
  personaCreate: "/suno/persona/create",
} as const;

/** 默认配置值 */
export const SUNO_DEFAULTS = {
  timeout: 300_000, // 5 分钟
  pollInterval: 5_000, // 5 秒
  maxPollAttempts: 120, // 最多轮询 120 次 (10 分钟)
} as const;

/**
 * 构建完整的 API URL
 *
 * @param baseUrl - 渠道的基础地址
 * @param path - API 路径（如 "/suno/submit/music"）
 * @returns 完整的 URL
 */
export function buildSunoUrl(baseUrl: string, path: string): string {
  // 移除 baseUrl 末尾的斜杠
  const base = baseUrl.replace(/\/+$/, "");
  // 确保 path 以斜杠开头
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * 构建 Suno API 请求头
 *
 * @param config - 客户端配置
 * @returns 请求头对象
 */
export function buildSunoHeaders(config: SunoClientConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  if (config.requestId) {
    headers["X-Request-ID"] = config.requestId;
  }

  // 合并自定义请求头
  if (config.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }

  return headers;
}

/**
 * 发送 Suno API 请求
 *
 * 封装了 fetchWithTimeout，统一处理请求头、超时、代理等配置。
 *
 * @param config - 客户端配置
 * @param method - HTTP 方法
 * @param url - 完整的请求 URL
 * @param body - 请求体（仅 POST）
 * @returns 解析后的 JSON 响应
 */
export async function sunoFetch<T>(
  config: SunoClientConfig,
  method: "GET" | "POST",
  url: string,
  body?: unknown
): Promise<T> {
  const headers = buildSunoHeaders(config);
  const timeout = config.timeout ?? SUNO_DEFAULTS.timeout;

  const fetchOptions: RequestInit & {
    forceProxy?: boolean;
    relaxIdCerts?: boolean;
    http1Only?: boolean;
  } = {
    method,
    headers,
    forceProxy: config.forceProxy,
    relaxIdCerts: config.relaxIdCerts,
    http1Only: config.http1Only,
  };

  if (method === "POST" && body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetchWithTimeout(url, fetchOptions, timeout, config.signal);

  await ensureResponseOk(response);

  return (await response.json()) as T;
}

/**
 * 解析进度文本为百分比数字
 *
 * @param progressText - 进度文本，如 "50%", "100%", "processing"
 * @returns 0-100 的百分比数字
 */
export function parseProgressPercentage(progressText: string): number {
  if (!progressText) return 0;

  // 尝试解析 "50%" 格式
  const match = progressText.match(/(\d+)%/);
  if (match) {
    return Math.min(100, Math.max(0, parseInt(match[1], 10)));
  }

  // 特殊状态映射
  const statusMap: Record<string, number> = {
    queued: 5,
    processing: 30,
    streaming: 60,
    complete: 100,
  };

  const lower = progressText.toLowerCase();
  return statusMap[lower] ?? 0;
}

/**
 * 判断任务是否已终结（成功或失败）
 *
 * @param status - 任务状态
 * @returns 是否已终结
 */
export function isTaskTerminal(status: string): boolean {
  const terminalStatuses = ["SUCCESS", "FAILURE"];
  return terminalStatuses.includes(status.toUpperCase());
}

/**
 * 判断任务是否仍在进行中
 *
 * @param status - 任务状态
 * @returns 是否在进行中
 */
export function isTaskPending(status: string): boolean {
  const pendingStatuses = ["SUBMITTED", "QUEUED", "IN_PROGRESS"];
  return pendingStatuses.includes(status.toUpperCase());
}

/**
 * Suno URL 处理逻辑
 */
export const sunoNewApiUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string) => {
    if (!baseUrl) return "";
    const host = baseUrl.endsWith("#")
      ? baseUrl.slice(0, -1)
      : baseUrl.endsWith("/")
        ? baseUrl
        : `${baseUrl}/`;
    return endpoint ? `${host}${endpoint}` : host;
  },
  getHint: () => "Suno API 地址 (如 https://api.suno.ai)",
};

/**
 * 将 SunoClipInfo 列表转换为 LlmResponse 格式
 *
 * 用于 LlmAdapter 桥接层，将 Suno 的结果标准化为系统通用的响应格式。
 *
 * @param clips - 歌曲详情列表
 * @param taskId - 任务 ID
 * @returns 标准化的 LlmResponse
 */
export function clipsToLlmResponse(clips: SunoClipInfo[], _taskId?: string): LlmResponse {
  const titles = clips.map((c) => c.title).filter(Boolean);
  const summary = titles.length > 0 ? `🎵 ${titles.join(" / ")}` : "Music generated successfully.";

  return {
    content: summary,
    audios: clips.map((clip) => ({
      url: clip.audio_url,
      format: "mp3",
      duration: clip.metadata?.duration,
    })),
    videos: clips
      .filter((clip) => clip.video_url)
      .map((clip) => ({
        url: clip.video_url,
        id: clip.id,
        status: "completed" as const,
        thumbnailUrl: clip.image_url,
      })),
    images: clips
      .filter((clip) => clip.image_large_url || clip.image_url)
      .map((clip) => ({
        url: clip.image_large_url || clip.image_url,
      })),
    progress: 100,
  };
}
