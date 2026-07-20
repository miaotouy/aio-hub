// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import type { RecallEntry } from "../../types";
import { IndexingOrchestrator, SearchOrchestrator } from "../orchestrator";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  generateVectors: vi.fn(),
  vectorizeTags: vi.fn(),
  prepareSearchVector: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("../../core/embedding", () => ({
  generateVectors: mocks.generateVectors,
  vectorizeTags: mocks.vectorizeTags,
}));
vi.mock("../../core/search", () => ({
  prepareSearchVector: mocks.prepareSearchVector,
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => mocks.logger,
}));

const profile = {
  id: "profile",
  name: "Profile",
  type: "openai-compatible",
  baseUrl: "http://127.0.0.1",
  apiKeys: [],
  enabled: true,
  models: [],
} satisfies LlmProfile;

const entry = {
  id: "entry-1",
  key: "renderer",
  content: "renderer content",
  tags: [],
  assets: [],
  priority: 100,
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
} as RecallEntry;

describe("Recall orchestrators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue(undefined);
    mocks.vectorizeTags.mockResolvedValue(new Map());
    mocks.generateVectors.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      usage: { promptTokens: 11 },
    });
    mocks.prepareSearchVector.mockResolvedValue([0.4, 0.5, 0.6]);
  });

  it("persists a generated entry vector through the production command", async () => {
    const result = await new IndexingOrchestrator().indexEntry({
      recallId: "recall-1",
      entry,
      modelId: "embed-model",
      profile,
    });

    expect(result).toEqual({ vectorStatus: "ready" });
    expect(mocks.generateVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        input: entry.content,
        modelId: "embed-model",
        profile,
      })
    );
    expect(mocks.invoke).toHaveBeenCalledWith("recall_update_entry_vector", {
      recallId: "recall-1",
      entryId: "entry-1",
      vector: [0.1, 0.2, 0.3],
      model: "embed-model",
      tokens: 11,
    });
  });

  it("does not generate a query vector for an empty query or keyword engine", async () => {
    const orchestrator = new SearchOrchestrator();

    await expect(
      orchestrator.search({
        query: "  ",
        engineId: "vector",
        recallIds: ["recall-1"],
        modelId: "embed-model",
        profile,
      })
    ).resolves.toEqual([]);
    expect(mocks.prepareSearchVector).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();

    mocks.invoke.mockResolvedValueOnce([{ id: "keyword-result" }]);
    await expect(
      orchestrator.search({
        query: "keyword query",
        engineId: "keyword",
        recallIds: ["recall-1"],
      })
    ).resolves.toEqual([{ id: "keyword-result" }]);
    expect(mocks.prepareSearchVector).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith("recall_search", {
      query: "keyword query",
      filters: {
        recallIds: ["recall-1"],
        limit: 20,
        engineId: "keyword",
      },
      engineId: "keyword",
      vectorPayload: undefined,
      model: undefined,
    });
  });

  it("prepares the vector environment and passes query payload to vector search", async () => {
    mocks.invoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: "vector-result" }]);

    const result = await new SearchOrchestrator().search({
      query: "semantic query",
      engineId: "vector",
      recallIds: ["recall-1"],
      modelId: "embed-model",
      profile,
      limit: 5,
    });

    expect(result).toEqual([{ id: "vector-result" }]);
    expect(mocks.prepareSearchVector).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "semantic query",
        modelId: "embed-model",
        profile,
      })
    );
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      1,
      "recall_load_model_vectors",
      {
        recallId: "recall-1",
        modelId: "embed-model",
      }
    );
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      2,
      "recall_rebuild_tag_pool_index",
      {
        modelId: "embed-model",
      }
    );
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, "recall_search", {
      query: "semantic query",
      filters: {
        recallIds: ["recall-1"],
        limit: 5,
        engineId: "vector",
      },
      engineId: "vector",
      vectorPayload: [0.4, 0.5, 0.6],
      model: "embed-model",
    });
  });

  it("rejects vector search without a model before touching IPC", async () => {
    await expect(
      new SearchOrchestrator().search({
        query: "semantic query",
        engineId: "vector",
        recallIds: ["recall-1"],
      })
    ).rejects.toThrow("配置模型信息");
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.prepareSearchVector).not.toHaveBeenCalled();
  });
});
