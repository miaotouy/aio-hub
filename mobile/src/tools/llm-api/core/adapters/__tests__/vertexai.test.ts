import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "../../../types";
import { mobileLlmTransport } from "../../transports/mobile";
import { callVertexAiApi, callVertexAiEmbeddingApi } from "../vertexai";

const profile: LlmProfile = {
  id: "vertex-profile",
  name: "Vertex AI",
  type: "vertexai",
  baseUrl: "https://us-central1-aiplatform.googleapis.com",
  apiKeys: ["access-token"],
  customHeaders: { "X-Tenant": "tenant-a" },
  options: { projectId: "aio-project", location: "us-central1" },
  enabled: true,
  models: [],
};

afterEach(() => vi.restoreAllMocks());

describe("mobile Vertex AI facade", () => {
  it("uses the shared Google stream decoder and configured Vertex path", async () => {
    const fixture = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Think.","thought":true}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"Done."}]} ,"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3,"totalTokenCount":8}}\n\n',
    ].join("");
    const send = vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks(fixture, 1),
    });
    const onStream = vi.fn();
    const onReasoningStream = vi.fn();

    const response = await callVertexAiApi(profile, {
      profileId: profile.id,
      modelId: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Think." }],
      stream: true,
      onStream,
      onReasoningStream,
    });

    expect(send.mock.calls[0][0].url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/google/models/gemini-2.5-pro:streamGenerateContent"
    );
    expect(onStream).toHaveBeenCalledWith("Done.");
    expect(onReasoningStream).toHaveBeenCalledWith("Think.");
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        reasoningContent: "Think.",
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        isStream: true,
      })
    );
  });

  it("uses the shared Vertex Anthropic request and response parser", async () => {
    const send = vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks(
        JSON.stringify({
          content: [{ type: "text", text: "Done." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 4, output_tokens: 2 },
        })
      ),
    });

    const response = await callVertexAiApi(profile, {
      profileId: profile.id,
      modelId: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "Hello." }],
      maxTokens: 512,
    });

    expect(send.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        url: "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/anthropic/models/claude-sonnet-4-5:rawPredict",
        body: {
          kind: "json",
          value: expect.objectContaining({
            anthropic_version: "vertex-2023-10-16",
            max_tokens: 512,
          }),
        },
      })
    );
    expect(response).toEqual(
      expect.objectContaining({
        content: "Done.",
        finishReason: "end_turn",
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      })
    );
  });

  it("keeps the mobile Vertex Embedding compatibility entry on shared Core", async () => {
    const send = vi.spyOn(mobileLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks(
        JSON.stringify({
          predictions: [{ embeddings: { values: [0.3, 0.4] } }],
        })
      ),
    });
    const response = await callVertexAiEmbeddingApi(profile, {
      modelId: "text-embedding-005",
      input: "hello",
    });
    expect(send.mock.calls[0][0].url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/google/models/text-embedding-005:predict"
    );
    expect(response.data[0].embedding).toEqual([0.3, 0.4]);
  });
});

async function* chunks(value: string, size = value.length) {
  const bytes = new TextEncoder().encode(value);
  for (let index = 0; index < bytes.length; index += size) {
    yield bytes.slice(index, index + size);
  }
}
