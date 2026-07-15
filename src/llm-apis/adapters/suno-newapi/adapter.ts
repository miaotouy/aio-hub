// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeAsyncMediaTask,
  sunoMusicTaskAdapter,
  type JsonValue,
  type ProviderProfile,
} from "@aiohub/llm-core";
import type { LlmResponse, MediaGenerationOptions } from "@/llm-apis/common";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmProfile } from "@/types/llm-profiles";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";
import type { LlmAdapter } from "../index";
import type { SunoClipInfo, SunoModelVersion } from "./types";
import { clipsToLlmResponse } from "./utils";

export const sunoNewApiAdapter: LlmAdapter = {
  async chat() {
    return { content: "Suno 仅支持音乐生成，请在媒体工具中使用。" };
  },
  async audio(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse> {
    const params = options.params ?? {};
    const mode = params.suno_mode || "simple";
    const mv = (params.mv || "chirp-v4") as SunoModelVersion;
    const makeInstrumental = Boolean(params.make_instrumental);
    const body: Record<string, JsonValue> =
      mode === "custom"
        ? definedJson({
            prompt: options.prompt || "",
            tags: params.tags || "",
            title: params.title || "",
            make_instrumental: makeInstrumental,
            mv,
            continue_at: params.continue_at,
            continue_clip_id: params.continue_clip_id,
          })
        : definedJson({
            gpt_description_prompt: options.prompt || "",
            make_instrumental: makeInstrumental,
            mv,
          });
    const providerProfile: ProviderProfile = {
      provider: "suno-newapi",
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKeys?.[0],
      headers: resolveCustomHeaders(profile.customHeaders),
    };
    const extended = options as unknown as Record<string, unknown>;
    const task = await executeAsyncMediaTask({
      adapter: sunoMusicTaskAdapter,
      profile: providerProfile,
      request: {
        kind: "music",
        model: mv,
        prompt: options.prompt ?? "",
        parameters: { body },
      },
      transport: desktopLlmTransport,
      transportOptions: {
        requestId: options.requestId ?? `suno-${Date.now()}`,
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
      maxPollAttempts:
        typeof extended.maxPollAttempts === "number"
          ? extended.maxPollAttempts
          : 120,
    });
    const clips = Array.isArray(task.metadata?.clips)
      ? (task.metadata.clips as unknown as SunoClipInfo[])
      : [];
    if (clips.length > 0) return clipsToLlmResponse(clips, task.id);
    return {
      content: "Music generated successfully.",
      audios: (task.assets ?? []).map((asset) => ({
        url: asset.kind === "remote-url" ? asset.url : undefined,
        b64_json: asset.kind === "inline-base64" ? asset.data : undefined,
        format: "mp3",
      })),
      progress: task.progress ?? 100,
    };
  },
};

function definedJson(values: Record<string, unknown>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, JsonValue] =>
        entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1])
    )
  );
}
