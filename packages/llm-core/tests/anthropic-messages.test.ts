import { describe, expect, it } from "vitest";
import {
  AnthropicMessagesStreamDecoder,
  buildAnthropicMessagesUrl,
  buildAnthropicMessagesRequest,
  parseAnthropicMessagesResponseValue,
  type LlmRequest,
  type ProviderProfile,
} from "../src";

const profile: ProviderProfile = {
  provider: "claude",
  baseUrl: "https://api.anthropic.com",
  apiKey: "secret-key",
  headers: { "X-Tenant": "tenant-a" },
};

describe("Anthropic Messages provider adapter", () => {
  it("supports relative and absolute Messages endpoint overrides", () => {
    expect(
      buildAnthropicMessagesUrl({
        ...profile,
        endpoints: { messages: "/custom/messages" },
      })
    ).toBe("https://api.anthropic.com/custom/messages");
    expect(
      buildAnthropicMessagesUrl({
        ...profile,
        endpoints: { messages: "https://gateway.example.com/v1/messages" },
      })
    ).toBe("https://gateway.example.com/v1/messages");
  });

  it("builds system, multimodal, tool, thinking and header fields", () => {
    const request: LlmRequest = {
      model: "claude-sonnet-4-5",
      requestId: "request-1",
      stream: true,
      messages: [
        { role: "system", content: "Be concise." },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Inspect these files.",
              cacheControl: { type: "ephemeral" },
            },
            {
              type: "image",
              source: "data:image/png;base64,aW1hZ2U=",
            },
            {
              type: "document",
              source: { type: "file", file_id: "file_1" },
            },
          ],
        },
      ],
      maxTokens: 2048,
      temperature: 0.2,
      topK: 20,
      topP: 0.8,
      stop: ["END"],
      metadata: { user_id: "user-1" },
      thinkingEnabled: true,
      thinkingBudget: 1024,
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Look up a value",
            parameters: { type: "object" },
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "lookup" } },
      parallelToolCalls: false,
      webSearchEnabled: true,
      extensions: { vendor_flag: true },
    };

    expect(buildAnthropicMessagesRequest(profile, request)).toEqual({
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "secret-key",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "files-api-2025-04-14,thinking-2025-12-05",
        "X-Request-ID": "request-1",
        "X-Tenant": "tenant-a",
      },
      body: {
        kind: "json",
        value: {
          model: "claude-sonnet-4-5",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Inspect these files.",
                  cache_control: { type: "ephemeral" },
                },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: "aW1hZ2U=",
                  },
                },
                {
                  type: "document",
                  source: { type: "file", file_id: "file_1" },
                },
              ],
            },
          ],
          max_tokens: 2048,
          system: "Be concise.",
          top_k: 20,
          top_p: 0.8,
          stop_sequences: ["END"],
          metadata: { user_id: "user-1" },
          thinking: { type: "enabled", budget_tokens: 1024 },
          tools: [
            {
              type: "custom",
              name: "lookup",
              description: "Look up a value",
              input_schema: { type: "object" },
            },
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5,
            },
          ],
          tool_choice: {
            type: "tool",
            name: "lookup",
            disable_parallel_tool_use: true,
          },
          vendor_flag: true,
          stream: true,
        },
      },
      streaming: true,
    });
  });

  it("parses text, thinking, tools, cache usage and stop sequence", () => {
    expect(
      parseAnthropicMessagesResponseValue({
        id: "msg_1",
        model: "claude-sonnet-4-5",
        type: "message",
        content: [
          { type: "thinking", thinking: "Analyze." },
          { type: "text", text: "Done." },
          {
            type: "tool_use",
            id: "tool_1",
            name: "lookup",
            input: { q: "aio" },
          },
        ],
        stop_reason: "tool_use",
        stop_sequence: "END",
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          cache_read_input_tokens: 3,
        },
      })
    ).toEqual({
      content: "Done.",
      reasoningContent: "Analyze.",
      finishReason: "tool_use",
      stopSequence: "END",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
        promptTokensDetails: { cachedTokens: 3 },
      },
      toolCalls: [
        {
          id: "tool_1",
          type: "function",
          function: { name: "lookup", arguments: '{"q":"aio"}' },
        },
      ],
      metadata: {
        anthropicMessageId: "msg_1",
        anthropicModel: "claude-sonnet-4-5",
      },
    });
  });

  it("decodes byte-split thinking, text, parallel tools and split usage", () => {
    const events = decode([
      {
        type: "message_start",
        message: {
          usage: { input_tokens: 5, cache_read_input_tokens: 2 },
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "分析" },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "结果" },
      },
      {
        type: "content_block_start",
        index: 2,
        content_block: { type: "tool_use", id: "tool_1", name: "lookup" },
      },
      {
        type: "content_block_start",
        index: 3,
        content_block: { type: "tool_use", id: "tool_2", name: "search" },
      },
      {
        type: "content_block_delta",
        index: 2,
        delta: { type: "input_json_delta", partial_json: '{"q":"aio"}' },
      },
      {
        type: "content_block_delta",
        index: 3,
        delta: { type: "input_json_delta", partial_json: '{"q":"hub"}' },
      },
      { type: "content_block_stop", index: 3 },
      { type: "content_block_stop", index: 2 },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 3 },
      },
      { type: "message_stop" },
    ]);

    expect(events).toEqual([
      { type: "reasoning-delta", delta: "分析" },
      { type: "text-delta", delta: "结果" },
      {
        type: "tool-call",
        toolCall: {
          id: "tool_2",
          type: "function",
          function: { name: "search", arguments: '{"q":"hub"}' },
        },
      },
      {
        type: "tool-call",
        toolCall: {
          id: "tool_1",
          type: "function",
          function: { name: "lookup", arguments: '{"q":"aio"}' },
        },
      },
      {
        type: "usage",
        usage: {
          promptTokens: 5,
          completionTokens: 3,
          totalTokens: 8,
          promptTokensDetails: { cachedTokens: 2 },
        },
      },
      {
        type: "completed",
        response: {
          content: "结果",
          reasoningContent: "分析",
          finishReason: "tool_use",
          stopSequence: null,
          usage: {
            promptTokens: 5,
            completionTokens: 3,
            totalTokens: 8,
            promptTokensDetails: { cachedTokens: 2 },
          },
          toolCalls: [
            {
              id: "tool_2",
              type: "function",
              function: { name: "search", arguments: '{"q":"hub"}' },
            },
            {
              id: "tool_1",
              type: "function",
              function: { name: "lookup", arguments: '{"q":"aio"}' },
            },
          ],
        },
      },
    ]);
  });

  it("throws provider stream errors", () => {
    const decoder = new AnthropicMessagesStreamDecoder();
    const fixture =
      'data: {"type":"error","error":{"message":"overloaded"}}\n\n';
    expect(() => decoder.push(new TextEncoder().encode(fixture))).toThrow(
      "Anthropic Messages Error: overloaded"
    );
  });
});

function decode(values: unknown[]) {
  const fixture = values
    .map(
      (value, index) =>
        `data: ${JSON.stringify(value)}${index % 2 ? "\r\n\r\n" : "\n\n"}`
    )
    .join("");
  const decoder = new AnthropicMessagesStreamDecoder();
  const events = [];
  for (const byte of new TextEncoder().encode(fixture)) {
    events.push(...decoder.push(new Uint8Array([byte])));
  }
  events.push(...decoder.finish());
  return events;
}
