import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "../../../types";
import { mobileLlmTransport } from "../../transports/mobile";
import { callClaudeApi } from "../claude";

const profile: LlmProfile = {
  id: "claude-profile",
  name: "Claude",
  type: "claude",
  baseUrl: "https://api.anthropic.com",
  apiKeys: ["test-key"],
  customHeaders: { "X-Tenant": "tenant-a" },
  enabled: true,
  models: [],
};

afterEach(() => vi.restoreAllMocks());

describe("mobile Claude facade", () => {
  it("uses the shared builder and maps a non-streaming response", async () => {
    const send = vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: chunks(
        JSON.stringify({
          id: "msg_1",
          model: "claude-sonnet-4-5",
          type: "message",
          content: [{ type: "text", text: "Done." }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 4, output_tokens: 2 },
        })
      ),
    });

    const response = await callClaudeApi(profile, {
      profileId: profile.id,
      modelId: "claude-sonnet-4-5",
      messages: [
        { role: "system", content: "Be concise." },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Inspect.",
              cacheControl: { type: "ephemeral" },
            },
            {
              type: "image",
              imageBase64: "aW1hZ2U=",
              mimeType: "image/png",
            },
          ],
        },
      ],
      maxTokens: 512,
      stopSequences: ["END"],
      claudeMetadata: { user_id: "user-1" },
      thinkingEnabled: true,
      thinkingBudget: 256,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.anthropic.com/v1/messages",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": expect.stringContaining("thinking-2025-12-05"),
          "X-Tenant": "tenant-a",
        }),
        body: {
          kind: "json",
          value: expect.objectContaining({
            model: "claude-sonnet-4-5",
            system: "Be concise.",
            max_tokens: 512,
            stop_sequences: ["END"],
            metadata: { user_id: "user-1" },
            thinking: { type: "enabled", budget_tokens: 256 },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Inspect.",
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
                ],
              },
            ],
          }),
        },
        streaming: false,
      }),
      expect.objectContaining({ requestId: expect.any(String) })
    );
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        finishReason: "end_turn",
        stopSequence: null,
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      })
    );
  });

  it("keeps text and thinking callbacks separate with split stream usage", async () => {
    const fixture = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Think."}}\r\n\r\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Done."}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":3}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].join("");
    vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/event-stream" },
      body: chunks(fixture, 1),
    });
    const onStream = vi.fn();
    const onReasoningStream = vi.fn();

    const response = await callClaudeApi(profile, {
      profileId: profile.id,
      modelId: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "Think." }],
      stream: true,
      onStream,
      onReasoningStream,
    });

    expect(onStream).toHaveBeenCalledWith("Done.");
    expect(onReasoningStream).toHaveBeenCalledWith("Think.");
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        reasoningContent: "Think.",
        finishReason: "end_turn",
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        isStream: true,
      })
    );
  });
});

async function* chunks(value: string, size = value.length) {
  const bytes = new TextEncoder().encode(value);
  for (let index = 0; index < bytes.length; index += size) {
    yield bytes.slice(index, index + size);
  }
}
