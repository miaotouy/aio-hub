import type { LlmProfile } from "@/types/llm-profiles";
import {
  type MediaGenerationOptions,
  type LlmResponse,
  fetchWithTimeout,
  ensureResponseOk,
} from "@/llm-apis/common";
import { buildOpenAiHeaders, openAiUrlHandler } from "../openai/utils";

/**
 * 调用硅基流动 (SiliconFlow) 的图片生成 API
 */
export async function callSiliconFlowImageApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const {
    modelId,
    prompt,
    negativePrompt,
    size,
    seed,
    n = 1,
    guidanceScale,
    numInferenceSteps,
    timeout,
    signal,
  } = options;

  const baseUrl = profile.baseUrl || "https://api.siliconflow.cn/v1";
  const url = openAiUrlHandler.buildUrl(baseUrl, "images/generations", profile);
  const headers = buildOpenAiHeaders(profile);

  // 构建硅基流动特有的请求体
  const body: any = {
    model: modelId,
    prompt: prompt || "",
    negative_prompt: negativePrompt,
    image_size: size,
    batch_size: n,
    seed: seed,
    num_inference_steps: numInferenceSteps,
    guidance_scale: guidanceScale,
  };

  // 处理 Qwen 系列特有的 cfg 参数
  if ((options as any).cfg !== undefined) {
    body.cfg = (options as any).cfg;
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    timeout,
    signal
  );

  await ensureResponseOk(response);
  const data = await response.json();

  // 硅基流动的响应结构可能是 { images: [{ url: "..." }] }
  const rawImages = data.images || data.data || [];
  const images = rawImages.map((item: any) => ({
    url: item.url,
    b64_json: item.b64_json,
  }));

  return {
    content: images.length > 0 ? `Generated ${images.length} images.` : "No images generated.",
    images,
    seed: data.seed,
    timings: data.timings,
  };
}