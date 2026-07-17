import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRetrievalRequest, executeRetrieval } from "../retrieval.registry";

const routeRetrieval = vi.hoisted(() => vi.fn());

vi.mock("@/services/retrievalRouter", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/retrievalRouter")>();
  return { ...original, routeRetrieval };
});

describe("retrieval registry", () => {
  beforeEach(() => {
    routeRetrieval.mockReset();
    routeRetrieval.mockResolvedValue({
      mode: "mixed",
      results: [],
      quotas: { recall: 3, knowledge: 3 },
      fusionMethod: "rrf",
    });
  });

  it("infers mixed mode and normalizes VCP string arguments", () => {
    const request = buildRetrievalRequest({
      query: "  install bun  ",
      recallIds: "recall-1, recall-2",
      libraryIds: '["library-1"]',
      limit: "6",
      recallQuota: "3",
      knowledgeQuota: "3",
      knowledgeStrategy: "keyword",
    });

    expect(request).toMatchObject({
      mode: "mixed",
      limit: 6,
      recallQuota: 3,
      knowledgeQuota: 3,
      recall: {
        primaryQuery: "install bun",
        recallIds: ["recall-1", "recall-2"],
        profile: "semantic",
      },
      knowledge: {
        query: "install bun",
        libraryIds: ["library-1"],
        strategy: "keyword",
      },
    });
  });

  it("routes the normalized request through the production router", async () => {
    await executeRetrieval({
      query: "install",
      mode: "knowledge",
      libraryIds: ["library-1"],
    });

    expect(routeRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "knowledge",
        knowledge: expect.objectContaining({ libraryIds: ["library-1"] }),
        recall: undefined,
      })
    );
  });

  it("rejects invalid enums and numeric ranges", () => {
    expect(() =>
      buildRetrievalRequest({ query: "install", mode: "other" })
    ).toThrow("mode 参数无效");
    expect(() =>
      buildRetrievalRequest({ query: "install", minScore: 2 })
    ).toThrow("minScore 必须在 0 到 1 之间");
  });
});
