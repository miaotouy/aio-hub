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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { callGeminiChatApi } from "../chat";
import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions } from "@/llm-apis/common";

// Mock common functions
vi.mock("@/llm-apis/common", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    ensureResponseOk: vi.fn(),
  };
});

// Mock serialization to avoid Worker error
vi.mock("@/utils/serialization", () => ({
  asyncJsonStringify: vi.fn(async (obj) => JSON.stringify(obj)),
}));

// Mock Tauri core to avoid invoke error in logger
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { fetchWithTimeout } from "@/llm-apis/common";

describe("Gemini Adapter - Chat", () => {
  const mockProfile: LlmProfile = {
    id: "test-profile-gemini",
    name: "Gemini Profile",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKeys: ["gemini-test-key"],
    type: "gemini",
    enabled: true,
    models: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should correctly build a request with system instruction", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-gemini",
      modelId: "gemini-1.5-pro",
      messages: [
        { role: "system", content: "Instruction." },
        { role: "user", content: "Hello." },
      ],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: "Hi there!" }], role: "model" },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 3,
          totalTokenCount: 8,
        },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const result = await callGeminiChatApi(mockProfile, options);

    const [url, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(url).toContain("key=gemini-test-key");
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "Instruction." }],
    });
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0].text).toBe("Hello.");

    expect(result.content).toBe("Hi there!");
    expect(result.usage?.totalTokens).toBe(8);
  });

  it("should handle multimodal content (images)", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-gemini",
      modelId: "gemini-1.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            { type: "image", imageBase64: "img_data" },
          ],
        },
      ],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "It's an image." }] } }],
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callGeminiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[0].text).toBe("What is this?");
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: "image/png",
      data: "img_data",
    });
  });

  it("should handle assistant role mapping to model", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-gemini",
      modelId: "gemini-1.5-pro",
      messages: [
        { role: "user", content: "A" },
        { role: "assistant", content: "B" },
        { role: "user", content: "C" },
      ],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "D" }] } }],
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callGeminiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.contents).toHaveLength(3);
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[1].role).toBe("model");
    expect(body.contents[2].role).toBe("user");
  });

  it("should handle thinking configuration", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-gemini",
      modelId: "gemini-2.0-flash-thinking-exp",
      messages: [{ role: "user", content: "Think." }],
      thinkingEnabled: true,
      thinkingBudget: 1024,
    } as any;

    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Result." }] } }],
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callGeminiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.generationConfig.thinkingConfig).toBeDefined();
    expect(body.generationConfig.thinkingConfig.includeThoughts).toBe(true);
    // Note: thinkingBudget is only added for non-gemini-3 models or specific conditions in buildGeminiGenerationConfig
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(1024);
  });

  it("should parse reasoning content (thoughts) from response", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-gemini",
      modelId: "gemini-2.0-flash-thinking",
      messages: [{ role: "user", content: "Explain." }],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: "Thinking process...", thought: true },
                { text: "Final answer." },
              ],
            },
          },
        ],
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const result = await callGeminiChatApi(mockProfile, options);

    expect(result.content).toBe("Final answer.");
    expect(result.reasoningContent).toBe("Thinking process...");
  });

  it("should preserve Gemini thought signature parts as replay artifacts", async () => {
    const signedParts = [
      { text: "Thinking process...", thought: true },
      { text: "Final answer.", thoughtSignature: "sig-a" },
    ];
    const options: LlmRequestOptions = {
      profileId: "test-profile-gemini",
      modelId: "gemini-3.5-flash",
      messages: [{ role: "user", content: "Explain." }],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: signedParts } }],
      }),
    });

    const result = await callGeminiChatApi(mockProfile, options);

    expect(result.reasoningArtifacts).toHaveLength(1);
    expect((result.reasoningArtifacts![0].payload as any).parts).toEqual(
      signedParts
    );
    expect(result.reasoningArtifacts![0]).toMatchObject({
      provider: "gemini",
      kind: "model.parts",
      replayPolicy: "always",
      visibleText: "Thinking process...",
    });
  });

  it("should replay Gemini signed model parts in later assistant turns", async () => {
    const signedParts = [
      { text: "Thinking process...", thought: true },
      { text: "Final answer.", thought_signature: "sig-a" },
    ];
    const options: LlmRequestOptions = {
      profileId: "test-profile-gemini",
      modelId: "gemini-3.5-flash",
      messages: [
        { role: "user", content: "Explain." },
        {
          role: "assistant",
          content: "Final answer.",
          reasoningArtifacts: [
            {
              provider: "gemini",
              kind: "model.parts",
              replayPolicy: "always",
              payload: { parts: signedParts },
            },
          ],
        },
        { role: "user", content: "Continue." },
      ],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Next." }] } }],
      }),
    });

    await callGeminiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);
    expect(body.contents[1]).toEqual({
      role: "model",
      parts: signedParts,
    });
  });
});
