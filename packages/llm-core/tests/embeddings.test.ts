import { describe, expect, it } from "vitest";
import {
  buildCohereEmbeddingRequest,
  buildGeminiEmbeddingRequest,
  buildOpenAiEmbeddingRequest,
  buildVertexEmbeddingRequest,
  formatGeminiEmbedding2Input,
  parseCohereEmbeddingResponse,
  parseGeminiEmbeddingResponse,
  parseOpenAiEmbeddingResponse,
  parseVertexEmbeddingResponse,
  type EmbeddingRequest,
  type ProviderProfile,
  type WireResponse,
} from "../src";

const request: EmbeddingRequest = {
  model: "embedding-model",
  input: ["one", "two"],
  dimensions: 256,
  taskType: "RETRIEVAL_DOCUMENT",
  title: "Document",
  requestId: "request-1",
};

describe("shared Embedding providers", () => {
  it("builds and parses OpenAI embeddings", async () => {
    const profile: ProviderProfile = {
      provider: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "secret-key",
    };
    expect(buildOpenAiEmbeddingRequest(profile, request)).toEqual({
      method: "POST",
      url: "https://api.openai.com/v1/embeddings",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-key",
        "X-Request-ID": "request-1",
      },
      body: {
        kind: "json",
        value: {
          model: "embedding-model",
          input: ["one", "two"],
          dimensions: 256,
        },
      },
      streaming: false,
    });
    await expect(
      parseOpenAiEmbeddingResponse(
        response({
          data: [{ index: 0, embedding: [0.1, 0.2] }],
          model: "embedding-model-v2",
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
        request
      )
    ).resolves.toEqual({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
      model: "embedding-model-v2",
      usage: { promptTokens: 3, totalTokens: 3 },
    });
  });

  it("builds Gemini 2 batch instructions and parses vectors", async () => {
    const profile: ProviderProfile = {
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "gemini-key",
    };
    const geminiRequest = {
      ...request,
      model: "gemini-embedding-2-preview",
    };
    const wire = buildGeminiEmbeddingRequest(profile, geminiRequest);
    expect(wire.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:batchEmbedContents?key=gemini-key"
    );
    expect((wire.body as any).value.requests).toEqual([
      {
        model: "models/gemini-embedding-2-preview",
        content: {
          parts: [{ text: "title: Document | text: one" }],
        },
        outputDimensionality: 256,
      },
      {
        model: "models/gemini-embedding-2-preview",
        content: {
          parts: [{ text: "title: Document | text: two" }],
        },
        outputDimensionality: 256,
      },
    ]);
    expect(formatGeminiEmbedding2Input("query", "RETRIEVAL_QUERY")).toBe(
      "task: search result | query: query"
    );
    await expect(
      parseGeminiEmbeddingResponse(
        response({ embeddings: [{ values: [0.1] }, { values: [0.2] }] }),
        geminiRequest
      )
    ).resolves.toEqual(
      expect.objectContaining({
        data: [
          { object: "embedding", index: 0, embedding: [0.1] },
          { object: "embedding", index: 1, embedding: [0.2] },
        ],
      })
    );
  });

  it("maps Cohere task and encoding fields with billed usage", async () => {
    const profile: ProviderProfile = {
      provider: "cohere",
      baseUrl: "https://api.cohere.com/v1",
      apiKey: "cohere-key",
    };
    const cohereRequest: EmbeddingRequest = {
      ...request,
      encodingFormat: "int8",
    };
    const wire = buildCohereEmbeddingRequest(profile, cohereRequest);
    expect(wire.url).toBe("https://api.cohere.com/v2/embed");
    expect(wire.body).toEqual({
      kind: "json",
      value: {
        model: "embedding-model",
        texts: ["one", "two"],
        input_type: "search_document",
        embedding_types: ["int8"],
      },
    });
    await expect(
      parseCohereEmbeddingResponse(
        response({
          embeddings: {
            int8: [
              [1, 2],
              [3, 4],
            ],
          },
          meta: { billed_units: { input_tokens: 7 } },
        }),
        cohereRequest
      )
    ).resolves.toEqual(
      expect.objectContaining({
        usage: { promptTokens: 7, totalTokens: 7 },
        data: [
          { object: "embedding", index: 0, embedding: [1, 2] },
          { object: "embedding", index: 1, embedding: [3, 4] },
        ],
      })
    );
  });

  it("builds the full Vertex predict resource and parses predictions", async () => {
    const profile: ProviderProfile = {
      provider: "vertexai",
      baseUrl: "https://us-central1-aiplatform.googleapis.com",
      apiKey: "access-token",
      options: { projectId: "aio-project", location: "us-central1" },
    };
    const wire = buildVertexEmbeddingRequest(profile, request);
    expect(wire.url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/aio-project/locations/us-central1/publishers/google/models/embedding-model:predict"
    );
    expect((wire.body as any).value.instances).toEqual([
      {
        content: "one",
        task_type: "RETRIEVAL_DOCUMENT",
        title: "Document",
      },
      {
        content: "two",
        task_type: "RETRIEVAL_DOCUMENT",
        title: "Document",
      },
    ]);
    await expect(
      parseVertexEmbeddingResponse(
        response({
          predictions: [
            { embeddings: { values: [0.1] } },
            { embeddings: { values: [0.2] } },
          ],
        }),
        request
      )
    ).resolves.toEqual(
      expect.objectContaining({
        data: [
          { object: "embedding", index: 0, embedding: [0.1] },
          { object: "embedding", index: 1, embedding: [0.2] },
        ],
      })
    );
  });
});

function response(value: unknown): WireResponse {
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: (async function* () {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      for (const byte of bytes) yield new Uint8Array([byte]);
    })(),
  };
}
