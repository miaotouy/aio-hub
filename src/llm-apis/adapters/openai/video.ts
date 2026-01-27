import type { LlmProfile } from "@/types/llm-profiles";
import {
  type MediaGenerationOptions,
  type LlmResponse,
  fetchWithTimeout,
  ensureResponseOk,
} from "@/llm-apis/common";
import { openAiUrlHandler, buildOpenAiHeaders } from "./utils";

/**
 * 调用 OpenAI 兼容的视频生成 (Sora) API
 * 这是一个异步过程，适配器内部会进行轮询直到完成
 */
export async function callOpenAiVideoApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const {
    modelId,
    prompt,
    size = "1280x720",
    durationSeconds = 8,
    timeout,
    signal,
  } = options;

  const baseUrl = profile.baseUrl || "https://api.openai.com/v1";
  const headers = buildOpenAiHeaders(profile);
  
  // 1. 发起生成请求
  const createUrl = openAiUrlHandler.buildUrl(baseUrl, "videos", profile);
  const createResponse = await fetchWithTimeout(
    createUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        prompt: prompt || "",
        size,
        seconds: durationSeconds.toString(),
      }),
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    timeout,
    signal
  );

  await ensureResponseOk(createResponse);
  let job = await createResponse.json();
  const jobId = job.id;

  // 2. 轮询状态
  const pollInterval = 5000; // 5秒轮询一次
  const statusUrl = openAiUrlHandler.buildUrl(baseUrl, `videos/${jobId}`, profile);

  while (job.status === "queued" || job.status === "in_progress") {
    // 检查是否已取消
    if (signal?.aborted) {
      throw new Error("Video generation cancelled by user.");
    }

    // 等待
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const pollResponse = await fetchWithTimeout(
      statusUrl,
      {
        method: "GET",
        headers,
        forceProxy: options.forceProxy,
        relaxIdCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
      },
      timeout,
      signal
    );

    await ensureResponseOk(pollResponse);
    job = await pollResponse.json();

    // 如果 UI 需要进度，可以通过某种方式上报，但目前 LlmResponse 主要是最终结果
    // TODO: 如果未来需要流式进度，可以考虑在 options 中增加进度回调
  }

  if (job.status === "failed") {
    throw new Error(`Video generation failed: ${job.error?.message || "Unknown error"}`);
  }

  // 3. 获取内容 (视频 URL)
  // 注意：OpenAI /videos/{id}/content 返回的是二进制流
  // 但通常我们希望得到一个可以播放的 URL。在桌面端，我们可以下载到本地并返回 appdata:// 路径
  // 或者直接返回 content 接口的 URL，让前端去加载（需要带上 Auth Header，这比较麻烦）
  
  // 按照 Sora API 文档，completed 状态的任务可能已经包含了某些信息
  // 这里我们返回任务信息，并尝试构建一个内容下载链接
  const contentUrl = openAiUrlHandler.buildUrl(baseUrl, `videos/${jobId}/content`, profile);

  return {
    content: "Video generated successfully.",
    videos: [
      {
        id: jobId,
        url: contentUrl, // 前端需要处理带 Auth 的请求或由后端代理
        status: "completed",
      }
    ],
    progress: 100
  };
}