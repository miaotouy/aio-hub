import type { LlmProfile } from "@/types/llm-profiles";
import {
  type MediaGenerationOptions,
  type LlmResponse,
  fetchWithTimeout,
  ensureResponseOk,
} from "@/llm-apis/common";
import { asyncJsonStringify } from "@/utils/serialization";
import { openAiUrlHandler, buildOpenAiHeaders } from "./utils";

/**
 * 调用 OpenAI 兼容的语音合成 (TTS) API
 */
export async function callOpenAiAudioApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const {
    modelId,
    prompt,
    audioConfig,
    timeout,
    signal,
  } = options;

  const baseUrl = profile.baseUrl || "https://api.openai.com/v1";
  const url = openAiUrlHandler.buildUrl(baseUrl, "audio/speech", profile);

  const headers = buildOpenAiHeaders(profile);

  const body = {
    model: modelId,
    input: prompt || "",
    voice: audioConfig?.voice || "alloy",
    response_format: audioConfig?.responseFormat || "mp3",
    speed: audioConfig?.speed || 1.0,
    // 新增特性支持
    instructions: (options as any).instructions,
  };

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: await asyncJsonStringify(body),
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    timeout,
    signal
  );

  await ensureResponseOk(response);

  // TTS 返回的是二进制音频流
  const arrayBuffer = await response.arrayBuffer();
  return {
    content: "Audio generated successfully.",
    audioData: arrayBuffer,
    audios: [
      {
        b64_json: arrayBuffer,
        format: audioConfig?.responseFormat || "mp3",
      }
    ]
  };
}