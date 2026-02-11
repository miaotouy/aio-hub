/**
 * Suno 音乐生成适配器
 *
 * 提供 SunoClient 类和相关类型，用于调用 Suno 第三方代理 API 生成音乐。
 * 这是一个独立的端点类别，不绑定到特定的 ProviderType。
 *
 * @example
 * ```typescript
 * import { SunoClient } from "@/llm-apis/adapters/suno";
 *
 * const client = new SunoClient({
 *   baseUrl: "https://proxy.innk.cc",
 *   apiKey: "sk-xxx",
 * });
 *
 * // 自定义模式
 * const result = await client.generateMusic({
 *   prompt: "[Verse]\nWalking down the streets...",
 *   make_instrumental: false,
 *   mv: "chirp-v4",
 *   title: "City Lights",
 *   tags: "emotional punk",
 * });
 *
 * // 灵感模式
 * const result2 = await client.generateMusic({
 *   gpt_description_prompt: "A happy pop song about summer",
 * });
 * ```
 */

export { SunoClient } from "./client";

export type {
  // 模型版本
  SunoModelVersion,
  // 请求类型
  SunoCustomMusicRequest,
  SunoInspirationMusicRequest,
  SunoMusicRequest,
  SunoLyricsRequest,
  SunoConcatRequest,
  SunoTagsRequest,
  SunoVoxRequest,
  // 响应类型
  SunoSubmitResponse,
  SunoFetchResponse,
  SunoTaskData,
  SunoTaskStatus,
  SunoClipInfo,
  SunoClipMetadata,
  SunoTagsResponse,
  SunoVoxResponse,
  // 客户端配置
  SunoClientConfig,
  // 高级结果类型
  SunoMusicResult,
  SunoLyricsResult,
  SunoProgress,
  SunoProgressCallback,
} from "./types";

export { clipsToLlmResponse } from "./utils";