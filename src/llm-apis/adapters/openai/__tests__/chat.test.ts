import { describe, it, expect, vi, beforeEach } from "vitest";
import { callOpenAiChatApi } from "../chat";
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

import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";

describe("OpenAI Adapter - Chat", () => {
  const mockProfile: LlmProfile = {
    id: "test-profile",
    name: "Test Profile",
    baseUrl: "https://api.openai.com/v1",
    apiKeys: ["test-key"],
    type: "openai",
    enabled: true,
    models: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should correctly build a simple text request", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
      temperature: 1,
      maxTokens: 100,
    };

    // Mock successful response
    const mockResponse = {
      ok: true,
      json: async () => ({
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1677652288,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Hello! How can I help you today?",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const result = await callOpenAiChatApi(mockProfile, options);

    // Verify fetch call
    expect(fetchWithTimeout).toHaveBeenCalled();
    const [url, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    
    expect(url).toContain("chat/completions");
    
    const body = JSON.parse(fetchOptions.body);
    expect(body.model).toBe("gpt-4");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(100);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({ role: "system", content: "You are a helpful assistant." });
    expect(body.messages[1]).toEqual({ role: "user", content: "Hello!" });

    // Verify result
    expect(result.content).toBe("Hello! How can I help you today?");
    expect(result.usage?.totalTokens).toBe(30);
  });

  it("should handle multimodal content (images)", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-4-vision",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image?" },
            { type: "image", imageBase64: "base64data" },
          ],
        },
      ],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "It's a cat." }, finish_reason: "stop" }],
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callOpenAiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.messages[0].content).toHaveLength(2);
    expect(body.messages[0].content[0]).toEqual({ type: "text", text: "What is in this image?" });
    expect(body.messages[0].content[1].type).toBe("image_url");
    expect(body.messages[0].content[1].image_url.url).toContain("data:image/png;base64,base64data");
  });

  it("should handle reasoning content from models like DeepSeek", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "deepseek-reasoner",
      messages: [{ role: "user", content: "Solve 1+1" }],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "The answer is 2.",
              reasoning_content: "I need to add 1 and 1. 1+1=2.",
            },
            finish_reason: "stop",
          },
        ],
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const result = await callOpenAiChatApi(mockProfile, options);

    expect(result.content).toBe("The answer is 2.");
    expect(result.reasoningContent).toBe("I need to add 1 and 1. 1+1=2.");
  });

  it("should handle API errors", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-4",
      messages: [{ role: "user", content: "Hi" }],
    };

    (fetchWithTimeout as any).mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" });
    (ensureResponseOk as any).mockImplementation(async (res: any) => {
      if (!res.ok) throw new Error("API Error");
    });

    await expect(callOpenAiChatApi(mockProfile, options)).rejects.toThrow("API Error");
  });
});