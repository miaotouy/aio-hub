import type { LlmProfile } from "@/types/llm-profiles";
import {
  type MediaGenerationOptions,
  type LlmResponse,
  fetchWithTimeout,
  ensureResponseOk,
} from "@/llm-apis/common";
import { buildOpenAiHeaders, openAiUrlHandler } from "../openai/utils";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("siliconflow/image");

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
  };

  if (negativePrompt) body.negative_prompt = negativePrompt;
  // 硅基流动 seed 必须是正整数，-1 代表随机，但最好直接不传让服务端处理
  if (seed !== undefined && seed !== null && seed !== -1) body.seed = seed;
  if (numInferenceSteps !== undefined && numInferenceSteps !== null) body.num_inference_steps = numInferenceSteps;
  if (guidanceScale !== undefined && guidanceScale !== null) body.guidance_scale = guidanceScale;

  // 根据文档，Qwen-Image-Edit 系列不支持 image_size 字段
  const isQwenEdit = modelId.includes("Qwen-Image-Edit");
  if (size && !isQwenEdit) {
    body.image_size = size;
  }

  // batch_size 仅适用于 Kolors 模型
  if (modelId.includes("Kolors")) {
    body.batch_size = n;
  }

  // 处理 Qwen 系列特有的 cfg 参数
  if ((options as any).cfg !== undefined) {
    body.cfg = (options as any).cfg;
  }

  // 处理图片输入 (用于以图生图或图片编辑)
  if (options.inputAttachments && options.inputAttachments.length > 0) {
    const images = options.inputAttachments.filter((a) => a.type === "image");
    if (images.length > 0) {
      // Qwen-Image-Edit-2509 支持 image, image2, image3
      if (images[0].b64 || images[0].url) {
        body.image = images[0].b64 || images[0].url;
      }
      if (images[1] && (images[1].b64 || images[1].url)) {
        body.image2 = images[1].b64 || images[1].url;
      }
      if (images[2] && (images[2].b64 || images[2].url)) {
        body.image3 = images[2].b64 || images[2].url;
      }
    }
  }

  logger.info("发送 SiliconFlow 图片生成请求", { url, body: { ...body, image: body.image ? "(image data)" : undefined } });

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