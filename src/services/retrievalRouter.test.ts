import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeRetrieval } from "./retrievalRouter";

const searchWithCache = vi.hoisted(() => vi.fn());
const searchKnowledge = vi.hoisted(() => vi.fn());

vi.mock("@/tools/recall/services/api", () => ({ searchWithCache }));
vi.mock("@/tools/knowledge-base/service", () => ({ searchKnowledge }));

function recall(id: string, score: number) {
  return {
    entry: { id, content: `recall-${id}` },
    score,
    matchType: "vector",
    highlight: null,
    recallId: "recall-1",
    recallName: "Memory",
  };
}

function knowledge(id: string, score: number) {
  return {
    sourceType: "knowledge",
    libraryId: "library-1",
    libraryName: "Docs",
    documentId: "document-1",
    sourcePath: "docs/a.md",
    title: "A",
    chunkId: id,
    chunkIndex: 0,
    content: `knowledge-${id}`,
    score,
    signals: [],
  };
}

describe("retrievalRouter", () => {
  beforeEach(() => {
    searchWithCache.mockReset();
    searchKnowledge.mockReset();
  });

  it("routes knowledge as a first-class single domain", async () => {
    searchKnowledge.mockResolvedValue([knowledge("k1", 0.7)]);
    const response = await routeRetrieval({
      mode: "knowledge",
      limit: 3,
      knowledge: {
        query: "query",
        libraryIds: ["library-1"],
        strategy: "keyword",
        limit: 8,
        minScore: 0,
      },
    });
    expect(response.results[0]).toMatchObject({
      sourceType: "knowledge",
      sourcePath: "docs/a.md",
      fusion: { method: "single-domain" },
    });
  });

  it("preserves domain quotas and fuses ranks without comparing raw scores", async () => {
    searchWithCache.mockResolvedValue({
      results: [recall("r1", 0.01), recall("r2", 0.99)],
      vector: null,
    });
    searchKnowledge.mockResolvedValue([
      knowledge("k1", 0.95),
      knowledge("k2", 0.1),
    ]);
    const response = await routeRetrieval({
      mode: "mixed",
      limit: 4,
      recallQuota: 2,
      knowledgeQuota: 2,
      recall: { primaryQuery: "query", recallIds: ["recall-1"] },
      knowledge: {
        query: "query",
        libraryIds: ["library-1"],
        strategy: "keyword",
        limit: 8,
        minScore: 0,
      },
    });
    expect(
      response.results.filter((item) => item.sourceType === "recall")
    ).toHaveLength(2);
    expect(
      response.results.filter((item) => item.sourceType === "knowledge")
    ).toHaveLength(2);
    const recallFirst = response.results.find((item) => item.itemId === "r1");
    const knowledgeFirst = response.results.find(
      (item) => item.itemId === "k1"
    );
    expect(recallFirst?.fusion.rrfScore).toBe(knowledgeFirst?.fusion.rrfScore);
    expect(recallFirst?.fusion.rawScore).toBe(0.01);
    expect(response.fusionMethod).toBe("rrf");
  });
});
