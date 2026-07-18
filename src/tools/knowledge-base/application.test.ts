import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/services/types";
import {
  listKnowledgeForAgent,
  parseKnowledgeToolReadRequest,
  parseKnowledgeToolSearchRequest,
  readKnowledgeForAgent,
  resolveKnowledgeApplicationContext,
  searchKnowledgeForAgent,
} from "./application";
import type {
  AgentKnowledgeAccess,
  KnowledgeChunk,
  KnowledgeLibrary,
  KnowledgeLibraryIndexConfig,
  KnowledgeResult,
} from "./types";

const listKnowledgeLibraries = vi.hoisted(() => vi.fn());
const searchKnowledgeDetailed = vi.hoisted(() => vi.fn());
const listKnowledgeChunks = vi.hoisted(() => vi.fn());

vi.mock("./service", () => ({
  listKnowledgeLibraries,
  searchKnowledgeDetailed,
  listKnowledgeChunks,
}));

function libraryConfig(): KnowledgeLibraryIndexConfig {
  return {
    schemaVersion: 1,
    chunking: {
      strategy: "fixed",
      targetChars: 1000,
      overlapChars: 120,
    },
    embedding: {
      enabled: false,
      routeKey: "",
      queryTaskType: "RETRIEVAL_QUERY",
      documentTaskType: "RETRIEVAL_DOCUMENT",
      encodingFormat: "float",
      adapterContractVersion: 1,
    },
    indexes: { keyword: true, semantic: false, graph: true },
  };
}

function library(id: string, spaceId = ""): KnowledgeLibrary {
  return {
    id,
    name: `Library ${id}`,
    description: `${id} description`,
    embeddingModelId: "",
    activeEmbeddingSpaceId: spaceId,
    embeddingRouteKey: "",
    dimension: 0,
    config: libraryConfig(),
    documentCount: 2,
    chunkCount: 4,
    createdAt: 1,
    updatedAt: 1,
  };
}

function result(
  libraryId: string,
  chunkIndex: number,
  score: number,
  content = `${libraryId} content`
): KnowledgeResult {
  return {
    sourceType: "knowledge",
    libraryId,
    libraryName: `Library ${libraryId}`,
    documentId: `${libraryId}-document`,
    sourcePath: `${libraryId}/guide.md`,
    title: `${libraryId} Guide`,
    chunkId: `${libraryId}-chunk-${chunkIndex}`,
    chunkIndex,
    heading: "Guide",
    content,
    score,
    signals: [{ signalType: "knowledge-bm25", score }],
  };
}

function chunk(index: number, content = `chunk ${index}`): KnowledgeChunk {
  return {
    id: `library-a-chunk-${index}`,
    libraryId: "library-a",
    documentId: "library-a-document",
    sourcePath: "library-a/guide.md",
    title: "Guide",
    chunkIndex: index,
    content,
    checksum: `checksum-${index}`,
    heading: index === 1 ? "Target" : "Other",
    startOffset: index * 10,
    endOffset: index * 10 + content.length,
  };
}

const access: AgentKnowledgeAccess = {
  enabled: true,
  allowedLibraryIds: ["library-a", "library-b"],
  allowSearchAll: true,
  allowDocumentRead: true,
  allowResearch: false,
};

const applicationContext = { agentId: "agent-1", access };

describe("Knowledge application service", () => {
  beforeEach(() => {
    listKnowledgeLibraries.mockReset();
    listKnowledgeLibraries.mockResolvedValue([
      library("library-a", "space-a"),
      library("library-b", "space-b"),
    ]);
    searchKnowledgeDetailed.mockReset();
    listKnowledgeChunks.mockReset();
  });

  it("requires an Agent-owned tool context", () => {
    expect(() => resolveKnowledgeApplicationContext()).toThrowError(
      expect.objectContaining({ code: "KNOWLEDGE_DISABLED" })
    );
    expect(
      resolveKnowledgeApplicationContext({
        agent: { id: "agent-1", knowledgeAccess: access },
      } as ToolContext)
    ).toEqual(applicationContext);
  });

  it("lists only grants and keeps deleted libraries visible", async () => {
    listKnowledgeLibraries.mockResolvedValue([library("library-a")]);
    const libraries = await listKnowledgeForAgent(applicationContext);
    expect(libraries.map((item) => [item.id, item.availability])).toEqual([
      ["library-a", "available"],
      ["library-b", "deleted"],
    ]);
  });

  it("rejects omitted or unauthorized scope before search", async () => {
    await expect(
      searchKnowledgeForAgent(
        {
          agentId: "agent-1",
          access: { ...access, allowSearchAll: false },
        },
        { query: "query" }
      )
    ).rejects.toMatchObject({ code: "LIBRARY_ID_REQUIRED" });
    await expect(
      searchKnowledgeForAgent(applicationContext, {
        query: "query",
        libraryIds: ["library-other"],
      })
    ).rejects.toMatchObject({ code: "LIBRARY_UNAUTHORIZED" });
    expect(searchKnowledgeDetailed).not.toHaveBeenCalled();
  });

  it("rejects deleted grants and handles an empty authorized scope", async () => {
    listKnowledgeLibraries.mockResolvedValue([library("library-a")]);
    await expect(
      searchKnowledgeForAgent(applicationContext, {
        query: "query",
        libraryIds: ["library-b"],
      })
    ).rejects.toMatchObject({ code: "LIBRARY_DELETED" });
    expect(searchKnowledgeDetailed).not.toHaveBeenCalled();

    const empty = await searchKnowledgeForAgent(
      {
        agentId: "agent-1",
        access: { ...access, allowedLibraryIds: [] },
      },
      { query: "query" }
    );
    expect(empty.hits).toEqual([]);
    expect(empty.traces).toEqual([]);
  });

  it("searches different spaces independently and fuses ranked candidates", async () => {
    searchKnowledgeDetailed.mockImplementation(async (request) => {
      const libraryId = request.libraryIds[0];
      return {
        results: [
          result(libraryId, 0, libraryId === "library-a" ? 0.2 : 8.5),
          result(libraryId, 1, libraryId === "library-a" ? 0.1 : 4.2),
        ],
        traces: [
          {
            libraryIds: [libraryId],
            requestedStrategy: "auto",
            actualStrategy: libraryId === "library-a" ? "hybrid" : "keyword",
            degradationReason:
              libraryId === "library-b" ? "route unavailable" : undefined,
          },
        ],
      };
    });

    const response = await searchKnowledgeForAgent(applicationContext, {
      query: "install",
      strategy: "auto",
      topK: 3,
      maxChars: 1000,
    });

    expect(searchKnowledgeDetailed).toHaveBeenCalledTimes(2);
    expect(
      searchKnowledgeDetailed.mock.calls.map(([request]) => request.libraryIds)
    ).toEqual([["library-a"], ["library-b"]]);
    expect(response.traces.map((trace) => trace.actualStrategy)).toEqual([
      "hybrid",
      "keyword",
    ]);
    expect(response.hits[0]).toMatchObject({
      libraryId: "library-a",
      score: 0.2,
      rankScore: 1 / 61,
    });
    expect(response.hits[1]).toMatchObject({
      libraryId: "library-b",
      score: 8.5,
      rankScore: 1 / 61,
    });
    expect(response.hits.every((hit) => hit.signals.length > 0)).toBe(true);
  });

  it("parses filters and enforces the search character budget", async () => {
    searchKnowledgeDetailed.mockResolvedValue({
      results: [result("library-a", 0, 1, "x".repeat(1500))],
      traces: [
        {
          libraryIds: ["library-a"],
          requestedStrategy: "keyword",
          actualStrategy: "keyword",
        },
      ],
    });
    const request = parseKnowledgeToolSearchRequest({
      query: " install ",
      libraryIds: '["library-a"]',
      strategy: "keyword",
      filters: JSON.stringify({ pathPrefixes: ["library-a/"] }),
      maxChars: 1000,
    });
    const response = await searchKnowledgeForAgent(applicationContext, request);
    expect(response.hits[0].snippet).toHaveLength(1000);
    expect(response.truncated).toBe(true);
  });

  it("reads a bounded chunk neighborhood with source positioning", async () => {
    listKnowledgeChunks.mockResolvedValue([
      chunk(0, "0123456789"),
      chunk(1, "abcdefghij"),
      chunk(2, "ABCDEFGHIJ"),
    ]);
    const request = parseKnowledgeToolReadRequest({
      libraryId: "library-a",
      documentId: "library-a-document",
      chunkIndex: 1,
      neighborCount: 1,
      maxChars: 12,
    });
    const response = await readKnowledgeForAgent(applicationContext, request);
    expect(response.chunks.map((item) => item.chunkIndex)).toEqual([0, 1]);
    expect(response.chunks.map((item) => item.content)).toEqual([
      "0123456789",
      "ab",
    ]);
    expect(response.truncated).toBe(true);
    expect(response.nextChunkIndex).toBe(2);
  });

  it("rejects read when the capability is disabled", async () => {
    await expect(
      readKnowledgeForAgent(
        {
          agentId: "agent-1",
          access: { ...access, allowDocumentRead: false },
        },
        {
          libraryId: "library-a",
          chunkId: "library-a-chunk-0",
          maxChars: 100,
        }
      )
    ).rejects.toMatchObject({ code: "DOCUMENT_READ_FORBIDDEN" });
    expect(listKnowledgeChunks).not.toHaveBeenCalled();
  });

  it("supports heading and character-range reads and rejects invalid chunks", async () => {
    listKnowledgeChunks.mockResolvedValue([
      chunk(0, "0123456789"),
      chunk(1, "abcdefghij"),
    ]);

    const byHeading = await readKnowledgeForAgent(applicationContext, {
      libraryId: "library-a",
      documentId: "library-a-document",
      heading: "target",
      maxChars: 100,
    });
    expect(byHeading.chunks.map((item) => item.chunkIndex)).toEqual([1]);

    const byRange = await readKnowledgeForAgent(applicationContext, {
      libraryId: "library-a",
      documentId: "library-a-document",
      startOffset: 12,
      endOffset: 16,
      maxChars: 100,
    });
    expect(byRange.chunks[0].content).toBe("cdef");

    await expect(
      readKnowledgeForAgent(applicationContext, {
        libraryId: "library-a",
        chunkId: "missing-chunk",
        maxChars: 100,
      })
    ).rejects.toMatchObject({ code: "CHUNK_NOT_FOUND" });
  });

  it("keeps chunkId adjacency inside the matched document", async () => {
    listKnowledgeChunks.mockResolvedValue([
      chunk(0, "target"),
      {
        ...chunk(1, "other document"),
        id: "other-chunk-1",
        documentId: "other-document",
      },
    ]);
    const response = await readKnowledgeForAgent(applicationContext, {
      libraryId: "library-a",
      chunkId: "library-a-chunk-0",
      maxChars: 100,
    });
    expect(response.nextChunkIndex).toBeUndefined();
  });

  it("requires an explicit read selector and maxChars budget", () => {
    expect(() =>
      parseKnowledgeToolReadRequest({
        libraryId: "library-a",
        documentId: "library-a-document",
        maxChars: 100,
      })
    ).toThrowError(expect.objectContaining({ code: "READ_TARGET_REQUIRED" }));
    expect(() =>
      parseKnowledgeToolReadRequest({
        libraryId: "library-a",
        chunkId: "chunk-a",
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });
});
