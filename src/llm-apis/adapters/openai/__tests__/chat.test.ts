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
    expect(body.temperature).toBe(1);
    expect(body.max_tokens).toBe(100);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
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
        choices: [
          { message: { content: "It's a cat." }, finish_reason: "stop" },
        ],
      }),
    };
    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    await callOpenAiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);

    expect(body.messages[0].content).toHaveLength(2);
    expect(body.messages[0].content[0]).toEqual({
      type: "text",
      text: "What is in this image?",
    });
    expect(body.messages[0].content[1].type).toBe("image_url");
    expect(body.messages[0].content[1].image_url.url).toContain(
      "data:image/png;base64,base64data"
    );
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
    expect(result.reasoningArtifacts?.[0]).toMatchObject({
      provider: "deepseek",
      kind: "reasoning_content",
      replayPolicy: "never",
      visibleText: "I need to add 1 and 1. 1+1=2.",
    });
  });

  it("should not replay DeepSeek reasoning_content from display-only reasoningContent", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "deepseek-reasoner",
      messages: [
        {
          role: "assistant",
          content: "The answer is 2.",
          reasoningContent: "Display-only thought.",
        },
        { role: "user", content: "Continue." },
      ],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Done." }, finish_reason: "stop" }],
      }),
    });

    await callOpenAiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);
    expect(body.messages[0]).toEqual({
      role: "assistant",
      content: "The answer is 2.",
    });
  });

  it("should replay DeepSeek reasoning_content only from replay artifacts", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "deepseek-reasoner",
      messages: [
        {
          role: "assistant",
          content: "Calling tool.",
          reasoningArtifacts: [
            {
              provider: "deepseek",
              kind: "reasoning_content",
              replayPolicy: "with_tool_calls",
              payload: { reasoning_content: "Tool-call thought." },
            },
          ],
        },
        { role: "user", content: "Continue." },
      ],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Done." }, finish_reason: "stop" }],
      }),
    });

    await callOpenAiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);
    expect(body.messages[0].reasoning_content).toBe("Tool-call thought.");
  });

  it("should extract generated images from OpenAI-compatible data responses", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-image-2-hq",
      messages: [{ role: "user", content: "Generate an image" }],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Done",
            },
            finish_reason: "stop",
          },
        ],
        data: [
          {
            b64_json: "aW1hZ2UtYnl0ZXM=",
            revised_prompt: "A refined image prompt",
          },
        ],
      }),
    });

    const result = await callOpenAiChatApi(mockProfile, options);

    expect(result.images).toEqual([
      {
        b64_json: "aW1hZ2UtYnl0ZXM=",
        revisedPrompt: "A refined image prompt",
      },
    ]);
    expect(result.revisedPrompt).toBe("A refined image prompt");
  });

  it("should extract generated images from Responses-style output on chat-compatible responses", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-5.5-image-2-hq",
      messages: [{ role: "user", content: "Generate an image" }],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Done",
            },
            finish_reason: "stop",
          },
        ],
        output: [
          {
            id: "ig_123",
            type: "image_generation_call",
            status: "completed",
            result: "cmVzcG9uc2VzLWltYWdl",
            revised_prompt: "A responses-style refined prompt",
          },
        ],
      }),
    });

    const result = await callOpenAiChatApi(mockProfile, options);

    expect(result.images).toEqual([
      {
        b64_json: "cmVzcG9uc2VzLWltYWdl",
        revisedPrompt: "A responses-style refined prompt",
      },
    ]);
    expect(result.revisedPrompt).toBe("A responses-style refined prompt");
  });

  it("should extract generated images from image tool call arguments", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-5.5-image-2-hq",
      messages: [{ role: "user", content: "Generate an image" }],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "image_generation",
                    arguments: JSON.stringify({
                      result: "dG9vbC1pbWFnZQ==",
                      revised_prompt: "A tool-call refined prompt",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
    });

    const result = await callOpenAiChatApi(mockProfile, options);

    expect(result.images).toEqual([
      {
        b64_json: "dG9vbC1pbWFnZQ==",
        revisedPrompt: "A tool-call refined prompt",
      },
    ]);
    expect(result.revisedPrompt).toBe("A tool-call refined prompt");
  });

  it("should extract generated images from markdown content", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-image-2-hq",
      messages: [{ role: "user", content: "Generate an image" }],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "![result](https://example.com/image.png)",
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const result = await callOpenAiChatApi(mockProfile, options);

    expect(result.images).toEqual([
      {
        url: "https://example.com/image.png",
        revisedPrompt: undefined,
      },
    ]);
  });

  it("should send reasoning_effort for OpenAI-family models", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-5",
      messages: [{ role: "user", content: "Think briefly" }],
      reasoningEffort: "low",
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Done" }, finish_reason: "stop" }],
      }),
    });

    await callOpenAiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);
    expect(body.reasoning_effort).toBe("low");
  });

  it("should not send reasoning_effort for non-OpenAI models behind OpenAI-compatible endpoints", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "deepseek-v4-flash",
      messages: [{ role: "user", content: "Name this topic" }],
      reasoningEffort: "low",
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "DeepSeek" }, finish_reason: "stop" }],
      }),
    });

    await callOpenAiChatApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("should handle API errors", async () => {
    const options: LlmRequestOptions = {
      profileId: "test-profile",
      modelId: "gpt-4",
      messages: [{ role: "user", content: "Hi" }],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    (ensureResponseOk as any).mockImplementation(async (res: any) => {
      if (!res.ok) throw new Error("API Error");
    });

    await expect(callOpenAiChatApi(mockProfile, options)).rejects.toThrow(
      "API Error"
    );
  });
});
