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
      messages: [{ role: "user", content: "Hello" }],
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
    expect(body.messages[0].content[0]).toEqual({
      type: "text",
      text: "Look at this.",
    });
    expect(body.messages[0].content[1].type).toBe("image_url");
    expect(body.messages[0].content[1].image_url.url).toContain(
      "data:image/png;base64,img_data"
    );
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

  it("should send requestId only as a header, not in the Cohere body", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile-cohere",
      modelId: "command-r-plus",
      messages: [{ role: "user", content: "Hello" }],
      requestId: "req-test-123",
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        message: { content: [{ type: "text", text: "Hi!" }] },
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callCohereChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.requestId).toBeUndefined();
    expect(fetchOptions.headers["X-Request-ID"]).toBe("req-test-123");
  });

  it("should map text, thinking, usage and finish reason from the stream", async () => {
    const fixture = [
      'data: {"type":"content-delta","delta":{"message":{"content":{"thinking":"Think."}}}}\n\n',
      'data: {"type":"content-delta","delta":{"message":{"content":{"text":"Done."}}}}\r\n\r\n',
      'data: {"type":"message-end","delta":{"finish_reason":"COMPLETE","usage":{"tokens":{"input_tokens":5,"output_tokens":3}}}}\n\n',
    ].join("");
    (fetchWithTimeout as any).mockResolvedValue(
      new Response(fixture, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    );
    const onStream = vi.fn();
    const onReasoningStream = vi.fn();

    const result = await callCohereChatApi(mockProfile, {
      profileId: mockProfile.id,
      modelId: "command-a-03-2025",
      messages: [{ role: "user", content: "Think." }],
      stream: true,
      onStream,
      onReasoningStream,
    });

    expect(onStream).toHaveBeenCalledWith("Done.");
    expect(onReasoningStream).toHaveBeenCalledWith("Think.");
    expect(result).toEqual(
      expect.objectContaining({
        content: "Done.",
        reasoningContent: "Think.",
        finishReason: "stop",
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        isStream: true,
      })
    );
  });
});
