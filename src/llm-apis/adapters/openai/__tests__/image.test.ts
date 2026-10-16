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
import { callOpenAiImageApi } from "../image";
import { resolveModelExecution } from "@aiohub/llm-core";

vi.mock("@/llm-apis/common", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    ensureResponseOk: vi.fn(),
  };
});

vi.mock("@/utils/serialization", () => ({
  asyncJsonStringify: vi.fn(async (obj) => JSON.stringify(obj)),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { fetchWithTimeout } from "@/llm-apis/common";

describe("OpenAI Adapter - Image", () => {
  const mockProfile: LlmProfile = {
    id: "test-profile",
    name: "Test Profile",
    baseUrl: "https://api.agnes-ai.com/v1",
    apiKeys: ["test-key"],
    type: "openai-compatible",
    enabled: true,
    models: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: "https://example.com/generated.png" }],
      }),
    });
  });

  it("uses Agnes JSON generation body without unsupported OpenAI image params", async () => {
    const options: MediaGenerationOptions = {
      profileId: "test-profile",
      modelId: "agnes-image-2.1-flash",
      prompt: "a quiet tea room",
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
      n: 1,
      seed: 123,
      numInferenceSteps: 20,
    };

    await callOpenAiImageApi(mockProfile, options);

    const [url, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(url).toContain("images/generations");
    expect(body).toMatchObject({
      model: "agnes-image-2.1-flash",
      prompt: "a quiet tea room",
      size: "1024x1024",
    });
    expect(body).not.toHaveProperty("style");
    expect(body).not.toHaveProperty("quality");
    expect(body).not.toHaveProperty("n");
    expect(body).not.toHaveProperty("seed");
    expect(body).not.toHaveProperty("num_inference_steps");
  });

  it("keeps Agnes reference images on the JSON generations endpoint", async () => {
    const options: MediaGenerationOptions = {
      profileId: "test-profile",
      modelId: "agnes-image-2.1-flash",
      prompt: "turn this into a watercolor poster",
      size: "1024x1024",
      responseFormat: "b64_json",
      inputAttachments: [
        {
          type: "image",
          b64: "data:image/png;base64,cmVmMQ==",
        },
      ],
    };

    await callOpenAiImageApi(mockProfile, options);

    const [url, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(url).toContain("images/generations");
    expect(url).not.toContain("images/edits");
    expect(fetchOptions.body).not.toBeInstanceOf(FormData);
    expect(body.extra_body).toEqual({
      image: ["data:image/png;base64,cmVmMQ=="],
      response_format: "b64_json",
    });
  });

  it("routes OpenRouter image generation to JSON images and exposes the real image format", async () => {
    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: "AQID", media_type: "image/webp" }],
      }),
    });
    const result = await callOpenAiImageApi(
      {
        ...mockProfile,
        type: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
      },
      {
        profileId: "test-profile",
        modelId: "google/image-model",
        prompt: "a tea room",
        responseFormat: "webp",
        inputAttachments: [
          { type: "image", url: "https://cdn.example.com/ref.png" },
        ],
      }
    );
    const [url, options] = (fetchWithTimeout as any).mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/images");
    expect(JSON.parse(options.body)).toEqual({
      model: "google/image-model",
      prompt: "a tea room",
      output_format: "webp",
      stream: false,
      input_references: [
        {
          type: "image_url",
          image_url: { url: "https://cdn.example.com/ref.png" },
        },
      ],
    });
    expect(result.images?.[0]).toMatchObject({
      b64_json: "AQID",
      mimeType: "image/webp",
    });
  });
  it("keeps SiliconFlow image parameters after aggregate routing", async () => {
    const execution = resolveModelExecution({
      profile: {
        ...mockProfile,
        type: "siliconflow" as const,
        baseUrl: "https://silicon-gateway.example/v1",
      },
      model: { id: "image-model" },
      operation: "image",
    });
    await callOpenAiImageApi(execution.effectiveProfile, {
      profileId: mockProfile.id,
      modelId: "image-model",
      prompt: "fixture",
      size: "1024x1024",
      numInferenceSteps: 20,
      guidanceScale: 7,
    });
    const [url, init] = (fetchWithTimeout as any).mock.calls[0];
    expect(url).toBe("https://silicon-gateway.example/v1/images/generations");
    expect(JSON.parse(init.body)).toMatchObject({
      image_size: "1024x1024",
      num_inference_steps: 20,
      guidance_scale: 7,
    });
  });

  it("keeps OpenRouter image transport on custom domains after aggregate routing", async () => {
    (fetchWithTimeout as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: "AQID", media_type: "image/png" }],
      }),
    });
    const execution = resolveModelExecution({
      profile: {
        ...mockProfile,
        type: "openrouter" as const,
        baseUrl: "https://or-gateway.example/v1",
      },
      model: { id: "image-model" },
      operation: "image",
    });
    const response = await callOpenAiImageApi(execution.effectiveProfile, {
      profileId: mockProfile.id,
      modelId: "image-model",
      prompt: "fixture",
    });
    const [url, init] = (fetchWithTimeout as any).mock.calls[0];
    expect(url).toBe("https://or-gateway.example/v1/images");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "image-model",
      prompt: "fixture",
    });
    expect(response.images?.[0].b64_json).toBe("AQID");
  });
});
