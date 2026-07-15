import { describe, expect, it } from "vitest";
import {
  buildRerankRequest,
  parseRerankResponse,
  type WireResponse,
} from "../src";

describe("generic rerank provider", () => {
  it("builds a custom endpoint request without mutating canonical fields", () => {
    const request = buildRerankRequest(
      {
        provider: "openai",
        baseUrl: "https://example.com",
        apiKey: "secret",
        endpoints: { rerank: "/custom/rerank" },
      },
      {
        model: "rerank-model",
        query: "query",
        documents: ["a", "b"],
        requestId: "request-1",
      }
    );
    expect(request.url).toBe("https://example.com/custom/rerank");
    expect(request.headers.Authorization).toBe("Bearer secret");
    expect(request.body).toMatchObject({
      kind: "json",
      value: {
        model: "rerank-model",
        query: "query",
        documents: ["a", "b"],
        top_n: 2,
      },
    });
  });

  it("normalizes common provider result fields", async () => {
    const response: WireResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      body: bytes(
        JSON.stringify({
          results: [
            { index: 1, relevance_score: 0.9 },
            { index: 0, score: 0.5 },
          ],
        })
      ),
    };
    await expect(parseRerankResponse(response)).resolves.toEqual({
      results: [
        { index: 1, relevanceScore: 0.9, document: undefined },
        { index: 0, relevanceScore: 0.5, document: undefined },
      ],
      usage: undefined,
    });
  });
});

async function* bytes(value: string) {
  yield new TextEncoder().encode(value);
}
