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
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const result = await callGeminiChatApi(mockProfile, options);

    const [url, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(url).toContain("key=gemini-test-key");
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Instruction." }] });
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
});