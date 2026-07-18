import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { searchKnowledge, searchKnowledgeDetailed } from "./service";
import type { KnowledgeLibrary, KnowledgeResult } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/llm-apis/embedding", () => ({ callEmbeddingApi: vi.fn() }));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: vi.fn(() => ({
    enabledProfiles: { value: [] },
    loadProfiles: vi.fn(),
  })),
}));

const invokeMock = vi.mocked(invoke);

function library(id: string): KnowledgeLibrary {
  return {
    id,
    name: id,
    embeddingModelId: "",
    activeEmbeddingSpaceId: "",
    embeddingRouteKey: "",
    dimension: 0,
    config: {},
    documentCount: 1,
    chunkCount: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function result(libraryId: string): KnowledgeResult {
  return {
    sourceType: "knowledge",
    libraryId,
    libraryName: libraryId,
    documentId: `${libraryId}-document`,
    sourcePath: `${libraryId}.md`,
    title: libraryId,
    chunkId: `${libraryId}-chunk`,
    chunkIndex: 0,
    content: libraryId,
    score: 0.5,
    signals: [],
  };
}

describe("searchKnowledge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("treats an empty library list as all libraries", async () => {
    const libraries = [library("library-a"), library("library-b")];
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "knowledge_initialize") return undefined;
      if (command === "knowledge_list_libraries") return libraries;
      if (command === "knowledge_search") {
        const request = (args as { request: { libraryIds: string[] } }).request;
        return [result(request.libraryIds[0])];
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const results = await searchKnowledge({
      query: "query",
      libraryIds: [],
      strategy: "auto",
      limit: 10,
      minScore: 0,
    });

    expect(results.map((item) => item.libraryId)).toEqual([
      "library-a",
      "library-b",
    ]);
    const searchCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "knowledge_search"
    );
    expect(searchCalls).toHaveLength(2);
    expect(searchCalls.map(([, args]) => args)).toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          libraryIds: ["library-a"],
          strategy: "keyword",
        }),
      }),
      expect.objectContaining({
        request: expect.objectContaining({
          libraryIds: ["library-b"],
          strategy: "keyword",
        }),
      }),
    ]);
  });

  it("rejects an explicitly requested library that does not exist", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "knowledge_initialize") return undefined;
      if (command === "knowledge_list_libraries") return [library("library-a")];
      throw new Error(`Unexpected command: ${command}`);
    });

    await expect(
      searchKnowledge({
        query: "query",
        libraryIds: ["missing-library"],
        strategy: "semantic",
        limit: 10,
        minScore: 0,
      })
    ).rejects.toThrow("找不到 Knowledge library: missing-library");
  });

  it("rejects a precomputed semantic vector without a space ID", async () => {
    await expect(
      searchKnowledge({
        query: "query",
        libraryIds: ["library-a"],
        strategy: "semantic",
        limit: 10,
        minScore: 0,
        queryVector: [1, 0],
      })
    ).rejects.toThrow("预计算 Knowledge 查询向量必须指定 spaceId");

    expect(invokeMock).not.toHaveBeenCalledWith(
      "knowledge_search",
      expect.anything()
    );
  });

  it("reports the actual strategy and auto degradation reason", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "knowledge_initialize") return undefined;
      if (command === "knowledge_list_libraries") return [library("library-a")];
      if (command === "knowledge_search") return [result("library-a")];
      throw new Error(`Unexpected command: ${command}`);
    });

    const execution = await searchKnowledgeDetailed({
      query: "query",
      libraryIds: ["library-a"],
      strategy: "auto",
      limit: 5,
      minScore: 0,
    });

    expect(execution.traces).toEqual([
      expect.objectContaining({
        libraryIds: ["library-a"],
        requestedStrategy: "auto",
        actualStrategy: "keyword",
        degradationReason: expect.stringContaining("尚未建立语义索引"),
      }),
    ]);
  });
});
