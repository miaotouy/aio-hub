import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getVector: vi.fn(),
  store: { config: { defaultEmbeddingModel: "profile-a:model-a" } },
  profiles: { value: [{ id: "profile-a" }] },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ profiles: mocks.profiles }),
}));
vi.mock("@/utils/modelIdUtils", () => ({
  getProfileId: (value: string) => value.split(":")[0],
  getPureModelId: (value: string) => value.split(":")[1] || value,
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));
vi.mock("../../stores/recallCollectionStore", () => ({
  useRecallCollectionStore: () => mocks.store,
}));
vi.mock("../../utils/vectorCache", () => ({
  vectorCacheManager: { getVector: mocks.getVector },
}));

import {
  compileRetrievalPipeline,
  RetrievalPipelineBlockingError,
  executeRetrievalPipeline,
} from "../retrievalPipeline";

const compiled = (requirements: Array<{ kind: string }> = []) => ({
  runId: "run-1",
  valid: true,
  configHash: "hash-1",
  algorithmVersion: "v1",
  externalRequirements: requirements,
  issues: [],
});

const successfulRun = {
  outcome: "success",
  results: [],
  configHash: "hash-1",
};

describe("executeRetrievalPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profiles.value = [{ id: "profile-a" }];
  });

  it("runs algorithmic without resolving model or query vector", async () => {
    mocks.invoke
      .mockResolvedValueOnce(compiled())
      .mockResolvedValueOnce(successfulRun);

    await expect(
      executeRetrievalPipeline({
        query: "offline query",
        recallIds: ["recall-1"],
        presetId: "algorithmic",
      })
    ).resolves.toMatchObject({ results: [], configHash: "hash-1" });

    expect(mocks.getVector).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      2,
      "recall_run_retrieval_pipeline",
      expect.objectContaining({
        request: expect.objectContaining({
          presetId: "algorithmic",
          bundle: undefined,
        }),
      })
    );
  });

  it("prepares one query embedding bundle for comprehensive", async () => {
    mocks.getVector
      .mockResolvedValueOnce([0.1, 0.2])
      .mockResolvedValueOnce([0.3, 0.4]);
    mocks.invoke
      .mockResolvedValueOnce(compiled([{ kind: "query-embedding" }]))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(successfulRun);

    await executeRetrievalPipeline({
      query: "vector query",
      secondaryQuery: "previous reply",
      fusionWeights: [0.7, 0.3],
      recallIds: ["recall-1"],
      presetId: "comprehensive",
    });

    expect(mocks.getVector).toHaveBeenCalledTimes(2);
    const [, payload] =
      mocks.invoke.mock.calls[mocks.invoke.mock.calls.length - 1];
    const bundle = payload.request.bundle;
    expect(bundle).toMatchObject({
      embeddingSpace: "model-a",
      modelSignature: "profile-a:model-a",
    });
    expect(bundle.queryEmbedding[0]).toBeCloseTo(0.16);
    expect(bundle.queryEmbedding[1]).toBeCloseTo(0.26);
  });

  it("reuses a successful compilation for the matching pipeline run", async () => {
    mocks.invoke
      .mockResolvedValueOnce(compiled())
      .mockResolvedValueOnce(successfulRun);
    const compilation = await compileRetrievalPipeline("algorithmic", 5);

    await executeRetrievalPipeline(
      {
        query: "offline query",
        recallIds: ["recall-1"],
        presetId: "algorithmic",
        limit: 5,
      },
      compilation
    );

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it("blocks comprehensive before run when the embedding route is unavailable", async () => {
    mocks.profiles.value = [];
    mocks.invoke.mockResolvedValueOnce(compiled([{ kind: "query-embedding" }]));

    await expect(
      executeRetrievalPipeline({
        query: "vector query",
        recallIds: ["recall-1"],
        presetId: "comprehensive",
      })
    ).rejects.toMatchObject({
      name: RetrievalPipelineBlockingError.name,
      code: "query-embedding-unconfigured",
    });
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });

  it("uses algorithmic only when comprehensive declares an explicit fallback", async () => {
    mocks.profiles.value = [];
    mocks.invoke
      .mockResolvedValueOnce(compiled([{ kind: "query-embedding" }]))
      .mockResolvedValueOnce({ ...compiled(), runId: "run-2" })
      .mockResolvedValueOnce({ ...successfulRun, outcome: "fallback" });

    await expect(
      executeRetrievalPipeline({
        query: "vector query",
        recallIds: ["recall-1"],
        presetId: "comprehensive",
        fallbackPresetId: "algorithmic",
      })
    ).resolves.toMatchObject({
      outcome: "fallback",
      requestedPresetId: "comprehensive",
      actualPresetId: "algorithmic",
    });

    expect(mocks.invoke).toHaveBeenNthCalledWith(
      3,
      "recall_run_retrieval_pipeline",
      expect.objectContaining({
        request: expect.objectContaining({
          presetId: "algorithmic",
          requestedPresetId: "comprehensive",
          fallbackPresetId: "algorithmic",
          fallbackReason: "query-embedding-unconfigured",
          bundle: undefined,
        }),
      })
    );
  });
});
