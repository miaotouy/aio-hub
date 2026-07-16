import { describe, expect, it } from "vitest";
import {
  CohereChatStreamDecoder,
  buildCohereChatRequest,
  parseCohereChatResponseValue,
  type LlmRequest,
  type ProviderProfile,
} from "../src";

const profile: ProviderProfile = {
  provider: "cohere",
  baseUrl: "https://api.cohere.com/v1",
  apiKey: "secret-key",
  headers: { "X-Tenant": "tenant-a" },
};

describe("Cohere Chat provider adapter", () => {
  it("builds V2 messages, parameters, tools and request headers", () => {
    const request: LlmRequest = {
      model: "command-a-03-2025",
      requestId: "request-1",
      stream: true,
      messages: [
        { role: "system", content: "Be concise." },
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect." },
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
      ],
      maxTokens: 2048,
      temperature: 0.2,
      topP: 0.8,
      topK: 20,
      frequencyPenalty: 0.1,
      presencePenalty: 0.2,
      seed: 42,
      stop: "END",
      thinkingEnabled: true,
      thinkingBudget: 512,
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
      extensions: { vendor_flag: true, requestId: "must-not-leak" },
    };

    expect(buildCohereChatRequest(profile, request)).toEqual({
      method: "POST",
      url: "https://api.cohere.com/v2/chat",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key",
        "X-Request-ID": "request-1",
        "X-Tenant": "tenant-a",
      },
      body: {
        kind: "json",
        value: {
          model: "command-a-03-2025",
          messages: [
            { role: "system", content: "Be concise." },
            {
              role: "user",
              content: [
                { type: "text", text: "Inspect." },
                {
                  type: "image_url",
                  image_url: {
                    url: "data:image/png;base64,aW1hZ2U=",
                  },
                },
              ],
            },
          ],
          temperature: 0.2,
          max_tokens: 2048,
          p: 0.8,
          k: 20,
          frequency_penalty: 0.1,
          presence_penalty: 0.2,
          seed: 42,
          stop_sequences: ["END"],
          thinking: { type: "enabled", budget_tokens: 512 },
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
          tool_choice: {
            type: "function",
            function: { name: "lookup" },
          },
          vendor_flag: true,
          stream: true,
        },
      },
      streaming: true,
    });
  });

  it("parses text, thinking, tool calls, finish reason and usage", () => {
    expect(
      parseCohereChatResponseValue({
        id: "response-1",
        finish_reason: "TOOL_CALL",
        message: {
          content: [
            { type: "thinking", thinking: "Analyze." },
            { type: "text", text: "Done." },
          ],
          tool_calls: [
            {
              id: "tool_1",
              type: "function",
              function: { name: "lookup", arguments: '{"q":"aio"}' },
            },
          ],
        },
        usage: { tokens: { input_tokens: 11, output_tokens: 7 } },
      })
    ).toEqual({
      content: "Done.",
      reasoningContent: "Analyze.",
      finishReason: "tool_calls",
      usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
      toolCalls: [
        {
          id: "tool_1",
          type: "function",
          function: { name: "lookup", arguments: '{"q":"aio"}' },
        },
      ],
      metadata: { cohereResponseId: "response-1" },
    });
  });

  it("decodes byte-split text, thinking, tool calls and message-end usage", () => {
    const events = decode([
      {
        type: "content-delta",
        delta: { message: { content: { thinking: "分析" } } },
      },
      {
        type: "content-delta",
        delta: { message: { content: { text: "结果" } } },
      },
      {
        type: "tool-call-start",
        index: 0,
        delta: {
          message: {
            tool_calls: {
              id: "tool_1",
              function: { name: "lookup", arguments: "" },
            },
          },
        },
      },
      {
        type: "tool-call-delta",
        index: 0,
        delta: {
          message: { tool_calls: { function: { arguments: '{"q":"aio"}' } } },
        },
      },
      { type: "tool-call-end", index: 0 },
      {
        type: "message-end",
        delta: {
          finish_reason: "TOOL_CALL",
          usage: { tokens: { input_tokens: 5, output_tokens: 3 } },
        },
      },
    ]);

    expect(events).toEqual([
      { type: "reasoning-delta", delta: "分析" },
      { type: "text-delta", delta: "结果" },
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
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      },
      {
        type: "completed",
        response: {
          content: "结果",
          reasoningContent: "分析",
          finishReason: "tool_calls",
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
          toolCalls: [
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
    const decoder = new CohereChatStreamDecoder();
    const fixture = 'data: {"type":"error","message":"rate limited"}\n\n';
    expect(() => decoder.push(new TextEncoder().encode(fixture))).toThrow(
      "Cohere Chat Error: rate limited"
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
  const decoder = new CohereChatStreamDecoder();
  const events = [];
  for (const byte of new TextEncoder().encode(fixture)) {
    events.push(...decoder.push(new Uint8Array([byte])));
  }
  events.push(...decoder.finish());
  return events;
}
