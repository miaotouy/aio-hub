import type { LlmProfile } from "@/types/llm-profiles";
import {
  type MediaGenerationOptions,
  type LlmResponse,
  fetchWithTimeout,
  ensureResponseOk,
} from "@/llm-apis/common";
import { openAiUrlHandler, buildOpenAiHeaders } from "./utils";

/**
 * 调用 OpenAI 兼容的图片生成 API
 */
export async function callOpenAiImageApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const {
    modelId,
    prompt,
    n = 1,
    size = "1024x1024",
    quality = "standard",
    style = "vivid",
    responseFormat = "url",
    timeout,
    signal,
  } = options;

  const ext = options as any;
  const baseUrl = profile.baseUrl || "https://api.openai.com/v1";
  const endpoint = options.mask ? "images/edits" : "images/generations";
  const url = openAiUrlHandler.buildUrl(baseUrl, endpoint, profile);

  const headers = buildOpenAiHeaders(profile);
  
  // 构建请求体
  let body: any;
  let finalHeaders = { ...headers };

  if (options.mask) {
    // 图片编辑/重绘需要使用 Multipart 格式
    // 注意：Tauri fetch 对 FormData 的支持可能需要特殊处理，
    // 这里先按标准 FormData 处理，如果环境有限制再调整
    const formData = new FormData();
    formData.append("model", modelId);
    formData.append("prompt", prompt || "");
    formData.append("n", n.toString());
    formData.append("size", size);
    formData.append("response_format", typeof responseFormat === 'string' ? responseFormat : JSON.stringify(responseFormat));
    
    // 处理图片和蒙版 (假设 options.mask 和 options.inputAttachments 已经处理为 Blob/File)
    // 实际业务中可能需要先将 Base64 转换为 Blob
    // TODO: 实现 Base64 到 Blob 的转换逻辑，如果输入是字符串的话
    
    body = formData;
    // 删除 Content-Type 让浏览器/插件自动设置 boundary
    delete (finalHeaders as any)["Content-Type"];
  } else {
    body = JSON.stringify({
      model: modelId,
      prompt: prompt || "",
      negative_prompt: options.negativePrompt,
      n,
      size,
      quality,
      style,
      response_format: responseFormat,
      seed: options.seed,
      guidance_scale: options.guidanceScale,
      num_inference_steps: options.numInferenceSteps,
      user: options.user,
      // 新增特性支持
      background: ext.background,
      input_fidelity: ext.inputFidelity,
      partial_images: ext.partialImages,
      output_compression: ext.outputCompression,
      moderation: ext.moderation,
    });
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: finalHeaders,
      body,
    },
    timeout,
    signal
  );

  await ensureResponseOk(response);
  const data = await response.json();

  // 标准化响应 (兼容 OpenAI 的 data 和硅基流动的 images)
  const rawImages = data.data || data.images || [];
  const images = rawImages.map((item: any) => ({
    url: item.url,
    b64_json: item.b64_json,
    revisedPrompt: item.revised_prompt || item.revisedPrompt,
  }));

  return {
    content: images.length > 0 ? `Generated ${images.length} images.` : "No images generated.",
    images,
    revisedPrompt: images[0]?.revisedPrompt,
    seed: data.seed,
    timings: data.timings,
    systemFingerprint: data.system_fingerprint,
  };
}