// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import type { RecallEntry } from "../../types";
import { IndexingOrchestrator } from "../orchestrator";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  generateVectors: vi.fn(),
  vectorizeTags: vi.fn(),
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
});
