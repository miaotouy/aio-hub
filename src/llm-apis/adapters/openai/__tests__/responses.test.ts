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
    expect((result.reasoningArtifacts![0].payload as any).item).toBe(output[0]);
    expect((result.reasoningArtifacts![1].payload as any).item).toBe(output[1]);
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
});
