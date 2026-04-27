import type { LlmProfile } from "@/types/llm-profiles";
import { type MediaGenerationOptions, type LlmResponse, fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { asyncJsonStringify } from "@/utils/serialization";
import { openAiUrlHandler, buildOpenAiHeaders } from "./utils";

/**
 * 调用 OpenAI 兼容的图片生成 API
 */
export async function callOpenAiImageApi(profile: LlmProfile, options: MediaGenerationOptions): Promise<LlmResponse> {
  const {
    modelId,
    prompt,
    n = 1,
    size = "1024x1024",
    quality = "standard",
    style,
    responseFormat = "url",
    timeout,
    signal,
  } = options;

  const ext = options as any;
  const baseUrl = profile.baseUrl || "https://api.openai.com/v1";
  // 根据 2026.04 文档，如果有参考图（inputAttachments）也要走 edits 端点
  const hasReferences = options.inputAttachments && options.inputAttachments.length > 0;
  const isEditMode = options.mask || hasReferences;
  const endpoint = isEditMode ? "images/edits" : "images/generations";
  const url = openAiUrlHandler.buildUrl(baseUrl, endpoint, profile);

  const headers = buildOpenAiHeaders(profile, options.requestId);

  // 构建请求体
  let body: any;
  let finalHeaders = { ...headers };

  if (isEditMode) {
    // 根据网络策略选择请求格式
    const isNativeMode = options.networkStrategy === "native";

    if (isNativeMode) {
      // 浏览器直连模式：使用 multipart/form-data
      const formData = new FormData();
      formData.append("model", modelId);
      formData.append("prompt", prompt || "");
      formData.append("n", n.toString());
      formData.append("size", size);
      formData.append("quality", quality);
      if (ext.moderation) formData.append("moderation", ext.moderation);
      if (ext.background) formData.append("background", ext.background);
      if (ext.partialImages !== undefined) formData.append("partial_images", ext.partialImages.toString());
      if (ext.outputCompression !== undefined) formData.append("output_compression", ext.outputCompression.toString());

      formData.append(
        "response_format",
        typeof responseFormat === "string" ? responseFormat : JSON.stringify(responseFormat),
      );

      // 处理参考图数组 (image[])
      if (options.inputAttachments && options.inputAttachments.length > 0) {
        for (const attachment of options.inputAttachments) {
          const blob = await attachmentToBlob(attachment);
          if (blob) {
            formData.append("image[]", blob, "reference.png");
          }
        }
      }

      // 处理蒙版
      if (options.mask) {
        const maskBlob = await attachmentToBlob(options.mask);
        if (maskBlob) {
          formData.append("mask", maskBlob, "mask.png");
        }
      }

      body = formData;
      // 删除 Content-Type 让浏览器自动设置 boundary
      delete (finalHeaders as any)["Content-Type"];
    } else {
      // 代理模式：使用 JSON + base64
      const editBody: any = {
        model: modelId,
        prompt: prompt || "",
        n,
        size,
        quality,
        response_format: typeof responseFormat === "string" ? responseFormat : responseFormat,
      };

      if (ext.moderation) editBody.moderation = ext.moderation;
      if (ext.background) editBody.background = ext.background;
      if (ext.partialImages !== undefined) editBody.partial_images = ext.partialImages;
      if (ext.outputCompression !== undefined) editBody.output_compression = ext.outputCompression;

      // 处理参考图数组 (转为 base64)
      if (options.inputAttachments && options.inputAttachments.length > 0) {
        const imageArray: string[] = [];
        for (const attachment of options.inputAttachments) {
          const base64 = await attachmentToBase64(attachment);
          if (base64) {
            imageArray.push(base64);
          }
        }
        if (imageArray.length > 0) {
          editBody.image = imageArray;
        }
      }

      // 处理蒙版 (转为 base64)
      if (options.mask) {
        const maskBase64 = await attachmentToBase64(options.mask);
        if (maskBase64) {
          editBody.mask = maskBase64;
        }
      }

      // 移除 undefined 值
      const cleanEditBody = Object.fromEntries(
        Object.entries(editBody).filter(([_, v]) => v !== undefined && v !== null),
      );
      body = await asyncJsonStringify(cleanEditBody);
    }
  } else {
    // 构建原始 body 对象
    const rawBody = {
      model: modelId,
      prompt: prompt || "",
      negative_prompt: options.negativePrompt,
      n,
      size,
      quality,
      style,
      // 兼容性修复：如果 responseFormat 是默认的 'url'，则不发送该参数。
      // 某些不完全兼容的代理商（如 CPA）会因为收到未知参数 'response_format' 而报错 400。
      output_format: responseFormat === "url" ? undefined : responseFormat,
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
    const cleanBody = Object.fromEntries(Object.entries(rawBody).filter(([_, v]) => v !== undefined && v !== null));

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
    signal,
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

/**
 * 将附件转换为 Blob (用于 native 模式的 multipart/form-data)
 */
async function attachmentToBlob(attachment: any): Promise<Blob | null> {
  if (!attachment) return null;

  // 1. 如果已经是 Blob/File
  if (attachment instanceof Blob) return attachment;

  // 2. 如果是 Data URL，直接 fetch 转 Blob
  const url = typeof attachment === "string" ? attachment : attachment.url;
  if (!url) return null;

  if (url.startsWith("data:")) {
    const response = await fetch(url);
    return await response.blob();
  }

  // 3. 如果是本地路径 (appdata://, file://, /)
  if (url.startsWith("appdata://") || url.startsWith("file://") || url.startsWith("/")) {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const response = await fetch(convertFileSrc(url));
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
 * 将附件转换为 Base64 Data URL (用于 proxy 模式的 JSON body)
 */
async function attachmentToBase64(attachment: any): Promise<string | null> {
  if (!attachment) return null;

  // 1. 如果已经是 Data URL
  const url = typeof attachment === "string" ? attachment : attachment.url;
  if (!url) return null;

  if (url.startsWith("data:")) {
    return url;
  }

  // 2. 如果是 Blob/File，转为 Data URL
  if (attachment instanceof Blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(attachment);
    });
  }

  // 3. 如果是本地路径 (appdata://, file://, /)
  if (url.startsWith("appdata://") || url.startsWith("file://") || url.startsWith("/")) {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const response = await fetch(convertFileSrc(url));
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  // 4. 处理纯 Base64 (不带前缀)，补全为 Data URL
  try {
    // 验证是否为有效 base64
    atob(url);
    return `data:image/png;base64,${url}`;
  } catch (e) {
    return null;
  }
}
