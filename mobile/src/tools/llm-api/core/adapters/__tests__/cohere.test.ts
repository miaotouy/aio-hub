import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "../../../types";
import { mobileLlmTransport } from "../../transports/mobile";
import { callCohereApi } from "../cohere";

const profile: LlmProfile = {
  id: "cohere-profile",
  name: "Cohere",
  type: "cohere",
  baseUrl: "https://api.cohere.com/v1",
  apiKeys: ["test-key"],
  customHeaders: { "X-Tenant": "tenant-a" },
  enabled: true,
  models: [],
};

afterEach(() => vi.restoreAllMocks());

describe("mobile Cohere facade", () => {
  it("uses the shared V2 builder and keeps requestId out of the body", async () => {
    const send = vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: chunks(
        JSON.stringify({
          id: "response-1",
          finish_reason: "COMPLETE",
          message: { content: [{ type: "text", text: "Done." }] },
          usage: { tokens: { input_tokens: 4, output_tokens: 2 } },
        })
      ),
    });

    const response = await callCohereApi(profile, {
      profileId: profile.id,
      requestId: "request-1",
      modelId: "command-a-03-2025",
      messages: [
        { role: "system", content: "Be concise." },
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect." },
            {
              type: "image",
              imageBase64: "aW1hZ2U=",
              mimeType: "image/png",
            },
          ],
        },
      ],
      maxTokens: 512,
      topP: 0.8,
      thinkingEnabled: true,
      thinkingBudget: 256,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.cohere.com/v2/chat",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "X-Request-ID": "request-1",
          "X-Tenant": "tenant-a",
        }),
        body: {
          kind: "json",
          value: expect.objectContaining({
            model: "command-a-03-2025",
            max_tokens: 512,
            p: 0.8,
            thinking: { type: "enabled", budget_tokens: 256 },
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
          }),
        },
        streaming: false,
      }),
      expect.objectContaining({ requestId: "request-1" })
    );
    const wireBody = send.mock.calls[0][0].body;
    expect(wireBody?.kind).toBe("json");
    if (wireBody?.kind === "json" && !Array.isArray(wireBody.value)) {
      expect(wireBody.value).not.toHaveProperty("requestId");
    }
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        finishReason: "stop",
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      })
    );
  });

  it("maps text, thinking, usage and finish reason from the stream", async () => {
    const fixture = [
      'data: {"type":"content-delta","delta":{"message":{"content":{"thinking":"Think."}}}}\n\n',
      'data: {"type":"content-delta","delta":{"message":{"content":{"text":"Done."}}}}\r\n\r\n',
      'data: {"type":"message-end","delta":{"finish_reason":"COMPLETE","usage":{"tokens":{"input_tokens":5,"output_tokens":3}}}}\n\n',
    ].join("");
    vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/event-stream" },
      body: chunks(fixture, 1),
    });
    const onStream = vi.fn();
    const onReasoningStream = vi.fn();

    const response = await callCohereApi(profile, {
      profileId: profile.id,
      modelId: "command-a-03-2025",
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
        finishReason: "stop",
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
