import { describe, expect, it } from "vitest";
import {
  OpenAiCompatibleStreamDecoder,
  buildOpenAiCompatibleRequest,
  openAiCompatibleAdapter,
  parseOpenAiCompatibleResponse,
  parseOpenAiCompatibleResponseValue,
  type LlmRequest,
  type ProviderProfile,
  type WireResponse,
} from "../src";

const profile: ProviderProfile = {
  provider: "openai-compatible",
  baseUrl: "https://api.example.com",
  apiKey: "secret-key",
  headers: { "X-Tenant": "tenant-a" },
};

function createRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    model: "compatible-model",
    messages: [
      { role: "system", content: "be concise" },
      { role: "user", content: "hello" },
    ],
    ...overrides,
  };
}

describe("OpenAI-compatible provider adapter", () => {
  it("builds a canonical wire request with standard and extension parameters", () => {
    const wireRequest = buildOpenAiCompatibleRequest(profile, {
      ...createRequest(),
      stream: true,
      maxTokens: 1024,
      temperature: 0.2,
      topP: 0.8,
      frequencyPenalty: 0.1,
      presencePenalty: 0.3,
      stop: ["END"],
      extensions: { vendor_extension: { enabled: true } },
    });

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
          stream: true,
        },
      },
      streaming: true,
    });
  });

  it("maps canonical multimodal, tool and custom endpoint inputs", async () => {
    const wireRequest = await openAiCompatibleAdapter.buildRequest(
      {
        ...profile,
        endpoints: { chatCompletions: "/gateway/chat" },
      },
      createRequest({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "inspect" },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "aW1hZ2U=",
                },
              },
            ],
          },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "call-1",
                name: "lookup",
                input: { query: "aio" },
              },
            ],
            reasoningContent: "replay",
            prefix: true,
          },
          {
            role: "tool",
            content: [
              {
                type: "tool_result",
                toolUseId: "call-1",
                content: "result",
              },
            ],
          },
        ],
      })
    );

    expect(wireRequest.url).toBe("https://api.example.com/gateway/chat");
    expect(wireRequest.body).toEqual({
      kind: "json",
      value: expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "inspect" },
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64,aW1hZ2U=",
                },
              },
            ],
          },
          {
            role: "assistant",
            content: [],
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "lookup",
                  arguments: '{"query":"aio"}',
                },
              },
            ],
            reasoning_content: "replay",
            prefix: true,
          },
          {
            role: "tool",
            content: "result",
            tool_call_id: "call-1",
          },
        ],
      }),
    });
  });

  it("parses reasoning, usage, tools, annotations and image assets", () => {
    const response = parseOpenAiCompatibleResponseValue({
      choices: [
        {
          message: {
            content: "done",
            reasoning_content: "analysis",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "lookup", arguments: '{"q":"aio"}' },
              },
            ],
            annotations: [
              {
                type: "url_citation",
                url_citation: { url: "https://example.com" },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      data: [
        {
          b64_json: "aW1hZ2U=",
          revised_prompt: "refined",
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        prompt_tokens_details: { cached_tokens: 3 },
        completion_tokens_details: { reasoning_tokens: 4 },
      },
      system_fingerprint: "fp-1",
    });

    expect(response).toEqual(
      expect.objectContaining({
        content: "done",
        reasoningContent: "analysis",
        finishReason: "tool_calls",
        usage: expect.objectContaining({
          promptTokens: 11,
          completionTokens: 7,
          totalTokens: 18,
        }),
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "lookup", arguments: '{"q":"aio"}' },
          },
        ],
        images: [
          {
            kind: "inline-base64",
            contentType: "image/png",
            data: "aW1hZ2U=",
            revisedPrompt: "refined",
          },
        ],
        metadata: { systemFingerprint: "fp-1" },
      })
    );
  });

  it("parses a split UTF-8 WireResponse body", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        choices: [{ message: { content: "结果" }, finish_reason: "stop" }],
      })
    );
    const response: WireResponse = {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: (async function* () {
        for (const byte of bytes) yield new Uint8Array([byte]);
      })(),
    };

    await expect(parseOpenAiCompatibleResponse(response)).resolves.toEqual(
      expect.objectContaining({ content: "结果", finishReason: "stop" })
    );
  });

  it("decodes split SSE text, reasoning, tools and usage into one completion", () => {
    const fixture = [
      'data: {"choices":[{"delta":{"reasoning_content":"先分析"}}]}\r\n',
      'data: {"choices":[{"delta":{"content":"结果","tool_calls":[{"index":0,"id":"call-1","function":{"name":"look","arguments":"{\\"q\\":"}}]}}]}\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"up","arguments":"\\"aio\\"}"}}]},"finish_reason":"tool_calls"}]}\n',
      'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}\n',
      "data: [DONE]\n",
    ].join("");
    const bytes = new TextEncoder().encode(fixture);
    const decoder = new OpenAiCompatibleStreamDecoder();
    const events = [];

    for (const byte of bytes) {
      events.push(...decoder.push(new Uint8Array([byte])));
    }
    events.push(...decoder.finish());

    expect(events).toEqual([
      { type: "reasoning-delta", delta: "先分析" },
      { type: "text-delta", delta: "结果" },
      {
        type: "usage",
        usage: {
          promptTokens: 11,
          completionTokens: 7,
          totalTokens: 18,
        },
      },
      {
        type: "tool-call",
        toolCall: {
          id: "call-1",
          type: "function",
          function: { name: "lookup", arguments: '{"q":"aio"}' },
        },
      },
      {
        type: "completed",
        response: {
          content: "结果",
          reasoningContent: "先分析",
          finishReason: "tool_calls",
          usage: {
            promptTokens: 11,
            completionTokens: 7,
            totalTokens: 18,
          },
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: '{"q":"aio"}' },
            },
          ],
        },
      },
    ]);
  });
});
