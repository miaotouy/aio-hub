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

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaGenerationOptions } from "@/llm-apis/common";
import type { LlmProfile } from "@/types/llm-profiles";
import { callOpenAiVideoApi } from "../video";

vi.mock("@/llm-apis/common", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    ensureResponseOk: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { fetchWithTimeout } from "@/llm-apis/common";

describe("OpenAI Adapter - Video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Ark content generation task endpoints for Seedance models", async () => {
    const profile: LlmProfile = {
      id: "ark",
      name: "Ark",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      apiKeys: ["ark-key"],
      type: "openai",
      enabled: true,
      models: [],
    };
    const options: MediaGenerationOptions & { pollIntervalMs: number } = {
      profileId: "ark",
      modelId: "doubao-seedance-1-0-pro",
      prompt: "a cat running through sunlit grass",
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 5,
      pollIntervalMs: 0,
    };

    (fetchWithTimeout as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "task-1", status: "running" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "task-1",
          status: "succeeded",
          content: { video_url: "https://example.com/video.mp4" },
        }),
      });

    const result = await callOpenAiVideoApi(profile, options);

    const [createUrl, createOptions] = (fetchWithTimeout as any).mock.calls[0];
    const [statusUrl] = (fetchWithTimeout as any).mock.calls[1];
    const createBody = JSON.parse(createOptions.body);

    expect(createUrl).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
    );
    expect(statusUrl).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task-1"
    );
    expect(createBody.model).toBe("doubao-seedance-1-0-pro");
    expect(createBody.content[0].text).toContain("--ratio 16:9");
    expect(createBody.content[0].text).toContain("--resolution 720p");
    expect(createBody.content[0].text).toContain("--duration 5");
    expect(result.videos?.[0]?.url).toBe("https://example.com/video.mp4");
  });

  it("reads nested Ark video URL objects from the task response", async () => {
    const profile: LlmProfile = {
      id: "ark",
      name: "Ark",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      apiKeys: ["ark-key"],
      type: "openai",
      enabled: true,
      models: [],
    };
    const options: MediaGenerationOptions & { pollIntervalMs: number } = {
      profileId: "ark",
      modelId: "doubao-seedance-1-5-pro-251215",
      prompt: "a drone flies through a canyon",
      durationSeconds: 5,
      pollIntervalMs: 0,
    };

    (fetchWithTimeout as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "task-1", status: "running" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "task-1",
          status: "succeeded",
          content: { video_url: { url: "https://example.com/ark-video.mp4" } },
        }),
      });

    const result = await callOpenAiVideoApi(profile, options);

    expect(result.videos?.[0]?.url).toBe("https://example.com/ark-video.mp4");
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("polls Ark tasks when creation only returns an id", async () => {
    const profile: LlmProfile = {
      id: "ark",
      name: "Ark",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      apiKeys: ["ark-key"],
      type: "openai",
      enabled: true,
      models: [],
    };
    const options: MediaGenerationOptions & { pollIntervalMs: number } = {
      profileId: "ark",
      modelId: "doubao-seedance-1-5-pro-251215",
      prompt: "a drone flies through a canyon",
      durationSeconds: 5,
      pollIntervalMs: 0,
    };

    (fetchWithTimeout as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "cgt-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "cgt-1",
          status: "succeeded",
          content: { video_url: "https://example.com/ark-video.mp4" },
        }),
      });

    const result = await callOpenAiVideoApi(profile, options);

    const [statusUrl] = (fetchWithTimeout as any).mock.calls[1];
    expect(statusUrl).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/cgt-1"
    );
    expect(result.videos?.[0]?.url).toBe("https://example.com/ark-video.mp4");
  });

  it("does not fall back to OpenAI content download for Ark tasks without URLs", async () => {
    const profile: LlmProfile = {
      id: "ark",
      name: "Ark",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      apiKeys: ["ark-key"],
      type: "openai",
      enabled: true,
      models: [],
    };
    const options: MediaGenerationOptions & { pollIntervalMs: number } = {
      profileId: "ark",
      modelId: "doubao-seedance-1-5-pro-251215",
      prompt: "a drone flies through a canyon",
      durationSeconds: 5,
      pollIntervalMs: 0,
    };

    (fetchWithTimeout as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "task-1", status: "running" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "task-1", status: "succeeded" }),
      });

    await expect(callOpenAiVideoApi(profile, options)).rejects.toThrow(
      "finished without a video URL"
    );

    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("downloads OpenAI video content with authorization before returning", async () => {
    const profile: LlmProfile = {
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKeys: ["sk-test"],
      type: "openai",
      enabled: true,
      models: [],
    };
    const options: MediaGenerationOptions & { pollIntervalMs: number } = {
      profileId: "openai",
      modelId: "sora-2",
      prompt: "a cinematic street at night",
      pollIntervalMs: 0,
    };
    const bytes = new Uint8Array([1, 2, 3]).buffer;

    (fetchWithTimeout as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "vid-1", status: "queued" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "vid-1", status: "completed" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => bytes,
      });

    const result = await callOpenAiVideoApi(profile, options);

    const [contentUrl, contentOptions] = (fetchWithTimeout as any).mock
      .calls[2];
    expect(contentUrl).toBe("https://api.openai.com/v1/videos/vid-1/content");
    expect(contentOptions.headers.Authorization).toBe("Bearer sk-test");
    expect(result.videos?.[0]?.b64_json).toBe(bytes);
  });

  it("keeps Agnes reference images in extra_body and reads remixed video url", async () => {
    const profile: LlmProfile = {
      id: "agnes",
      name: "Agnes",
      baseUrl: "https://api.agnes-ai.com/v1",
      apiKeys: ["agnes-key"],
      type: "openai",
      enabled: true,
      models: [],
    };
    const options: MediaGenerationOptions & { pollIntervalMs: number } = {
      profileId: "agnes",
      modelId: "agnes-video-v2.0",
      prompt: "animate this cat",
      inputAttachments: [
        {
          type: "image",
          b64: "data:image/png;base64,cmVm",
        },
      ],
      pollIntervalMs: 0,
    };

    (fetchWithTimeout as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "task-2", status: "processing" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "task-2",
          status: "completed",
          remixed_from_video_id: "https://example.com/agnes-video.mp4",
        }),
      });

    const result = await callOpenAiVideoApi(profile, options);

    const [, createOptions] = (fetchWithTimeout as any).mock.calls[0];
    const createBody = JSON.parse(createOptions.body);

    expect(createBody.extra_body).toEqual({
      image: ["data:image/png;base64,cmVm"],
    });
    expect(result.videos?.[0]?.url).toBe("https://example.com/agnes-video.mp4");
  });
});
