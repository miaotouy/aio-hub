import { describe, it, expect, vi, beforeEach } from "vitest";
import { callCohereChatApi } from "../chat";
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

describe("Cohere Adapter - Chat", () => {
  const mockProfile: LlmProfile = {
    id: "test-profile-cohere",
    name: "Cohere Profile",
    baseUrl: "https://api.cohere.com",
    apiKeys: ["cohere-test-key"],
    type: "cohere",
    enabled: true,
    models: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should correctly build a basic chat request", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-cohere",
      modelId: "command-r-plus",
      messages: [
        { role: "user", content: "Hello" },
      ],
      temperature: 0.3,
      topP: 0.9,
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        message: {
          content: [{ type: "text", text: "Hi!" }],
        },
        usage: {
          tokens: { input_tokens: 5, output_tokens: 2 },
        },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const result = await callCohereChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.model).toBe("command-r-plus");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(body.temperature).toBe(0.3);
    expect(body.p).toBe(0.9);

    expect(result.content).toBe("Hi!");
    expect(result.usage?.totalTokens).toBe(7);
  });

  it("should handle multimodal content (images)", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-cohere",
      modelId: "command-r-plus",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this." },
            { type: "image", imageBase64: "img_data" },
          ],
        },
      ],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        message: { content: [{ type: "text", text: "I see it." }] },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callCohereChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.messages[0].content).toHaveLength(2);
    expect(body.messages[0].content[0]).toEqual({ type: "text", text: "Look at this." });
    expect(body.messages[0].content[1].type).toBe("image_url");
    expect(body.messages[0].content[1].image_url.url).toContain("data:image/png;base64,img_data");
  });

  it("should handle thinking enabled", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-cohere",
      modelId: "command-r-plus",
      messages: [{ role: "user", content: "Think." }],
      thinkingEnabled: true,
      thinkingBudget: 500,
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        message: { content: [{ type: "text", text: "Done." }] },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callCohereChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 500 });
  });
});