import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultKnowledgeLibraryConfig,
  knowledgeRuntimeConfigManager,
  normalizeKnowledgeLibraryConfig,
  saveKnowledgeRuntimeConfigDebounced,
  validateKnowledgeLibraryConfig,
} from "./config";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn(), handle: vi.fn() }),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Knowledge configuration", () => {
  it("reads an empty legacy library config as defaults without mutation", () => {
    const legacy = {};
    const config = normalizeKnowledgeLibraryConfig(legacy);
    expect(config).toEqual(createDefaultKnowledgeLibraryConfig());
    expect(legacy).toEqual({});
  });

  it("deep-merges partial nested library configuration without sharing defaults", () => {
    const defaults = createDefaultKnowledgeLibraryConfig();
    const config = normalizeKnowledgeLibraryConfig(
      JSON.parse(
        '{"chunking":{"targetChars":1800},"embedding":{"routeKey":"profile-a:model-a"}}'
      )
    );

    expect(config.chunking).toEqual({
      ...defaults.chunking,
      targetChars: 1800,
    });
    expect(config.embedding).toEqual({
      ...defaults.embedding,
      routeKey: "profile-a:model-a",
    });
    config.chunking.targetChars = 2200;
    expect(defaults.chunking.targetChars).not.toBe(2200);
  });

  it("rejects invalid chunk and semantic contracts", () => {
    const overlap = createDefaultKnowledgeLibraryConfig();
    overlap.chunking.overlapChars = overlap.chunking.targetChars;
    expect(() => validateKnowledgeLibraryConfig(overlap)).toThrow("重叠");

    const semantic = createDefaultKnowledgeLibraryConfig();
    semantic.embedding.enabled = true;
    semantic.indexes.semantic = true;
    expect(() => validateKnowledgeLibraryConfig(semantic)).toThrow(
      "Embedding route"
    );

    const invalidDimensions = createDefaultKnowledgeLibraryConfig();
    invalidDimensions.embedding.requestedDimensions = 0;
    expect(() =>
      validateKnowledgeLibraryConfig(
        normalizeKnowledgeLibraryConfig(invalidDimensions)
      )
    ).toThrow("请求向量维度");
  });

  it("loads and saves versioned runtime settings", async () => {
    const config = await knowledgeRuntimeConfigManager.load();
    const next = { ...config, embeddingBatchSize: 48 };
    await knowledgeRuntimeConfigManager.save(next);
    expect(await knowledgeRuntimeConfigManager.load()).toMatchObject({
      version: "1.0.0",
      embeddingBatchSize: 48,
    });
  });

  it("debounces high-frequency runtime saves at 500 milliseconds", async () => {
    vi.useFakeTimers();
    const save = vi
      .spyOn(knowledgeRuntimeConfigManager, "save")
      .mockResolvedValue();
    const config = await knowledgeRuntimeConfigManager.load();
    const first = { ...config, embeddingBatchSize: 16 };
    const latest = { ...config, embeddingBatchSize: 64 };

    knowledgeRuntimeConfigManager.saveDebounced(first);
    knowledgeRuntimeConfigManager.saveDebounced(latest);
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(latest);
  });

  it("reports a debounced persistence failure to the caller", async () => {
    vi.useFakeTimers();
    const failure = new Error("disk unavailable");
    vi.spyOn(knowledgeRuntimeConfigManager, "save").mockRejectedValue(failure);
    const onError = vi.fn();
    const config = await knowledgeRuntimeConfigManager.load();

    saveKnowledgeRuntimeConfigDebounced(config, onError);
    await vi.advanceTimersByTimeAsync(500);

    expect(onError).toHaveBeenCalledWith(failure);
  });
});
