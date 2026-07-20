import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  search: vi.fn(),
  store: {
    config: {
      defaultEmbeddingModel: "profile-a:model-a",
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
  createModuleErrorHandler: () => ({ wrapAsync: vi.fn() }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ profiles: { value: [] } }),
}));
vi.mock("../logic/orchestrator", () => ({
  SearchOrchestrator: class {
    search = mocks.search;
  },
}));
vi.mock("../stores/recallCollectionStore", () => ({
  useRecallCollectionStore: () => mocks.store,
}));
vi.mock("../utils/vectorCache", () => ({
  vectorCacheManager: { getVector: vi.fn() },
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

import { searchWithCache } from "../services/api";

describe("searchWithCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ results: [], vector: null });
  });

  it("includes normalized fusion weights in the retrieval cache input", async () => {
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
        input: expect.objectContaining({ fusionWeights: [0.7, 0.3] }),
      })
    );
  });
});
