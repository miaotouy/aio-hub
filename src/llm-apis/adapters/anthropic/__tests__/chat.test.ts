import { describe, it, expect, vi, beforeEach } from "vitest";
import { callClaudeChatApi } from "../chat";
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

describe("Anthropic Adapter - Chat", () => {
  const mockProfile: LlmProfile = {
    id: "test-profile-claude",
    name: "Claude Profile",
    baseUrl: "https://api.anthropic.com",
    apiKeys: ["claude-test-key"],
    type: "claude",
    enabled: true,
    models: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should correctly build a request with system message", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-claude",
      modelId: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "system", content: "You are a coding expert." },
        { role: "user", content: "Write a test." },
      ],
      temperature: 0.5,
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Here is your test." }],
        model: "claude-3-5-sonnet-20241022",
        stop_reason: "end_turn",
        usage: { input_tokens: 15, output_tokens: 10 },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const result = await callClaudeChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.model).toBe("claude-3-5-sonnet-20241022");
    expect(body.system).toBe("You are a coding expert.");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toEqual({ role: "user", content: "Write a test." });
    expect(body.temperature).toBe(0.5);

    expect(result.content).toBe("Here is your test.");
    expect(result.usage?.totalTokens).toBe(25);
  });

  it("should handle multimodal content (images and documents)", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-claude",
      modelId: "claude-3-5-sonnet",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this image and PDF." },
            { type: "image", imageBase64: "img_data" },
            { 
              type: "document", 
              source: { type: "base64", media_type: "application/pdf", data: "pdf_data" } 
            },
          ],
        },
      ],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Analysis result." }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callClaudeChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.messages[0].content).toHaveLength(3);
    expect(body.messages[0].content[0]).toEqual({ type: "text", text: "Analyze this image and PDF." });
    expect(body.messages[0].content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "img_data" },
    });
    expect(body.messages[0].content[2]).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "pdf_data" },
    });
  });

  it("should handle thinking mode", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-claude",
      modelId: "claude-3-7-sonnet",
      messages: [{ role: "user", content: "Think deep." }],
      thinkingEnabled: true,
      thinkingBudget: 2000,
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Result after thinking." }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callClaudeChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 2000 });
    expect(body.temperature).toBeUndefined(); // Thinking mode usually disables temperature
    expect(fetchOptions.headers["anthropic-beta"]).toContain("thinking-2025-12-05");
  });

  it("should handle tool calls in response", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-claude",
      modelId: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "What's the weather?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            parameters: { type: "object", properties: { location: { type: "string" } } },
          },
        },
      ],
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "tool_1", name: "get_weather", input: { location: "London" } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 50, output_tokens: 20 },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const result = await callClaudeChatApi(mockProfile, options);

    expect(result.content).toBe("Let me check.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toEqual({
      id: "tool_1",
      type: "function",
      function: { name: "get_weather", arguments: '{"location":"London"}' },
    });
    expect(result.finishReason).toBe("tool_use");
  });
});