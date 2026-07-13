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
import { buildGeminiHeaders } from "./utils";

/**
 * 调用 Google Gemini Veo 视频生成 API
 * 这是一个异步过程，适配器内部会进行轮询直到完成
 */
export async function callGeminiVideoApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const {
    modelId,
    prompt,
    aspectRatio = "16:9",
    resolution = "720p",
    durationSeconds = 8,
    timeout,
    signal,
  } = options;

  const parameters: Record<string, any> = {
    ...(options.params || {}),
    ...(options.extraBody || {}),
    aspectRatio,
    resolution,
    durationSeconds,
  };

  if (options.negativePrompt)
    parameters.negativePrompt = options.negativePrompt;
  if (options.seed !== undefined && options.seed !== -1) {
    parameters.seed = options.seed;
  }
  if (options.promptEnhancement !== undefined) {
    parameters.promptEnhancement = options.promptEnhancement;
  }
  if (options.safetySetting) parameters.safetySetting = options.safetySetting;

  const baseUrl =
    profile.baseUrl || "https://generativelanguage.googleapis.com";
  const apiVersion = "v1beta";
  const apiKey = profile.apiKeys?.[0] || "";

  // 1. 发起生成请求 (Long Running Operation)
  const predictUrl = `${baseUrl}/${apiVersion}/models/${modelId}:predictLongRunning?key=${apiKey}`;
  const headers = buildGeminiHeaders(profile, options.requestId);

  const createResponse = await fetchWithTimeout(
    predictUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        instances: [
          {
            prompt: prompt || "",
          },
        ],
        parameters,
      }),
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    timeout,
    signal
  );

  await ensureResponseOk(createResponse);
  let operation = await createResponse.json();
  const operationName = operation.name;

  // 2. 轮询状态
  const pollInterval = 10000; // Veo 生成较慢，建议10秒轮询
  const getOperationUrl = `${baseUrl}/${apiVersion}/${operationName}?key=${apiKey}`;

  while (!operation.done) {
    if (signal?.aborted) {
      throw new Error("Video generation cancelled by user.");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const pollResponse = await fetchWithTimeout(
      getOperationUrl,
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
    operation = await pollResponse.json();
  }

  if (operation.error) {
    throw new Error(
      `Video generation failed: ${operation.error.message || "Unknown error"}`
    );
  }

  // 3. 解析结果
  const generatedSamples =
    operation.response?.generateVideoResponse?.generatedSamples || [];
  const videos = generatedSamples.map((sample: any) => ({
    url: sample.video?.uri,
    status: "completed",
  }));

  return {
    content:
      videos.length > 0
        ? "Video generated successfully."
        : "No video generated.",
    videos: videos,
    progress: 100,
  };
}
