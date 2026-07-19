import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRetrievalRequest, executeRetrieval } from "../retrieval.registry";

const routeRetrieval = vi.hoisted(() => vi.fn());
const authorizeKnowledgeLibraryScope = vi.hoisted(() => vi.fn());

vi.mock("@/services/retrievalRouter", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/retrievalRouter")>();
  return { ...original, routeRetrieval };
});

vi.mock("@/tools/knowledge-base/services/application", () => ({
  resolveKnowledgeApplicationContext: (context: any) => {
    if (!context?.agent) {
      throw Object.assign(new Error("missing agent"), {
        code: "KNOWLEDGE_DISABLED",
      });
    }
    return {
      agentId: context.agent.id,
      access: context.agent.knowledgeAccess,
    };
  },
  authorizeKnowledgeLibraryScope,
}));

describe("retrieval registry", () => {
  beforeEach(() => {
    routeRetrieval.mockReset();
    routeRetrieval.mockResolvedValue({
      mode: "mixed",
      results: [],
      quotas: { recall: 3, knowledge: 3 },
      fusionMethod: "rrf",
    });
    authorizeKnowledgeLibraryScope.mockReset();
    authorizeKnowledgeLibraryScope.mockImplementation(
      async (_context, libraryIds) => libraryIds
    );
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
    await executeRetrieval(
      {
        query: "install",
        mode: "knowledge",
        libraryIds: ["library-1"],
      },
      {
        agent: {
          id: "agent-1",
          knowledgeAccess: {
            enabled: true,
            allowedLibraryIds: ["library-1"],
            allowSearchAll: false,
            allowDocumentRead: false,
            allowResearch: false,
          },
        },
      } as any
    );

    expect(routeRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "knowledge",
        knowledge: expect.objectContaining({ libraryIds: ["library-1"] }),
        recall: undefined,
      })
    );
    expect(authorizeKnowledgeLibraryScope).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1" }),
      ["library-1"]
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

  it("keeps Recall-only composition available without Knowledge context", async () => {
    await executeRetrieval({ query: "memory", mode: "recall" });
    expect(routeRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "recall", knowledge: undefined })
    );
    expect(authorizeKnowledgeLibraryScope).not.toHaveBeenCalled();
  });

  it("rejects Knowledge composition without an Agent permission context", async () => {
    await expect(
      executeRetrieval({ query: "docs", mode: "knowledge" })
    ).rejects.toMatchObject({ code: "KNOWLEDGE_DISABLED" });
    expect(routeRetrieval).not.toHaveBeenCalled();
  });
});
