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
});
