import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "../../../types";
import type { LlmRequestOptions } from "../../common";
import { OPENAI_COMPATIBLE_STREAM_FIXTURE } from "./fixtures/openai-compatible";

const { ensureResponseOkMock, fetchWithTimeoutMock } = vi.hoisted(() => ({
  ensureResponseOkMock: vi.fn(),
  fetchWithTimeoutMock: vi.fn(),
}));

vi.mock("../../common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../common")>();
  return {
    ...actual,
    ensureResponseOk: ensureResponseOkMock,
    fetchWithTimeout: fetchWithTimeoutMock,
  };
});

import { callOpenAiCompatibleApi } from "../openai-compatible";

function createProfile(): LlmProfile {
  return {
    id: "openai-profile",
    name: "OpenAI Compatible",
    type: "openai",
    baseUrl: "https://api.example.com",
    apiKeys: ["secret-key"],
    enabled: true,
    models: [],
    customHeaders: { "X-Tenant": "tenant-a" },
  };
}

function createSseResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200 }
  );
}

describe("mobile OpenAI-compatible adapter baseline", () => {
  beforeEach(() => {
    ensureResponseOkMock.mockReset().mockResolvedValue(undefined);
    fetchWithTimeoutMock.mockReset();
  });

  it("maps agent generation parameters into the provider wire payload", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: "ok" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
            total_tokens: 3,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const options: LlmRequestOptions = {
      modelId: "compatible-model",
      messages: [
        { role: "system", content: "be concise" },
        { role: "user", content: "hello" },
      ],
      stream: false,
      maxTokens: 1024,
      temperature: 0.2,
      topP: 0.8,
      frequencyPenalty: 0.1,
      presencePenalty: 0.3,
      stop: ["END"],
      vendor_extension: { enabled: true },
    };

    const result = await callOpenAiCompatibleApi(createProfile(), options);

    expect(fetchWithTimeoutMock).toHaveBeenCalledOnce();
    const [url, requestOptions] = fetchWithTimeoutMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(requestOptions.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-key",
      "X-Tenant": "tenant-a",
    });
    expect(JSON.parse(requestOptions.body)).toEqual({
      model: "compatible-model",
      messages: [
        { role: "system", content: "be concise" },
        { role: "user", content: "hello" },
      ],
      temperature: 0.2,
      max_tokens: 1024,
      top_p: 0.8,
      frequency_penalty: 0.1,
      presence_penalty: 0.3,
      stop: ["END"],
      vendor_extension: { enabled: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        content: "ok",
        finishReason: "stop",
        usage: {
          promptTokens: 2,
          completionTokens: 1,
          totalTokens: 3,
          promptTokensDetails: undefined,
          completionTokensDetails: undefined,
        },
      })
    );
  });

  it("delivers text and reasoning separately while retaining final usage", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      createSseResponse(OPENAI_COMPATIBLE_STREAM_FIXTURE)
    );
    const textChunks: string[] = [];
    const reasoningChunks: string[] = [];

    const result = await callOpenAiCompatibleApi(createProfile(), {
      modelId: "reasoning-model",
      messages: [{ role: "user", content: "solve" }],
      stream: true,
      onStream: (chunk) => textChunks.push(chunk),
      onReasoningStream: (chunk) => reasoningChunks.push(chunk),
    });

    expect(textChunks).toEqual(["结果"]);
    expect(reasoningChunks).toEqual(["先分析"]);
    expect(result).toEqual({
      content: "结果",
      reasoningContent: "先分析",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
        promptTokensDetails: {
          cachedTokens: 3,
          audioTokens: undefined,
        },
        completionTokensDetails: {
          reasoningTokens: 4,
          audioTokens: undefined,
          acceptedPredictionTokens: undefined,
          rejectedPredictionTokens: undefined,
        },
      },
      isStream: true,
    });
    expect(ensureResponseOkMock).toHaveBeenCalledOnce();
  });
});
