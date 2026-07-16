// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeAsyncMediaTask,
  openAiVideoTaskAdapter,
  type AsyncMediaRequest,
  type JsonValue,
  type ProviderProfile,
} from "@aiohub/llm-core";
import type { LlmResponse, MediaGenerationOptions } from "@/llm-apis/common";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmProfile } from "@/types/llm-profiles";
import { toCoreMediaInput } from "./image";
import { buildOpenAiHeaders } from "./utils";

export async function callOpenAiVideoApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const apiStyle = detectVideoApiStyle(profile, options.modelId);
  const inputs = (
    await Promise.all((options.inputAttachments ?? []).map(toCoreMediaInput))
  ).filter((input): input is NonNullable<typeof input> => input !== undefined);
  const request: AsyncMediaRequest = {
    kind: "video",
    model: options.modelId,
    prompt: options.prompt ?? "",
    inputs,
    parameters: {
      apiStyle,
      size: options.size ?? "1280x720",
      durationSeconds: options.durationSeconds ?? 8,
      ...definedJson({
        aspectRatio: options.aspectRatio,
        resolution: options.resolution,
        seed: options.seed,
        generateAudio: options.generateAudio,
        watermark: options.watermark,
        cameraFixed: options.cameraFixed,
      }),
      providerParameters: buildProviderParameters(profile, options),
    },
  };
  const endpoints: Record<string, string> = {};
  if (profile.customEndpoints?.videos) {
    endpoints.videos = profile.customEndpoints.videos;
    endpoints.arkVideos = profile.customEndpoints.videos;
  }
  if (profile.customEndpoints?.videoStatus) {
    endpoints.videoStatus = profile.customEndpoints.videoStatus;
  }
  const providerProfile: ProviderProfile = {
    provider: profile.type,
    baseUrl: profile.baseUrl || "https://api.openai.com/v1",
    apiKey: profile.apiKeys?.[0],
    headers: buildOpenAiHeaders(profile, options.requestId),
    endpoints,
  };
  const extended = options as unknown as Record<string, unknown>;
  const task = await executeAsyncMediaTask({
    adapter: openAiVideoTaskAdapter,
    profile: providerProfile,
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? `video-${Date.now()}`,
      signal: options.signal,
      timeoutMs: options.timeout,
      network: {
        strategy: options.forceProxy ? "proxy" : options.networkStrategy,
        relaxInvalidCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
      },
    },
    pollIntervalMs:
      typeof extended.pollIntervalMs === "number"
        ? Math.max(0, extended.pollIntervalMs)
        : 5_000,
  });
  if (apiStyle === "ark" && !task.assets?.length) {
    throw new Error(
      `Ark video generation task ${task.id} finished without a video URL in the status response (status: succeeded).`
    );
  }
  const thumbnailUrl = readString(task.metadata?.thumbnailUrl);
  return {
    content: task.assets?.length
      ? "Video generated successfully."
      : "No video generated.",
    videos: (task.assets ?? []).map((asset) =>
      asset.kind === "inline-base64"
        ? {
            id: task.id,
            b64_json: decodeBase64(asset.data),
            status: "completed" as const,
            thumbnailUrl,
          }
        : {
            id: task.id,
            url: asset.kind === "remote-url" ? asset.url : asset.id,
            status: "completed" as const,
            thumbnailUrl,
          }
    ),
    progress: task.progress ?? 100,
  };
}

function buildProviderParameters(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Record<string, JsonValue> {
  const values: Record<string, unknown> = {
    ...(options.params ?? {}),
    ...(options.extraBody ?? {}),
    negative_prompt: options.negativePrompt,
    seed: options.seed,
    aspect_ratio: options.aspectRatio,
    resolution: options.resolution,
    guidance_scale: options.guidanceScale,
    prompt_enhancement: options.promptEnhancement,
    safety_setting: options.safetySetting,
    generate_audio: options.generateAudio,
    watermark: options.watermark,
    camera_fixed: options.cameraFixed,
    movement_amplitude: options.movementAmplitude,
    quality: options.quality,
    style: options.style,
  };
  if (!(profile.baseUrl || "").includes("api.openai.com")) {
    values.duration = options.durationSeconds ?? 8;
    values.ratio = options.aspectRatio;
    values.prompt_optimizer = options.promptEnhancement;
  }
  return definedJson(values);
}

function detectVideoApiStyle(
  profile: LlmProfile,
  modelId: string
): "openai" | "ark" | "agnes" {
  const baseUrl = (profile.baseUrl || "").toLowerCase();
  const model = modelId.toLowerCase();
  if (
    baseUrl.includes("ark.cn-") ||
    baseUrl.includes("volces.com/api/v3") ||
    model.includes("seedance") ||
    model.includes("doubao-seedance")
  ) {
    return "ark";
  }
  if (baseUrl.includes("agnes-ai.com") || model.includes("agnes-video-")) {
    return "agnes";
  }
  return "openai";
}

function definedJson(
  values: Record<string, unknown>
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(values)) {
    const normalized = toJson(value);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

function toJson(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  ) {
    return value as JsonValue;
  }
  if (Array.isArray(value)) {
    const result = value.map(toJson);
    return result.every((item) => item !== undefined)
      ? (result as JsonValue[])
      : undefined;
  }
  if (typeof value === "object" && value !== null) {
    return definedJson(value as Record<string, unknown>);
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
