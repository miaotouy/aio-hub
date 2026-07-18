import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useKnowledgeStore } from "./store";

const serviceMocks = vi.hoisted(() => ({
  searchDetailed: vi.fn(),
}));

vi.mock("./service", () => ({
  applyKnowledgeLibraryConfig: vi.fn(),
  createKnowledgeLibrary: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  deleteKnowledgeLibrary: vi.fn(),
  getKnowledgeIndexStatus: vi.fn(),
  ingestKnowledgeDocument: vi.fn(),
  listKnowledgeChunks: vi.fn(),
  listKnowledgeDocuments: vi.fn(),
  listKnowledgeLibraries: vi.fn(),
  rebuildKnowledgeLibrary: vi.fn(),
  searchKnowledgeDetailed: serviceMocks.searchDetailed,
  updateKnowledgeLibrary: vi.fn(),
}));

vi.mock("./ingestQueue", () => ({
  processKnowledgeImportQueue: vi.fn(),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

describe("Knowledge store search", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    serviceMocks.searchDetailed.mockReset();
  });

  it("searches the explicit multi-library scope and preserves execution traces", async () => {
    const result = {
      sourceType: "knowledge" as const,
      libraryId: "library-b",
      libraryName: "Library B",
      documentId: "document-b",
      sourcePath: "b.md",
      title: "B",
      chunkId: "chunk-b",
      chunkIndex: 0,
      content: "result",
      score: 0.75,
      signals: [],
    };
    const trace = {
      libraryIds: ["library-a", "library-b"],
      requestedStrategy: "auto" as const,
      actualStrategy: "keyword" as const,
      degradationReason: "semantic unavailable",
    };
    serviceMocks.searchDetailed.mockResolvedValue({
      results: [result],
      traces: [trace],
    });
    const store = useKnowledgeStore();
    store.activeLibraryId = "library-a";

    await expect(
      store.search("  query  ", "auto", 7, ["library-a", "library-b"])
    ).resolves.toEqual([result]);

    expect(serviceMocks.searchDetailed).toHaveBeenCalledWith({
      query: "query",
      libraryIds: ["library-a", "library-b"],
      strategy: "auto",
      limit: 7,
      minScore: 0,
    });
    expect(store.searchTraces).toEqual([trace]);
    expect(store.selectedResultId).toBe("chunk-b");
    expect(store.searching).toBe(false);
  });

  it("clears stale results and traces when the query is empty", async () => {
    const store = useKnowledgeStore();
    store.activeLibraryId = "library-a";
    store.results = [{ chunkId: "stale" } as (typeof store.results)[number]];
    store.searchTraces = [
      {
        libraryIds: ["library-a"],
        requestedStrategy: "auto",
        actualStrategy: "keyword",
      },
    ];

    await expect(store.search("   ")).resolves.toEqual([]);

    expect(store.results).toEqual([]);
    expect(store.searchTraces).toEqual([]);
    expect(serviceMocks.searchDetailed).not.toHaveBeenCalled();
  });
});
