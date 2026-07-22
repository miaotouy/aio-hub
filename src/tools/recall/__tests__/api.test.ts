import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  compilePipeline: vi.fn(),
  executePipeline: vi.fn(),
  wrapAsync: vi.fn(),
  store: {
    config: {
      defaultEmbeddingModel: "profile-a:model-a",
      embeddingAssetGeneration: {
        schemaVersion: 1,
        modelIdentity: "profile-a:model-a",
        generationId: "generation-a",
        activatedAt: 1,
      },
      cache: { retrievalCacheMaxItems: 200 },
    },
    engines: [],
    globalStats: { allDiscoveredTags: [] },
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: (callback: () => Promise<unknown>, options: unknown) =>
      mocks.wrapAsync(callback, options),
  }),
}));
vi.mock("../stores/recallCollectionStore", () => ({
  useRecallCollectionStore: () => mocks.store,
}));
vi.mock("../services/retrievalPipeline", () => ({
  compileRetrievalPipeline: mocks.compilePipeline,
  executeRetrievalPipeline: mocks.executePipeline,
}));
vi.mock("../utils/queryPreProcessor", () => ({
  preprocessQuery: (query: string) => ({
    cleanedQuery: query,
    matchedTags: [],
  }),
}));
vi.mock("../logic/placeholderRetrieval", () => ({
  resolvePlaceholderRetrieval: vi.fn(),
}));

import { search, searchWithCache } from "../services/api";

describe("searchWithCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wrapAsync.mockImplementation((callback: () => Promise<unknown>) =>
      callback()
    );
    mocks.compilePipeline.mockResolvedValue({
      presetId: "comprehensive",
      runId: "run-1",
      result: {
        configHash: "config-v1",
        algorithmVersion: "pipeline-v1",
        externalRequirements: [{ kind: "query-embedding", blocking: true }],
      },
    });
    mocks.executePipeline.mockResolvedValue({
      results: [],
      configHash: "config-v1",
    });
    mocks.invoke.mockResolvedValue(null);
  });

  it("keys cache entries by the compiled pipeline and forwards dual queries", async () => {
    await searchWithCache({
      primaryQuery: "primary",
      secondaryQuery: "secondary",
      fusionWeights: [7, 3],
      recallIds: ["collection-a"],
      enableCache: true,
    });

    expect(mocks.invoke).toHaveBeenCalledWith(
      "recall_retrieval_cache_get",
      expect.objectContaining({
        input: expect.objectContaining({
          fusionWeights: [0.7, 0.3],
          presetId: "comprehensive",
          configHash: "config-v1",
          embeddingIdentity: "profile-a:model-a",
          assetGeneration: "generation-a",
          algorithmVersion: "pipeline-v1",
        }),
      })
    );
    expect(mocks.executePipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "primary",
        secondaryQuery: "secondary",
        fusionWeights: [0.7, 0.3],
        presetId: "comprehensive",
      }),
      expect.objectContaining({ runId: "run-1" })
    );
  });

  it("does not resolve an embedding identity for algorithmic recall", async () => {
    mocks.compilePipeline.mockResolvedValue({
      presetId: "algorithmic",
      runId: "run-1",
      result: {
        configHash: "config-v1",
        algorithmVersion: "pipeline-v1",
        externalRequirements: [],
      },
    });

    await searchWithCache({
      primaryQuery: "offline",
      recallIds: ["collection-a"],
      presetId: "algorithmic",
      enableCache: true,
    });

    expect(mocks.invoke).toHaveBeenCalledWith(
      "recall_retrieval_cache_get",
      expect.objectContaining({
        input: expect.objectContaining({
          presetId: "algorithmic",
          embeddingIdentity: "",
          assetGeneration: "",
        }),
      })
    );
  });

  it("ignores caller model overrides and keys by the global active model", async () => {
    await searchWithCache({
      primaryQuery: "global model only",
      recallIds: ["collection-a"],
      enableCache: true,
      modelId: "caller:model-b",
    } as Parameters<typeof searchWithCache>[0] & { modelId: string });

    expect(mocks.invoke).toHaveBeenCalledWith(
      "recall_retrieval_cache_get",
      expect.objectContaining({
        input: expect.objectContaining({
          embeddingIdentity: "profile-a:model-a",
          assetGeneration: "generation-a",
        }),
      })
    );
    expect(mocks.executePipeline).toHaveBeenCalledWith(
      expect.not.objectContaining({ modelId: expect.anything() }),
      expect.anything()
    );
  });

  it("keeps the ordinary service facade non-interactive for background callers", async () => {
    await search({
      query: "background query",
      recallIds: ["collection-a"],
      presetId: "algorithmic",
    });

    expect(mocks.wrapAsync).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ showToUser: false })
    );
  });
});
