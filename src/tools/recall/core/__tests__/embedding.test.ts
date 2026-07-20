// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
import type { RecallRequestSettings } from "../../types";
import { detectDimension, generateVectors, vectorizeTags } from "../embedding";

const mocks = vi.hoisted(() => ({
  callEmbeddingApi: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/llm-apis/embedding", () => ({
  callEmbeddingApi: mocks.callEmbeddingApi,
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

function requestSettings(
  overrides: Partial<RecallRequestSettings> = {}
): RecallRequestSettings {
  return {
    timeout: 1_000,
    maxRetries: 0,
    retryInterval: 100,
    retryMode: "fixed",
    maxConcurrent: 1,
    batchSize: 2,
    ...overrides,
  };
}

function embeddingResponse(vectors: number[][], promptTokens = 0) {
  return {
    data: vectors.map((embedding, index) => ({ embedding, index })),
    usage: { promptTokens },
  };
}

describe("Recall embedding core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps single and batch requests through the shared embedding API", async () => {
    mocks.callEmbeddingApi.mockResolvedValue(
      embeddingResponse(
        [
          [1, 0],
          [0, 1],
        ],
        7
      )
    );

    const result = await generateVectors({
      input: ["first", "second"],
      modelId: "embed-model",
      profile,
      requestSettings: requestSettings(),
    });

    expect(mocks.callEmbeddingApi).toHaveBeenCalledWith(profile, {
      modelId: "embed-model",
      input: ["first", "second"],
    });
    expect(result).toEqual({
      data: [
        { embedding: [1, 0], index: 0 },
        { embedding: [0, 1], index: 1 },
      ],
      usage: { promptTokens: 7 },
    });
  });

  it("detects the returned vector dimension and rejects empty data", async () => {
    mocks.callEmbeddingApi.mockResolvedValueOnce(
      embeddingResponse([[1, 2, 3, 4]])
    );

    await expect(
      detectDimension({ profile, modelId: "embed-model" })
    ).resolves.toBe(4);
    expect(mocks.callEmbeddingApi).toHaveBeenCalledWith(profile, {
      modelId: "embed-model",
      input: "dimension_test",
    });

    mocks.callEmbeddingApi.mockResolvedValueOnce({ data: [] });
    await expect(
      detectDimension({ profile, modelId: "embed-model" })
    ).rejects.toThrow("模型返回数据异常");
  });

  it("retries with exponential delays and reports each retry", async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    mocks.callEmbeddingApi
      .mockRejectedValueOnce(new Error("temporary-1"))
      .mockRejectedValueOnce(new Error("temporary-2"))
      .mockResolvedValueOnce(embeddingResponse([[1, 0]]));

    const resultPromise = generateVectors({
      input: "query",
      modelId: "embed-model",
      profile,
      requestSettings: requestSettings({
        maxRetries: 2,
        retryMode: "exponential",
      }),
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 100);
    await vi.advanceTimersByTimeAsync(200);
    await expect(resultPromise).resolves.toEqual(embeddingResponse([[1, 0]]));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 200);
    expect(mocks.callEmbeddingApi).toHaveBeenCalledTimes(3);
  });

  it("rejects a request that exceeds its configured timeout", async () => {
    vi.useFakeTimers();
    mocks.callEmbeddingApi.mockImplementation(() => new Promise(() => {}));

    const resultPromise = generateVectors({
      input: "query",
      modelId: "embed-model",
      profile,
      label: "测试向量",
      requestSettings: requestSettings({ timeout: 50 }),
    });
    const rejection =
      expect(resultPromise).rejects.toThrow("测试向量 请求超时");
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    expect(mocks.callEmbeddingApi).toHaveBeenCalledTimes(1);
  });

  it("falls back from a rejected batch to ordered single-tag requests", async () => {
    mocks.callEmbeddingApi.mockImplementation(
      (_profile: LlmProfile, request: { input: string | string[] }) => {
        if (Array.isArray(request.input)) {
          return Promise.reject(new Error("400 input array unsupported"));
        }
        return Promise.resolve(
          embeddingResponse([[request.input === "alpha" ? 1 : 2]])
        );
      }
    );
    const onProgress = vi.fn();

    const result = await vectorizeTags({
      tags: ["alpha", "beta"],
      modelId: "embed-model",
      profile,
      requestSettings: requestSettings(),
      onProgress,
    });

    expect(Array.from(result.entries())).toEqual([
      ["alpha", [1]],
      ["beta", [2]],
    ]);
    expect(mocks.callEmbeddingApi).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1);
    expect(onProgress).toHaveBeenNthCalledWith(2, 1);
    expect(mocks.logger.warn).toHaveBeenCalledOnce();
  });

  it("stops before issuing work when cancellation is already requested", async () => {
    const result = await vectorizeTags({
      tags: ["alpha", "beta"],
      modelId: "embed-model",
      profile,
      requestSettings: requestSettings(),
      shouldStop: () => true,
    });

    expect(result.size).toBe(0);
    expect(mocks.callEmbeddingApi).not.toHaveBeenCalled();
  });
});
