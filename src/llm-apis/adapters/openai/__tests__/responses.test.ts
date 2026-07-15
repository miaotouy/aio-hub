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
import { callOpenAiResponsesApi } from "../responses";
import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions } from "@/llm-apis/common";

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

describe("OpenAI Adapter - Responses", () => {
  const mockProfile: LlmProfile = {
    id: "responses-profile",
    name: "Responses Profile",
    baseUrl: "https://api.openai.com/v1",
    apiKeys: ["test-key"],
    type: "openai-responses",
    enabled: true,
    models: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores response.output items as replay artifacts", async () => {
    const output = [
      {
        id: "rs_1",
        type: "reasoning",
        encrypted_content: "encrypted-state",
      },
      {
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Done." }],
      },
    ];

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp_1",
        status: "completed",
        output,
      }),
    });

    const result = await callOpenAiResponsesApi(mockProfile, {
      profileId: "responses-profile",
      modelId: "gpt-5",
      messages: [{ role: "user", content: "Think." }],
    });

    expect(result.content).toBe("Done.");
    expect(result.reasoningArtifacts).toHaveLength(2);
    expect((result.reasoningArtifacts![0].payload as any).item).toEqual(
      output[0]
    );
    expect((result.reasoningArtifacts![1].payload as any).item).toEqual(
      output[1]
    );
  });

  it("replays stored output items in the next request", async () => {
    const reasoningItem = {
      id: "rs_1",
      type: "reasoning",
      encrypted_content: "encrypted-state",
    };
    const messageItem = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Done." }],
    };

    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp_2",
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Next." }],
          },
        ],
      }),
    });

    const options: LlmRequestOptions = {
      profileId: "responses-profile",
      modelId: "gpt-5",
      messages: [
        { role: "user", content: "Think." },
        {
          role: "assistant",
          content: "Done.",
          reasoningArtifacts: [
            {
              provider: "openai-responses",
              kind: "response.output_item",
              replayPolicy: "always",
              payload: { responseId: "resp_1", index: 0, item: reasoningItem },
            },
            {
              provider: "openai-responses",
              kind: "response.output_item",
              replayPolicy: "always",
              payload: { responseId: "resp_1", index: 1, item: messageItem },
            },
          ],
        },
        { role: "user", content: "Continue." },
      ],
    };

    await callOpenAiResponsesApi(mockProfile, options);

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);
    expect(body.input).toEqual([
      { role: "user", content: "Think." },
      reasoningItem,
      messageItem,
      { role: "user", content: "Continue." },
    ]);
  });

  it("requests encrypted reasoning when store is disabled", async () => {
    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp_1",
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Done." }],
          },
        ],
      }),
    });

    await callOpenAiResponsesApi(mockProfile, {
      profileId: "responses-profile",
      modelId: "gpt-5",
      messages: [{ role: "user", content: "Hi." }],
      responsesStore: false,
    });

    const [, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    const body = JSON.parse(fetchOptions.body);
    expect(body.store).toBe(false);
    expect(body.include).toContain("reasoning.encrypted_content");
    expect(body.responsesStore).toBeUndefined();
  });

  it("builds the shared Responses wire format with flattened tools", async () => {
    (fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "resp_1",
        status: "completed",
        output: [{ type: "message", content: [] }],
      }),
    });

    await callOpenAiResponsesApi(mockProfile, {
      profileId: "responses-profile",
      modelId: "gpt-5",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Look it up." },
      ],
      maxTokens: 512,
      temperature: 0.2,
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Lookup",
            parameters: { type: "object" },
            strict: true,
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "lookup" } },
    });

    const [url, fetchOptions] = (fetchWithTimeout as any).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse(fetchOptions.body)).toEqual(
      expect.objectContaining({
        model: "gpt-5",
        input: "Look it up.",
        instructions: "Be concise.",
        max_output_tokens: 512,
        temperature: 0.2,
        tools: [
          {
            type: "function",
            name: "lookup",
            description: "Lookup",
            parameters: { type: "object" },
            strict: true,
          },
        ],
        tool_choice: { type: "function", name: "lookup" },
      })
    );
  });

  it("maps shared streaming events to desktop callbacks and final response", async () => {
    const completed = {
      id: "resp_stream",
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "Done." },
            { type: "reasoning_text", text: "Think." },
          ],
        },
      ],
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    };
    const fixture = [
      'data: {"type":"response.reasoning_text.delta","delta":"Think."}\n\n',
      'data: {"type":"response.output_text.delta","delta":"Done."}\n\n',
      'data: {"type":"response.image_generation_call.partial_image","partial_image_b64":"aW1hZ2U=","partial_image_index":0}\n\n',
      `data: ${JSON.stringify({ type: "response.completed", response: completed })}\n\n`,
    ].join("");
    const bytes = new TextEncoder().encode(fixture);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    (fetchWithTimeout as any).mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
    const onStream = vi.fn();
    const onReasoningStream = vi.fn();
    const onPartialImage = vi.fn();

    const result = await callOpenAiResponsesApi(mockProfile, {
      profileId: "responses-profile",
      modelId: "gpt-5",
      messages: [{ role: "user", content: "Think." }],
      stream: true,
      onStream,
      onReasoningStream,
      onPartialImage,
    });

    expect(onStream).toHaveBeenCalledWith("Done.");
    expect(onReasoningStream).toHaveBeenCalledWith("Think.");
    expect(onPartialImage).toHaveBeenCalledWith(
      "data:image/png;base64,aW1hZ2U=",
      0
    );
    expect(result).toEqual(
      expect.objectContaining({
        content: "Done.",
        reasoningContent: "Think.",
        finishReason: "stop",
        isStream: true,
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
      })
    );
    expect(result.reasoningArtifacts).toHaveLength(1);
  });
});
