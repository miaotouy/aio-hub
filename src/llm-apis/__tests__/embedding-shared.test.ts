import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import { callEmbeddingApi } from "../embedding";
import { desktopLlmTransport } from "../transports/desktop";

afterEach(() => vi.restoreAllMocks());

describe("desktop shared Embedding facade", () => {
  it("routes OpenAI embeddings through the desktop Transport", async () => {
    const profile = createProfile("openai", "https://api.openai.com");
    const send = vi.spyOn(desktopLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks({
        data: [{ index: 0, embedding: [0.1, 0.2] }],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 3, total_tokens: 3 },
      }),
    });

    const result = await callEmbeddingApi(profile, {
      modelId: "text-embedding-3-small",
      input: "hello",
      dimensions: 256,
    });

    expect(send.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        url: "https://api.openai.com/v1/embeddings",
        body: {
          kind: "json",
          value: {
            model: "text-embedding-3-small",
            input: "hello",
            dimensions: 256,
          },
        },
      })
    );
    expect(result.data[0].embedding).toEqual([0.1, 0.2]);
  });

  it("routes Vertex embeddings with configured project and location", async () => {
    const profile = createProfile(
      "vertexai",
      "https://us-central1-aiplatform.googleapis.com"
    );
    profile.options = { projectId: "aio-project", location: "us-central1" };
    const send = vi.spyOn(desktopLlmTransport, "send").mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: chunks({
        predictions: [{ embeddings: { values: [0.3, 0.4] } }],
      }),
    });

    const result = await callEmbeddingApi(profile, {
      modelId: "text-embedding-005",
      input: "hello",
      taskType: "RETRIEVAL_QUERY",
    });

    expect(send.mock.calls[0][0].url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/google/models/text-embedding-005:predict"
    );
    expect(result.data[0].embedding).toEqual([0.3, 0.4]);
  });
});

function createProfile(
  type: LlmProfile["type"],
  baseUrl: string
): LlmProfile {
  return {
    id: `${type}-profile`,
    name: type,
    type,
    baseUrl,
    apiKeys: ["test-key"],
    enabled: true,
    models: [],
  };
}

async function* chunks(value: unknown) {
  yield new TextEncoder().encode(JSON.stringify(value));
}
