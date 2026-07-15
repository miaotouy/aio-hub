import { describe, expect, it, vi } from "vitest";
import {
  executeProviderRequest,
  executeProviderWireRequest,
  openAiCompatibleAdapter,
  type LlmTransport,
  type ProviderProfile,
  type WireRequest,
} from "../src";

const profile: ProviderProfile = {
  provider: "openai-compatible",
  baseUrl: "https://example.com/v1",
  apiKey: "test-key",
};

const request = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "Hello" }],
};

describe("provider executor", () => {
  it("builds, sends and parses a non-streaming request", async () => {
    const send = vi.fn<LlmTransport["send"]>(async () => ({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: chunks(
        JSON.stringify({
          choices: [{ message: { content: "Done" }, finish_reason: "stop" }],
        })
      ),
    }));

    await expect(
      executeProviderRequest({
        adapter: openAiCompatibleAdapter,
        profile,
        request,
        transport: { send },
        transportOptions: { requestId: "request-1" },
      })
    ).resolves.toEqual(expect.objectContaining({ content: "Done" }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/v1/chat/completions",
        streaming: false,
      }),
      { requestId: "request-1" }
    );
  });

  it("decodes a streaming wire response and emits canonical events", async () => {
    const wireRequest: WireRequest = {
      method: "POST",
      url: "https://example.com/v1/chat/completions",
      headers: {},
      body: { kind: "json", value: {} },
      streaming: true,
    };
    const onEvent = vi.fn();
    const fixture = [
      'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const result = await executeProviderWireRequest({
      adapter: openAiCompatibleAdapter,
      request: { ...request, stream: true },
      wireRequest,
      transport: {
        send: async () => ({
          status: 200,
          statusText: "OK",
          headers: { "content-type": "text/event-stream" },
          body: chunks(fixture, 1),
        }),
      },
      transportOptions: { requestId: "request-2" },
      onEvent,
    });

    expect(result).toEqual(
      expect.objectContaining({
        content: "done",
        reasoningContent: "think",
        finishReason: "stop",
      })
    );
    expect(onEvent).toHaveBeenCalledWith({
      type: "reasoning-delta",
      delta: "think",
    });
    expect(onEvent).toHaveBeenCalledWith({ type: "text-delta", delta: "done" });
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "completed",
      response: expect.objectContaining({ content: "done" }),
    });
  });
});

async function* chunks(value: string, size = value.length) {
  const bytes = new TextEncoder().encode(value);
  for (let index = 0; index < bytes.length; index += size) {
    yield bytes.slice(index, index + size);
  }
}
