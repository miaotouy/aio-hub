// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
  const headers = buildOpenAiHeaders(profile, options.requestId);
  const isArkVideo = isArkVideoApi(profile, modelId);
  const isAgnesVideo = isAgnesVideoApi(profile, modelId);
  const extraBody: Record<string, any> = {
    ...(options.params || {}),
    ...(options.extraBody || {}),
  };

  const maybeSet = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") {
      extraBody[key] = value;
    }
  };

  maybeSet("negative_prompt", options.negativePrompt);
  maybeSet("seed", options.seed);
  maybeSet("aspect_ratio", options.aspectRatio);
  maybeSet("resolution", options.resolution);
  maybeSet("guidance_scale", options.guidanceScale);
  maybeSet("prompt_enhancement", options.promptEnhancement);
  maybeSet("safety_setting", options.safetySetting);
  maybeSet("generate_audio", options.generateAudio);
  maybeSet("watermark", options.watermark);
  maybeSet("camera_fixed", options.cameraFixed);
  maybeSet("movement_amplitude", options.movementAmplitude);
  maybeSet("quality", options.quality);
  maybeSet("style", options.style);

  const isOfficialOpenAi = baseUrl.includes("api.openai.com");
  if (!isOfficialOpenAi) {
    maybeSet("duration", durationSeconds);
    maybeSet("ratio", options.aspectRatio);
    maybeSet("prompt_optimizer", options.promptEnhancement);
  }

  // 1. 发起生成请求
  const createUrl = buildVideoCreateUrl(baseUrl, profile, isArkVideo);
  const createBody = isArkVideo
    ? buildArkVideoCreateBody(options, prompt || "", durationSeconds)
    : buildOpenAiVideoCreateBody(
        options,
        prompt || "",
        size,
        durationSeconds,
        extraBody,
        isAgnesVideo
      );
  const createResponse = await fetchWithTimeout(
    createUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(createBody),
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    timeout,
    signal
  );

  await ensureResponseOk(createResponse);
  let job = await createResponse.json();
  const jobId = getVideoJobId(job);
  if (!jobId) {
    throw new Error("Video generation did not return a task id.");
  }

  // 2. 轮询状态
  const pollInterval =
    typeof (options as any).pollIntervalMs === "number"
      ? Math.max(0, (options as any).pollIntervalMs)
      : 5000; // 5秒轮询一次
  const statusUrl = buildVideoStatusUrl(baseUrl, profile, jobId, isArkVideo);

  while (shouldPollVideoJob(job, isArkVideo)) {
    // 检查是否已取消
    if (signal?.aborted) {
      throw new Error("Video generation cancelled by user.");
    }

    // 等待
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

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

  if (isVideoJobFailed(job)) {
    throw new Error(
      `Video generation failed: ${getVideoJobError(job) || "Unknown error"}`
    );
  }

  const directVideoUrl = extractVideoUrl(job);
  if (directVideoUrl) {
    return {
      content: "Video generated successfully.",
      videos: [
        {
          id: jobId,
          url: directVideoUrl,
          status: "completed",
          thumbnailUrl: extractThumbnailUrl(job),
        },
      ],
      progress: 100,
    };
  }

  if (isArkVideo) {
    const status = getVideoJobStatus(job) || "unknown";
    throw new Error(
      `Ark video generation task ${jobId} finished without a video URL in the status response (status: ${status}).`
    );
  }

  // 3. 获取内容 (视频 URL)
  // 注意：OpenAI /videos/{id}/content 返回的是二进制流
  // 这里直接带鉴权下载二进制内容，避免后续资产入库阶段裸 URL 请求丢失 Authorization。
  const contentUrl = openAiUrlHandler.buildUrl(
    baseUrl,
    `videos/${jobId}/content`,
    profile
  );
  const videoBytes = await fetchVideoContent(contentUrl, headers, options);

  return {
    content: "Video generated successfully.",
    videos: [
      {
        id: jobId,
        b64_json: videoBytes,
        status: "completed",
      },
    ],
    progress: 100,
  };
}

function buildVideoCreateUrl(
  baseUrl: string,
  profile: LlmProfile,
  isArkVideo: boolean
): string {
  if (isArkVideo && !profile.customEndpoints?.videos) {
    return openAiUrlHandler.buildUrl(
      baseUrl,
      "contents/generations/tasks",
      profile
    );
  }
  return openAiUrlHandler.buildUrl(baseUrl, "videos", profile);
}

function buildVideoStatusUrl(
  baseUrl: string,
  profile: LlmProfile,
  jobId: string,
  isArkVideo: boolean
): string {
  if (profile.customEndpoints?.videoStatus) {
    return openAiUrlHandler.buildUrl(baseUrl, "videoStatus", profile, {
      video_id: jobId,
    });
  }

  if (isArkVideo) {
    return openAiUrlHandler.buildUrl(
      baseUrl,
      `contents/generations/tasks/${jobId}`,
      profile
    );
  }

  return openAiUrlHandler.buildUrl(baseUrl, `videos/${jobId}`, profile);
}

function isArkVideoApi(profile: LlmProfile, modelId: string): boolean {
  const baseUrl = (profile.baseUrl || "").toLowerCase();
  const model = modelId.toLowerCase();
  return (
    baseUrl.includes("ark.cn-") ||
    baseUrl.includes("volces.com/api/v3") ||
    model.includes("seedance") ||
    model.includes("doubao-seedance")
  );
}

function isAgnesVideoApi(profile: LlmProfile, modelId: string): boolean {
  const baseUrl = (profile.baseUrl || "").toLowerCase();
  const model = modelId.toLowerCase();
  return baseUrl.includes("agnes-ai.com") || model.includes("agnes-video-");
}

function buildOpenAiVideoCreateBody(
  options: MediaGenerationOptions,
  prompt: string,
  size: string,
  durationSeconds: number,
  extraBody: Record<string, any>,
  isAgnesVideo: boolean
): Record<string, any> {
  const body: Record<string, any> = {
    model: options.modelId,
    prompt,
    size,
    seconds: durationSeconds.toString(),
    ...extraBody,
  };

  if (isAgnesVideo) {
    const references = collectAttachmentUrls(options);
    if (references.length > 0) {
      body.extra_body = {
        ...(typeof body.extra_body === "object" && body.extra_body
          ? body.extra_body
          : {}),
        image: references,
      };
    }
  }

  return body;
}

function buildArkVideoCreateBody(
  options: MediaGenerationOptions,
  prompt: string,
  durationSeconds: number
): Record<string, any> {
  const content: any[] = [
    {
      type: "text",
      text: buildArkPromptText(options, prompt, durationSeconds),
    },
  ];

  for (const attachment of options.inputAttachments || []) {
    if (attachment.type !== "image" && attachment.type !== "mask") continue;
    const url = attachment.b64 || attachment.url;
    if (!url) continue;
    content.push({
      type: "image_url",
      image_url: { url },
    });
  }

  return {
    model: options.modelId,
    content,
  };
}

function buildArkPromptText(
  options: MediaGenerationOptions,
  prompt: string,
  durationSeconds: number
): string {
  const ext = options as any;
  const flags: string[] = [];
  const ratio = options.aspectRatio || ext.ratio;
  const resolution = options.resolution;

  if (ratio) flags.push(`--ratio ${ratio}`);
  if (resolution) flags.push(`--resolution ${resolution}`);
  if (durationSeconds) flags.push(`--duration ${durationSeconds}`);
  if (options.seed !== undefined && options.seed !== -1) {
    flags.push(`--seed ${options.seed}`);
  }
  if (options.generateAudio !== undefined) {
    flags.push(`--audio ${options.generateAudio ? "true" : "false"}`);
  }
  if (options.watermark !== undefined) {
    flags.push(`--watermark ${options.watermark ? "true" : "false"}`);
  }
  if (options.cameraFixed !== undefined) {
    flags.push(`--camerafixed ${options.cameraFixed ? "true" : "false"}`);
  }

  return [prompt.trim(), ...flags].filter(Boolean).join(" ");
}

function getVideoJobId(job: any): string | undefined {
  return String(
    job?.id ||
      job?.task_id ||
      job?.taskId ||
      job?.video_id ||
      job?.videoId ||
      job?.data?.id ||
      job?.data?.task_id ||
      job?.data?.taskId ||
      job?.data?.video_id ||
      job?.data?.videoId ||
      ""
  ).trim();
}

function getVideoJobStatus(job: any): string {
  return String(job?.status || job?.data?.status || "").toLowerCase();
}

function isVideoJobPending(job: any): boolean {
  return [
    "queued",
    "in_progress",
    "processing",
    "pending",
    "running",
    "created",
  ].includes(getVideoJobStatus(job));
}

function shouldPollVideoJob(job: any, isArkVideo: boolean): boolean {
  if (isVideoJobFailed(job) || extractVideoUrl(job)) {
    return false;
  }

  if (isVideoJobPending(job)) {
    return true;
  }

  // Ark creation can return only { id } first; the status and content arrive
  // from the task query endpoint.
  return isArkVideo && !getVideoJobStatus(job);
}

function isVideoJobFailed(job: any): boolean {
  return ["failed", "cancelled", "canceled", "expired", "error"].includes(
    getVideoJobStatus(job)
  );
}

function getVideoJobError(job: any): string | undefined {
  const error = job?.error || job?.data?.error;
  return error?.message || error?.msg || error?.code || String(error || "");
}

function extractVideoUrl(job: any): string | undefined {
  const candidates = [
    job?.content?.video_url,
    job?.content?.video_url?.url,
    job?.content?.videoUrl,
    job?.content?.videoUrl?.url,
    job?.video_url,
    job?.video_url?.url,
    job?.videoUrl,
    job?.videoUrl?.url,
    job?.remixed_from_video_id,
    job?.remixedFromVideoId,
    job?.url,
    job?.output?.video_url,
    job?.output?.video_url?.url,
    job?.output?.videoUrl,
    job?.output?.videoUrl?.url,
    job?.result?.video_url,
    job?.result?.video_url?.url,
    job?.result?.videoUrl,
    job?.result?.videoUrl?.url,
    job?.data?.content?.video_url,
    job?.data?.content?.video_url?.url,
    job?.data?.content?.videoUrl,
    job?.data?.content?.videoUrl?.url,
    job?.data?.video_url,
    job?.data?.video_url?.url,
    job?.data?.videoUrl,
    job?.data?.videoUrl?.url,
    job?.data?.remixed_from_video_id,
    job?.data?.remixedFromVideoId,
    job?.data?.url,
    job?.videos?.[0]?.url,
    job?.data?.videos?.[0]?.url,
  ];
  return findFirstUrl(candidates);
}

function collectAttachmentUrls(options: MediaGenerationOptions): string[] {
  return (options.inputAttachments || [])
    .filter(
      (attachment) => attachment.type === "image" || attachment.type === "mask"
    )
    .map((attachment) => attachment.url || attachment.b64)
    .filter((url): url is string => typeof url === "string" && !!url.trim());
}

function extractThumbnailUrl(job: any): string | undefined {
  const candidates = [
    job?.content?.image_url,
    job?.content?.image_url?.url,
    job?.content?.imageUrl,
    job?.content?.imageUrl?.url,
    job?.thumbnail_url,
    job?.thumbnail_url?.url,
    job?.thumbnailUrl,
    job?.thumbnailUrl?.url,
    job?.data?.content?.image_url,
    job?.data?.content?.image_url?.url,
    job?.data?.content?.imageUrl,
    job?.data?.content?.imageUrl?.url,
  ];
  return findFirstUrl(candidates);
}

function findFirstUrl(candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
    if (candidate && typeof candidate === "object") {
      const url = (candidate as { url?: unknown }).url;
      if (typeof url === "string" && url.trim()) {
        return url;
      }
    }
  }
  return undefined;
}

async function fetchVideoContent(
  url: string,
  headers: Record<string, string>,
  options: MediaGenerationOptions
): Promise<ArrayBuffer> {
  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers,
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    options.timeout,
    options.signal
  );
  await ensureResponseOk(response);
  return await response.arrayBuffer();
}
