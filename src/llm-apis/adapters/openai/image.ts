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
    quality,
    style,
    responseFormat,
    timeout,
    signal,
  } = options;

  const ext = options as any;
  const resolvedResponseFormat = resolveImageResponseFormat(
    responseFormat,
    ext.outputFormat,
    ext.output_format
  );
  const baseUrl = profile.baseUrl || "https://api.openai.com/v1";
  // 根据 2026.04 文档，如果有参考图（inputAttachments）也要走 edits 端点
  const hasReferences =
    options.inputAttachments && options.inputAttachments.length > 0;
  const isAgnesImage = isAgnesImageModel(modelId);
  const isEditMode = !isAgnesImage && (options.mask || hasReferences);
  const endpoint = isEditMode ? "images/edits" : "images/generations";
  const url = openAiUrlHandler.buildUrl(baseUrl, endpoint, profile);

  const headers = buildOpenAiHeaders(profile, options.requestId);

  // 构建请求体
  let body: any;
  let finalHeaders = { ...headers };

  if (isEditMode) {
    // 统一使用 multipart/form-data，无论 native 还是 proxy 模式
    const formData = new FormData();
    formData.append("model", modelId);
    formData.append("prompt", prompt || "");
    formData.append("n", n.toString());
    formData.append("size", size);
    if (quality) formData.append("quality", quality);
    if (ext.moderation) formData.append("moderation", ext.moderation);
    if (ext.background) formData.append("background", ext.background);
    if (ext.partialImages !== undefined)
      formData.append("partial_images", ext.partialImages.toString());
    if (ext.outputCompression !== undefined)
      formData.append("output_compression", ext.outputCompression.toString());

    // 注意：/images/edits 端点不支持 response_format 参数（仅 /images/generations 支持）

    // 参考图（使用 image[] 字段名，兼容 OpenAI 多图接口）
    if (options.inputAttachments && options.inputAttachments.length > 0) {
      for (const attachment of options.inputAttachments) {
        const blob = await attachmentToBlob(attachment);
        if (blob) {
          formData.append("image[]", blob, "reference.png");
        }
      }
    }

    // 蒙版
    if (options.mask) {
      const maskBlob = await attachmentToBlob(options.mask);
      if (maskBlob) {
        formData.append("mask", maskBlob, "mask.png");
      }
    }

    body = formData;
    // 删除 Content-Type 让浏览器自动生成 boundary
    delete (finalHeaders as any)["Content-Type"];
  } else {
    // 构建原始 body 对象
    const rawBody = isAgnesImage
      ? await buildAgnesImageBody(options, resolvedResponseFormat)
      : {
          model: modelId,
          prompt: prompt || "",
          negative_prompt: options.negativePrompt,
          n,
          size,
          quality,
          style,
          // 兼容性修复：如果 responseFormat 是默认的 'url'，则不发送该参数。
          // 某些不完全兼容的代理商（如 CPA）会因为收到未知参数 'response_format' 而报错 400。
          output_format:
            resolvedResponseFormat === "url"
              ? undefined
              : resolvedResponseFormat,
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
          // xAI 参数
          aspect_ratio: ext.aspect_ratio,
          resolution: ext.resolution,
        };

    // 移除所有 undefined/null 值，避免发送 "null" 字符串
    const cleanBody = Object.fromEntries(
      Object.entries(rawBody).filter(([_, v]) => v !== undefined && v !== null)
    );

    body = await asyncJsonStringify(cleanBody);
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: finalHeaders,
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

  // 标准化响应 (兼容 OpenAI 的 data 和硅基流动的 images)
  const rawImages = data.data || data.images || [];
  const images = rawImages.map((item: any) => ({
    url: item.url,
    b64_json: item.b64_json,
    revisedPrompt: item.revised_prompt || item.revisedPrompt,
  }));

  return {
    content:
      images.length > 0
        ? `Generated ${images.length} images.`
        : "No images generated.",
    images,
    revisedPrompt: images[0]?.revisedPrompt,
    seed: data.seed,
    timings: data.timings,
    systemFingerprint: data.system_fingerprint,
  };
}

function isAgnesImageModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("agnes-image-");
}

function resolveImageResponseFormat(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "url";
}

async function buildAgnesImageBody(
  options: MediaGenerationOptions,
  responseFormat: string
): Promise<Record<string, any>> {
  const references = (
    await Promise.all(
      (options.inputAttachments || []).map((attachment) =>
        attachmentToImageReference(attachment)
      )
    )
  ).filter(Boolean);

  const agnesResponseFormat =
    responseFormat === "b64_json" ? "b64_json" : "url";
  const extraBody: Record<string, any> = {};

  if (references.length > 0) {
    extraBody.image = references;
    extraBody.response_format = agnesResponseFormat;
  }

  return {
    model: options.modelId,
    prompt: options.prompt || "",
    size: options.size || "1024x1024",
    return_base64:
      references.length === 0 && agnesResponseFormat === "b64_json"
        ? true
        : undefined,
    extra_body: Object.keys(extraBody).length > 0 ? extraBody : undefined,
  };
}

async function attachmentToImageReference(
  attachment: any
): Promise<string | null> {
  if (!attachment) return null;
  if (typeof attachment === "string") return attachment;
  if (
    attachment.type &&
    attachment.type !== "image" &&
    attachment.type !== "mask"
  ) {
    return null;
  }
  if (attachment.b64) return String(attachment.b64);
  if (attachment.url) return String(attachment.url);
  if (attachment instanceof Blob) return blobToDataUrl(attachment);
  return null;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

/**
 * 将附件转换为 Blob (用于 multipart/form-data)
 */
async function attachmentToBlob(attachment: any): Promise<Blob | null> {
  if (!attachment) return null;

  // 1. 如果已经是 Blob/File
  if (attachment instanceof Blob) return attachment;

  // 2. 优先使用 b64 (Data URL)
  if (attachment.b64) {
    return dataUrlToBlob(attachment.b64);
  }

  // 3. 其次使用 url
  const url = typeof attachment === "string" ? attachment : attachment.url;
  if (!url) return null;

  if (url.startsWith("data:")) {
    return dataUrlToBlob(url);
  }

  if (url.startsWith("http")) {
    const response = await fetch(url);
    return await response.blob();
  }

  // 4. 处理纯 Base64 (不带前缀)
  try {
    const bytes = atob(url);
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      array[i] = bytes.charCodeAt(i);
    }
    return new Blob([array], { type: "image/png" });
  } catch (e) {
    return null;
  }
}

/**
 * 将 Data URL 转换为 Blob (不使用 fetch，避免 CSP 限制)
 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";

    const bytes = atob(base64);
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      array[i] = bytes.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  } catch (e) {
    return null;
  }
}
