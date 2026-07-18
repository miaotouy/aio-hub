import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  applyKnowledgeLibraryConfig,
  createKnowledgeLibrary,
  searchKnowledge,
  searchKnowledgeDetailed,
  updateKnowledgeLibrary,
  vectorizeKnowledgeLibrary,
} from "./service";
import type {
  KnowledgeChunk,
  KnowledgeLibrary,
  KnowledgeResult,
} from "./types";
import type { LlmProfile } from "@/types/llm-profiles";
import {
  createDefaultKnowledgeLibraryConfig,
  createDefaultKnowledgeRuntimeConfig,
  knowledgeRuntimeConfigManager,
} from "./config";

const embeddingMocks = vi.hoisted(() => ({
  call: vi.fn(),
  loadProfiles: vi.fn(),
  enabledProfiles: { value: [] as unknown[] },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/llm-apis/embedding", () => ({
  callEmbeddingApi: embeddingMocks.call,
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: vi.fn(() => ({
    enabledProfiles: embeddingMocks.enabledProfiles,
    loadProfiles: embeddingMocks.loadProfiles,
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
    config: createDefaultKnowledgeLibraryConfig(),
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

function chunk(id: string): KnowledgeChunk {
  return {
    id,
    libraryId: "library-a",
    documentId: "document-a",
    sourcePath: "source.md",
    title: "Source",
    chunkIndex: Number(id.charAt(id.length - 1)) || 0,
    content: `content ${id}`,
    checksum: id,
    startOffset: 0,
    endOffset: 10,
  };
}

describe("searchKnowledge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    embeddingMocks.call.mockReset();
    embeddingMocks.loadProfiles.mockReset();
    embeddingMocks.enabledProfiles.value = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("sends versioned config snapshots through create and update commands", async () => {
    const created = library("library-a");
    invokeMock.mockImplementation(async (command) => {
      if (command === "knowledge_initialize") return undefined;
      if (command === "knowledge_create_library") return created;
      if (command === "knowledge_update_library") return created;
      if (command === "knowledge_apply_library_config") return 2;
      throw new Error(`Unexpected command: ${command}`);
    });

    const config = createDefaultKnowledgeLibraryConfig();
    await createKnowledgeLibrary("Docs", "Description", config);
    await updateKnowledgeLibrary("library-a", {
      name: "Renamed",
      description: "Updated",
    });
    await applyKnowledgeLibraryConfig("library-a", config);

    expect(invokeMock).toHaveBeenCalledWith("knowledge_create_library", {
      name: "Docs",
      description: "Description",
      config,
    });
    expect(invokeMock).toHaveBeenCalledWith("knowledge_update_library", {
      libraryId: "library-a",
      name: "Renamed",
      description: "Updated",
    });
    expect(invokeMock).toHaveBeenCalledWith(
      "knowledge_apply_library_config",
      { libraryId: "library-a", config }
    );
  });

  it("snapshots the global default embedding route for a new library", async () => {
    const created = library("library-a");
    vi.spyOn(knowledgeRuntimeConfigManager, "load").mockResolvedValue({
      ...createDefaultKnowledgeRuntimeConfig(),
      defaultEmbeddingRouteKey: "profile-a:model-a",
    });
    invokeMock.mockImplementation(async (command) => {
      if (command === "knowledge_initialize") return undefined;
      if (command === "knowledge_create_library") return created;
      throw new Error(`Unexpected command: ${command}`);
    });

    await createKnowledgeLibrary("Defaulted");

    expect(invokeMock).toHaveBeenCalledWith(
      "knowledge_create_library",
      expect.objectContaining({
        config: expect.objectContaining({
          embedding: expect.objectContaining({
            enabled: true,
            routeKey: "profile-a:model-a",
          }),
          indexes: expect.objectContaining({ semantic: true }),
        }),
      })
    );
  });

  it("uses the configured batch size and request concurrency after confirming the space", async () => {
    const target = library("library-a");
    target.config.embedding.enabled = true;
    target.config.embedding.routeKey = "profile-a:model-a";
    target.config.embedding.requestedDimensions = 256;
    target.config.indexes.semantic = true;
    embeddingMocks.enabledProfiles.value = [
      {
        id: "profile-a",
        models: [
          {
            id: "model-a",
            modelIdentity: {
              canonicalId: "openai/text-embedding-test",
              source: "manual",
            },
          },
        ],
      } as unknown as LlmProfile,
    ];
    vi.spyOn(knowledgeRuntimeConfigManager, "load").mockResolvedValue({
      ...createDefaultKnowledgeRuntimeConfig(),
      embeddingBatchSize: 1,
      embeddingRequestConcurrency: 2,
      embeddingMaxRetries: 0,
    });
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    embeddingMocks.call.mockImplementation(
      async (
        _profile: LlmProfile,
        options: { input: string | string[]; modelId: string }
      ) => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeRequests -= 1;
      const input = Array.isArray(options.input) ? options.input : [options.input];
      return {
        data: input.map((_, index) => ({
          embedding: [1, index],
          index,
          object: "embedding" as const,
        })),
        model: options.modelId,
        usage: { promptTokens: 1, totalTokens: 1 },
        object: "list" as const,
      };
      }
    );
    invokeMock.mockImplementation(async (command) => {
      if (command === "knowledge_initialize") return undefined;
      if (command === "knowledge_list_libraries") return [target];
      if (command === "knowledge_list_chunks") {
        return [chunk("chunk-1"), chunk("chunk-2"), chunk("chunk-3")];
      }
      if (command === "knowledge_save_chunk_vectors") return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });
    const progress = vi.fn();

    await expect(
      vectorizeKnowledgeLibrary("library-a", { onProgress: progress })
    ).resolves.toBe(3);

    expect(maximumActiveRequests).toBe(2);
    expect(embeddingMocks.call).toHaveBeenCalledTimes(3);
    expect(embeddingMocks.call).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: "model-a",
        dimensions: 256,
        taskType: "RETRIEVAL_DOCUMENT",
        encodingFormat: "float",
      })
    );
    const saveCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "knowledge_save_chunk_vectors"
    );
    expect(saveCalls).toHaveLength(3);
    expect(
      saveCalls.map(([, args]) =>
        JSON.parse((args as { descriptorJson: string }).descriptorJson)
      )
    ).toEqual([
      expect.objectContaining({ dimensions: 2 }),
      expect.objectContaining({ dimensions: 2 }),
      expect.objectContaining({ dimensions: 2 }),
    ]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });
});
