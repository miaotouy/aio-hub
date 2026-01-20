import type { LlmProfile } from "@/types/llm-profiles";
import {
  type MediaGenerationOptions,
  type LlmResponse,
} from "@/llm-apis/common";
import { callOpenAiImageApi } from "../openai/image";

/**
 * 调用 xAI (Grok) 的图片生成 API
 * 根据文档，Grok 目前不支持 quality, size, style 参数
 */
export async function callXAiImageApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  // 过滤掉 Grok 不支持的参数，防止 API 报错
  const filteredOptions: MediaGenerationOptions = {
    ...options,
    quality: undefined,
    size: undefined,
    style: undefined,
  };

  // xAI 的图片生成接口完全兼容 OpenAI SDK
  return callOpenAiImageApi(profile, filteredOptions);
}