import { describe, expect, it } from "vitest";
import {
  OPENAI_RESPONSES_ID_METADATA_KEY,
  OPENAI_RESPONSES_OUTPUT_METADATA_KEY,
  OPENAI_RESPONSES_REPLAY_ITEMS_METADATA_KEY,
  OpenAiResponsesStreamDecoder,
  buildOpenAiResponsesRequest,
  parseOpenAiResponsesResponseValue,
  type LlmRequest,
  type ProviderProfile,
} from "../src";

const profile: ProviderProfile = {
  provider: "openai-responses",
  baseUrl: "https://api.example.com",
  apiKey: "secret-key",
  headers: { "X-Tenant": "tenant-a" },
};

describe("OpenAI Responses provider adapter", () => {
  it("builds input items, replay state, tools and Responses parameters", () => {
    const replayItem = {
      id: "rs_1",
      type: "reasoning",
      encrypted_content: "encrypted-state",
    };
    const request: LlmRequest = {
      model: "gpt-5",
      stream: true,
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Think." },
        {
          role: "assistant",
          content: "Previous answer",
          metadata: {
            [OPENAI_RESPONSES_REPLAY_ITEMS_METADATA_KEY]: [replayItem],
          },
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect" },
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
      reasoningEffort: "high",
      store: false,
      include: ["file_search_call.results"],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Look up a value",
            parameters: { type: "object" },
            strict: true,
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "lookup" } },
      extensions: { vendor_flag: true },
    };

    expect(buildOpenAiResponsesRequest(profile, request)).toEqual({
      method: "POST",
      url: "https://api.example.com/v1/responses",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key",
        "X-Tenant": "tenant-a",
      },
      body: {
        kind: "json",
        value: {
          model: "gpt-5",
          input: [
            { role: "user", content: "Think." },
            replayItem,
            {
              role: "user",
              content: [
                { type: "input_text", text: "Inspect" },
                {
                  type: "input_image",
                  image_url: "data:image/png;base64,aW1hZ2U=",
                },
              ],
            },
          ],
          instructions: "Be concise.",
          temperature: 0.2,
          max_output_tokens: 2048,
          top_p: 0.8,
          tools: [
            {
              type: "function",
              name: "lookup",
              description: "Look up a value",
              parameters: { type: "object" },
              strict: true,
            },
          ],
          tool_choice: { type: "function", name: "lookup" },
          reasoning: { effort: "high" },
          include: ["file_search_call.results", "reasoning.encrypted_content"],
          store: false,
          vendor_flag: true,
          stream: true,
        },
      },
      streaming: true,
    });
  });

  it("parses output, reasoning state, tools, citations, images and usage", () => {
    const output = [
      { id: "rs_1", type: "reasoning", encrypted_content: "state" },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "Done.",
            annotations: [
              {
                type: "url_citation",
                start_index: 0,
                end_index: 5,
                url: "https://example.com",
                title: "Example",
              },
            ],
          },
          { type: "reasoning_text", text: "Reasoning." },
        ],
      },
      {
        id: "fc_1",
        call_id: "call_1",
        type: "function_call",
        name: "lookup",
        arguments: '{"q":"aio"}',
      },
      {
        type: "image_generation_call",
        result: "aW1hZ2U=",
        revised_prompt: "refined",
      },
    ];

    expect(
      parseOpenAiResponsesResponseValue({
        id: "resp_1",
        status: "completed",
        output,
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          total_tokens: 18,
          input_tokens_details: { cached_tokens: 3 },
          output_tokens_details: { reasoning_tokens: 4 },
        },
      })
    ).toEqual({
      content: "Done.",
      reasoningContent: "Reasoning.",
      refusal: null,
      finishReason: "tool_calls",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
        promptTokensDetails: { cachedTokens: 3 },
        completionTokensDetails: { reasoningTokens: 4 },
      },
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "lookup", arguments: '{"q":"aio"}' },
        },
      ],
      annotations: [
        {
          type: "url_citation",
          start_index: 0,
          end_index: 5,
          url: "https://example.com",
          title: "Example",
        },
      ],
      images: [
        {
          kind: "inline-base64",
          data: "aW1hZ2U=",
          contentType: "image/png",
          revisedPrompt: "refined",
        },
      ],
      metadata: {
        [OPENAI_RESPONSES_ID_METADATA_KEY]: "resp_1",
        [OPENAI_RESPONSES_OUTPUT_METADATA_KEY]: output,
      },
    });
  });

  it("decodes byte-split text, reasoning, partial images and completion", () => {
    const completed = {
      id: "resp_1",
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "结果" },
            { type: "reasoning_text", text: "分析" },
          ],
        },
      ],
      usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
    };
    const fixture = [
      'data: {"type":"response.reasoning_text.delta","delta":"分析"}\r\n\r\n',
      'data: {"type":"response.output_text.delta","delta":"结果"}\n\n',
      'data: {"type":"response.image_generation_call.partial_image","partial_image_b64":"aW1hZ2U=","partial_image_index":1}\n\n',
      `data: ${JSON.stringify({ type: "response.completed", response: completed })}\n\n`,
    ].join("");
    const decoder = new OpenAiResponsesStreamDecoder();
    const events = [];
    for (const byte of new TextEncoder().encode(fixture)) {
      events.push(...decoder.push(new Uint8Array([byte])));
    }
    events.push(...decoder.finish());

    expect(events).toEqual([
      { type: "reasoning-delta", delta: "分析" },
      { type: "text-delta", delta: "结果" },
      {
        type: "partial-image",
        index: 1,
        asset: {
          kind: "inline-base64",
          data: "aW1hZ2U=",
          contentType: "image/png",
        },
      },
      {
        type: "usage",
        usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      },
      {
        type: "completed",
        response: expect.objectContaining({
          content: "结果",
          reasoningContent: "分析",
          finishReason: "stop",
        }),
      },
    ]);
  });
});
