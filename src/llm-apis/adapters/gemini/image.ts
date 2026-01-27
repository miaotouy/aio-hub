import type { LlmProfile } from "@/types/llm-profiles";
import {
  type MediaGenerationOptions,
  type LlmResponse,
  fetchWithTimeout,
  ensureResponseOk,
} from "@/llm-apis/common";
import { buildGeminiUrl, buildGeminiHeaders, buildGeminiContents } from "./utils";
import { parseGeminiResponse } from "./chat";

/**
 * 调用 Gemini 图片生成 API (基于 generateContent)
 * 对应文档中的 "谷歌香蕉" (Gemini 2.5 Flash Image / Gemini 3 Pro Image)
 */
export async function callGeminiImageApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const {
    modelId,
    messages,
    prompt,
    size, // 映射到 imageSize: "1K", "2K", "4K"
    aspectRatio,
    timeout,
    signal,
  } = options;

  // 如果提供了 prompt，包装为 messages
  const effectiveMessages = messages || (prompt ? [{ role: 'user', content: prompt }] : []);

  const baseUrl = profile.baseUrl || "https://generativelanguage.googleapis.com";
  const url = buildGeminiUrl(baseUrl, modelId, "generateContent", profile);
  const headers = buildGeminiHeaders(profile);

  // 构建 Gemini 特有的图片配置
  const imageConfig: any = {};
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  
  // 映射 resolution/size 到 imageSize (要求大写 K)
  if (size) {
    const upperSize = size.toUpperCase();
    if (["1K", "2K", "4K"].includes(upperSize)) {
      imageConfig.imageSize = upperSize;
    } else {
      imageConfig.imageSize = upperSize;
    }
  }

  const body = JSON.stringify({
    contents: buildGeminiContents(effectiveMessages),
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: Object.keys(imageConfig).length > 0 ? imageConfig : undefined,
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
      maxOutputTokens: options.maxTokens,
      stopSequences: options.stop,
    },
    // 支持 Google Search 增强
    tools: (options.tools as any)?.some((t: any) => t.type === 'web_search') ? [{ google_search: {} }] : undefined,
  });

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body,
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    timeout,
    signal
  );

  await ensureResponseOk(response);
  const data = await response.json();

  return parseGeminiResponse(data);
}