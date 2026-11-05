import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  loadWorkspace: vi.fn(),
  saveWorkspace: vi.fn(),
}));

vi.mock("@/platform/native/core", () => ({ invoke: mocks.invoke }));
vi.mock("../utils/recallStorage", () => ({
  recallStorage: {
    loadWorkspace: mocks.loadWorkspace,
    saveWorkspace: mocks.saveWorkspace,
  },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { recallTimestampMs } from "../utils/recallTime";
import { DEFAULT_WORKSPACE_CONFIG } from "../config";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";

describe("recallCollectionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      version: "2.0.0",
      config: {
        ...structuredClone(DEFAULT_WORKSPACE_CONFIG),
        defaultEmbeddingModel: "profile-a:model-a",
      },
      bases: [],
    });
    mocks.invoke.mockResolvedValue([]);
  });

  it("registers the default model watcher only once across repeated loads", async () => {
    const store = useRecallCollectionStore();
    const validateVectorStatus = vi
      .spyOn(store, "validateVectorStatus")
      .mockResolvedValue(undefined);

    await store.loadBases();
    await store.loadBases();
    await nextTick();
    validateVectorStatus.mockClear();

    store.config.defaultEmbeddingModel = "profile-b:model-b";
    await nextTick();

    expect(validateVectorStatus).toHaveBeenCalledTimes(1);
  });

  it("migrates and rotates the active embedding asset generation", async () => {
    const store = useRecallCollectionStore();
    await store.loadBases();

    const firstGeneration = store.config.embeddingAssetGeneration;
    expect(firstGeneration).toMatchObject({
      modelIdentity: "profile-a:model-a",
    });
    expect(mocks.saveWorkspace).toHaveBeenCalled();

    await store.applyWorkspaceConfig({
      ...store.config,
      defaultEmbeddingModel: "profile-b:model-b",
    });

    expect(store.config.embeddingAssetGeneration).toMatchObject({
      modelIdentity: "profile-b:model-b",
    });
    expect(store.config.embeddingAssetGeneration?.generationId).not.toBe(
      firstGeneration?.generationId
    );
    expect(mocks.invoke).toHaveBeenCalledWith("recall_retrieval_cache_clear");
  });
  it("displays and orders mixed native seconds and browser milliseconds without rewriting records", () => {
    const store = useRecallCollectionStore();
    const oldMs = Date.UTC(2026, 10, 4, 12);
    const newSeconds = Date.UTC(2026, 10, 5, 12) / 1000;
    const base = (id: string, updatedAt: number) => ({
      id,
      name: id,
      updatedAt,
      description: null,
      entryCount: 1,
      isIndexed: false,
      path: "",
    });
    const entry = (id: string, updatedAt: number) => ({
      id,
      key: id,
      updatedAt,
      summary: "",
      tags: [],
      priority: 100,
      enabled: true,
      vectorStatus: "none" as const,
      vectorizedModels: [],
    });
    store.bases = [base("old", oldMs), base("new", newSeconds)];
    store.activeBaseMeta = {
      id: "base",
      name: "base",
      description: null,
      createdAt: oldMs,
      updatedAt: newSeconds,
      vectorization: {
        isIndexed: false,
        lastIndexedAt: null,
        modelId: "",
        provider: "",
        dimension: 0,
        totalTokens: 0,
      },
      entries: [entry("old", oldMs), entry("new", newSeconds)],
    };
    expect(new Date(recallTimestampMs(newSeconds)).toISOString()).toBe(
      "2026-11-05T12:00:00.000Z"
    );
    expect(recallTimestampMs(oldMs)).toBe(oldMs);
    expect(store.sortedBases.map((base) => base.id)).toEqual(["new", "old"]);
    expect(store.sortedEntries.map((entry) => entry.id)).toEqual([
      "new",
      "old",
    ]);
    store.baseSort.order = "asc";
    store.entrySort.order = "asc";
    expect(store.sortedBases.map((base) => base.id)).toEqual(["old", "new"]);
    expect(store.sortedEntries.map((entry) => entry.id)).toEqual([
      "old",
      "new",
    ]);
    expect(store.bases[1].updatedAt).toBe(newSeconds);
    expect(store.activeBaseMeta!.entries[0].updatedAt).toBe(oldMs);
  });
});
