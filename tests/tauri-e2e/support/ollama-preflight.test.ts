import { describe, expect, it, vi } from "vitest";
import { preflightOllama } from "./ollama-preflight";

const MODEL = "lmstudio-nomic-embed-text:q4_k_m";

function tagsResponse(capabilities = ["embedding"]): Response {
  return Response.json({
    models: [{ model: MODEL, name: MODEL, capabilities }],
  });
}

function embeddingsResponse(embeddings: unknown[][]): Response {
  return Response.json({
    object: "list",
    data: embeddings.map((embedding, index) => ({
      object: "embedding",
      index,
      embedding,
    })),
    model: MODEL,
  });
}

describe("Ollama Recall E2E preflight", () => {
  it("checks tags and the product /v1/embeddings batch contract", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tagsResponse())
      .mockResolvedValueOnce(
        embeddingsResponse([
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ])
      );

    const result = await preflightOllama({
      baseUrl: "http://127.0.0.1:11434/ignored-path?token=secret",
      model: MODEL,
      fetchImpl,
    });

    expect(result).toEqual({
      status: "success",
      baseUrl: "http://127.0.0.1:11434",
      model: MODEL,
      dimension: 3,
      probeInputCount: 2,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({ method: "GET" })
    );
    const [embeddingUrl, embeddingInit] = fetchImpl.mock.calls[1];
    expect(embeddingUrl).toBe("http://127.0.0.1:11434/v1/embeddings");
    expect(embeddingInit).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      })
    );
    expect(JSON.parse(String(embeddingInit?.body))).toEqual({
      model: MODEL,
      input: [
        "AIO Hub Ollama embedding preflight probe one.",
        "AIO Hub Ollama embedding preflight probe two.",
      ],
    });
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("authorization");
  });

  it("returns skip by default and failure when Ollama is required", async () => {
    const offlineFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const skipped = await preflightOllama({
      baseUrl: "http://127.0.0.1:11434",
      model: MODEL,
      fetchImpl: offlineFetch,
    });
    const failed = await preflightOllama({
      baseUrl: "http://127.0.0.1:11434",
      model: MODEL,
      required: true,
      fetchImpl: offlineFetch,
    });

    expect(skipped).toMatchObject({
      status: "skip",
      reason: { code: "service-unavailable" },
    });
    expect(failed).toMatchObject({
      status: "failure",
      reason: { code: "service-unavailable" },
    });
    expect(JSON.stringify(failed)).not.toContain("offline");
  });

  it("rejects missing models and non-embedding capabilities before probing", async () => {
    const missingFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ models: [] }));
    const missing = await preflightOllama({
      baseUrl: "http://127.0.0.1:11434",
      model: MODEL,
      fetchImpl: missingFetch,
    });

    const completionFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tagsResponse(["completion", "tools"]));
    const completion = await preflightOllama({
      baseUrl: "http://127.0.0.1:11434",
      model: MODEL,
      fetchImpl: completionFetch,
    });

    expect(missing).toMatchObject({
      status: "skip",
      reason: { code: "model-not-found" },
    });
    expect(completion).toMatchObject({
      status: "skip",
      reason: { code: "embedding-capability-missing" },
    });
    expect(missingFetch).toHaveBeenCalledTimes(1);
    expect(completionFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "wrong response count",
      embeddings: [[0.1, 0.2]],
    },
    {
      name: "inconsistent dimensions",
      embeddings: [[0.1, 0.2], [0.3]],
    },
    {
      name: "non-numeric values",
      embeddings: [
        [0.1, 0.2],
        [0.3, "invalid"],
      ],
    },
    {
      name: "empty vectors",
      embeddings: [[], []],
    },
  ])("rejects $name", async ({ embeddings }) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tagsResponse())
      .mockResolvedValueOnce(embeddingsResponse(embeddings));

    const result = await preflightOllama({
      baseUrl: "http://127.0.0.1:11434",
      model: MODEL,
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: "skip",
      reason: { code: "invalid-embeddings-response" },
    });
  });

  it("rejects non-finite values without exposing response details", async () => {
    const nonFiniteResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { embedding: [0.1, 0.2] },
          { embedding: [0.3, Number.POSITIVE_INFINITY] },
        ],
      }),
    } as Response;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tagsResponse())
      .mockResolvedValueOnce(nonFiniteResponse);

    const result = await preflightOllama({
      baseUrl: "http://127.0.0.1:11434",
      model: MODEL,
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: "skip",
      reason: { code: "invalid-embeddings-response" },
    });
    expect(JSON.stringify(result)).not.toContain("Infinity");
  });

  it("rejects credential-bearing URLs before making requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await preflightOllama({
      baseUrl: "http://user:password@127.0.0.1:11434",
      model: MODEL,
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: "skip",
      reason: { code: "invalid-base-url" },
    });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
