// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { beforeEach, describe, expect, it, vi } from "vitest";
import { VectorCacheManager } from "../vectorCache";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  load: vi.fn(),
  embedding: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({ load: mocks.load }),
}));
vi.mock("@/llm-apis/adapters", () => ({
  adapters: {
    "openai-compatible": { embedding: mocks.embedding },
  },
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => mocks.logger,
}));
vi.mock("../../stores/recallCollectionStore", () => ({
  useRecallCollectionStore: () => ({
    config: { cache: { embeddingCacheMaxItems: 12 } },
  }),
}));

const profile = { type: "openai-compatible" };

describe("Recall vector cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({});
    mocks.invoke.mockResolvedValue(null);
    mocks.embedding.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }],
    });
  });

  it("hydrates from the Rust cache and then serves the in-memory copy", async () => {
    mocks.invoke.mockResolvedValueOnce([0.8, 0.9]);
    const cache = new VectorCacheManager();

    await expect(cache.getVector("query", profile, "model-a")).resolves.toEqual(
      [0.8, 0.9]
    );
    await expect(cache.getVector("query", profile, "model-a")).resolves.toEqual(
      [0.8, 0.9]
    );

    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("recall_get_embedding_cache", {
      modelId: "model-a",
      text: "query",
    });
    expect(mocks.embedding).not.toHaveBeenCalled();
    expect(cache.size).toBe(1);
  });

  it("isolates memory entries by model and persists generated vectors", async () => {
    mocks.embedding.mockImplementation(
      (_profile: unknown, request: { modelId: string }) =>
        Promise.resolve({
          data: [
            {
              embedding: request.modelId === "model-a" ? [1, 0] : [0, 1],
            },
          ],
        })
    );
    const cache = new VectorCacheManager();

    await expect(cache.getVector("same", profile, "model-a")).resolves.toEqual([
      1, 0,
    ]);
    await expect(cache.getVector("same", profile, "model-b")).resolves.toEqual([
      0, 1,
    ]);

    expect(mocks.embedding).toHaveBeenCalledTimes(2);
    expect(mocks.invoke).toHaveBeenCalledWith("recall_set_embedding_cache", {
      modelId: "model-a",
      text: "same",
      vector: [1, 0],
      maxItems: 12,
    });
    expect(mocks.invoke).toHaveBeenCalledWith("recall_set_embedding_cache", {
      modelId: "model-b",
      text: "same",
      vector: [0, 1],
      maxItems: 12,
    });
    expect(cache.size).toBe(2);
  });

  it("continues with the provider when the Rust cache read fails", async () => {
    mocks.invoke
      .mockRejectedValueOnce(new Error("backend unavailable"))
      .mockResolvedValueOnce(undefined);
    const cache = new VectorCacheManager();

    await expect(cache.getVector("query", profile, "model-a")).resolves.toEqual(
      [0.1, 0.2]
    );

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "从 Rust 后端获取 Embedding 缓存失败",
      expect.any(Error)
    );
    expect(mocks.embedding).toHaveBeenCalledOnce();
  });

  it("rejects unsupported embedding providers", async () => {
    const cache = new VectorCacheManager();
    await expect(
      cache.getVector("query", { type: "missing" }, "model-a")
    ).rejects.toThrow("不支持 Embedding");
  });

  it("rejects empty vectors returned by the provider", async () => {
    mocks.embedding.mockResolvedValueOnce({ data: [] });
    const cache = new VectorCacheManager();
    await expect(cache.getVector("query", profile, "model-a")).rejects.toThrow(
      "获取向量为空"
    );
  });
});
