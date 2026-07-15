import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "../../../types";
import { mobileLlmTransport } from "../../transports/mobile";
import { callOpenAiResponsesApi } from "../openai-responses";

const profile: LlmProfile = {
  id: "responses-profile",
  name: "Responses",
  type: "openai-responses",
  baseUrl: "https://api.openai.com/v1",
  apiKeys: ["test-key"],
  enabled: true,
  models: [],
};

afterEach(() => vi.restoreAllMocks());

describe("mobile OpenAI Responses facade", () => {
  it("uses the shared wire builder and maps a non-streaming response", async () => {
    const send = vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: chunks(
        JSON.stringify({
          id: "resp_1",
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "Done." }],
            },
          ],
          usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
        })
      ),
    });

    const response = await callOpenAiResponsesApi(profile, {
      profileId: profile.id,
      modelId: "gpt-5",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hello." },
      ],
      maxTokens: 512,
      responsesStore: false,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.openai.com/v1/responses",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
        body: {
          kind: "json",
          value: expect.objectContaining({
            model: "gpt-5",
            input: "Hello.",
            instructions: "Be concise.",
            max_output_tokens: 512,
            store: false,
            include: ["reasoning.encrypted_content"],
          }),
        },
        streaming: false,
      }),
      expect.objectContaining({ requestId: expect.any(String) })
    );
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        finishReason: "stop",
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      })
    );
  });

  it("keeps text, reasoning and partial image callbacks separate", async () => {
    const completed = {
      id: "resp_2",
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "Done." },
            { type: "reasoning_text", text: "Think." },
          ],
        },
      ],
    };
    const fixture = [
      'data: {"type":"response.reasoning_text.delta","delta":"Think."}\n\n',
      'data: {"type":"response.output_text.delta","delta":"Done."}\n\n',
      'data: {"type":"response.image_generation_call.partial_image","partial_image_b64":"aW1hZ2U=","partial_image_index":2}\n\n',
      `data: ${JSON.stringify({ type: "response.completed", response: completed })}\n\n`,
    ].join("");
    vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/event-stream" },
      body: chunks(fixture, 1),
    });
    const onStream = vi.fn();
    const onReasoningStream = vi.fn();
    const onPartialImage = vi.fn();

    const response = await callOpenAiResponsesApi(profile, {
      profileId: profile.id,
      modelId: "gpt-5",
      messages: [{ role: "user", content: "Think." }],
      stream: true,
      onStream,
      onReasoningStream,
      onPartialImage,
    });

    expect(onStream).toHaveBeenCalledWith("Done.");
    expect(onReasoningStream).toHaveBeenCalledWith("Think.");
    expect(onPartialImage).toHaveBeenCalledWith(
      "data:image/png;base64,aW1hZ2U=",
      2
    );
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        reasoningContent: "Think.",
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
