import type {
  LlmTransport,
  TransportOptions,
  WireRequest,
  WireResponse,
} from "@aiohub/llm-core";
import { describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "../../../types";
import type { LlmRequestOptions } from "../../common";
import { OPENAI_COMPATIBLE_STREAM_FIXTURE } from "./fixtures/openai-compatible";
import {
  buildOpenAiCompatibleRequest,
  createOpenAiCompatibleApi,
  parseOpenAiCompatibleResponse,
} from "../openai-compatible";

function createProfile(overrides: Partial<LlmProfile> = {}): LlmProfile {
  return {
    id: "openai-profile",
    name: "OpenAI Compatible",
    type: "openai",
    baseUrl: "https://api.example.com",
    apiKeys: ["secret-key"],
    enabled: true,
    models: [],
    customHeaders: { "X-Tenant": "tenant-a" },
    ...overrides,
  };
}

function createWireResponse(chunks: readonly string[]): WireResponse {
  const encoder = new TextEncoder();
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield encoder.encode(chunk);
      },
    },
  };
}

function createAdapter(response: WireResponse) {
  const send = vi.fn<
    (request: WireRequest, options: TransportOptions) => Promise<WireResponse>
  >(async () => response);
  const warn = vi.fn();
  const transport: LlmTransport = { send };

  return {
    callApi: createOpenAiCompatibleApi({ transport, logger: { warn } }),
    send,
    warn,
  };
}

describe("mobile OpenAI-compatible shared adapter facade", () => {
  it("maps agent parameters into the shared provider wire payload", async () => {
    const adapter = createAdapter(
      createWireResponse([
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
      ])
    );
    const options: LlmRequestOptions = {
      requestId: "request-1",
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
      relaxIdCerts: true,
      http1Only: true,
      vendor_extension: { enabled: true },
    };

    const result = await adapter.callApi(createProfile(), options);

    expect(adapter.send).toHaveBeenCalledOnce();
    const [wireRequest, transportOptions] = adapter.send.mock.calls[0];
    expect(wireRequest).toEqual({
      method: "POST",
      url: "https://api.example.com/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key",
        "X-Tenant": "tenant-a",
      },
      body: {
        kind: "json",
        value: {
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
        },
      },
      streaming: false,
    });
    expect(transportOptions).toEqual(
      expect.objectContaining({
        requestId: "request-1",
        network: expect.objectContaining({
          relaxInvalidCerts: true,
          http1Only: true,
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        content: "ok",
        finishReason: "stop",
        usage: {
          promptTokens: 2,
          completionTokens: 1,
          totalTokens: 3,
        },
      })
    );
  });

  it("delivers text and reasoning separately while retaining final usage", async () => {
    const adapter = createAdapter(
      createWireResponse(OPENAI_COMPATIBLE_STREAM_FIXTURE)
    );
    const textChunks: string[] = [];
    const reasoningChunks: string[] = [];

    const result = await adapter.callApi(createProfile(), {
      modelId: "reasoning-model",
      messages: [{ role: "user", content: "solve" }],
      stream: true,
      onStream: (chunk) => textChunks.push(chunk),
      onReasoningStream: (chunk) => reasoningChunks.push(chunk),
    });

    expect(textChunks).toEqual(["结果"]);
    expect(reasoningChunks).toEqual(["先分析"]);
    expect(result).toEqual(
      expect.objectContaining({
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
      })
    );
  });

  it("preserves custom endpoints and canonical multimodal extensions", () => {
    const wireRequest = buildOpenAiCompatibleRequest(
      createProfile({
        customEndpoints: { chatCompletions: "/gateway/chat" },
      }),
      {
        modelId: "compatible-model",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                imageBase64: "/9j/4AAQSkZJRgABAQAAAQABAAD",
              },
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "image/webp",
                  data: "document-image",
                },
              },
              {
                type: "video",
                source: {
                  type: "base64",
                  media_type: "video/mp4",
                  data: "video-data",
                },
                videoMetadata: { fps: 2 },
              },
            ],
          },
        ],
        stream: false,
        tools: [
          {
            type: "function",
            function: {
              name: "lookup",
              parameters: { type: "object" },
              strict: true,
            },
          },
        ],
      }
    );

    expect(wireRequest.url).toBe("https://api.example.com/gateway/chat");
    expect(wireRequest.body).toEqual({
      model: "compatible-model",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
              },
            },
            {
              type: "image_url",
              image_url: {
                url: "data:image/webp;base64,document-image",
              },
            },
            {
              type: "image_url",
              image_url: { url: "data:video/mp4;base64,video-data" },
              video_metadata: { fps: 2 },
            },
          ],
        },
      ],
      temperature: 0.5,
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            parameters: { type: "object" },
            strict: true,
          },
        },
      ],
    });
  });

  it("maps shared response metadata back to the mobile response contract", () => {
    expect(
      parseOpenAiCompatibleResponse({
        choices: [
          {
            message: {
              content: "",
              refusal: "blocked",
              annotations: [
                {
                  type: "url_citation",
                  url_citation: {
                    start_index: 0,
                    end_index: 4,
                    url: "https://example.com",
                    title: "Example",
                  },
                },
              ],
            },
            finish_reason: "content_filter",
            logprobs: { content: null },
          },
        ],
        system_fingerprint: "fp-1",
        service_tier: "default",
      })
    ).toEqual(
      expect.objectContaining({
        content: "",
        refusal: "blocked",
        finishReason: "content_filter",
        systemFingerprint: "fp-1",
        serviceTier: "default",
        logprobs: { content: null },
        annotations: [
          {
            type: "url_citation",
            urlCitation: {
              startIndex: 0,
              endIndex: 4,
              url: "https://example.com",
              title: "Example",
            },
          },
        ],
      })
    );
  });
});
