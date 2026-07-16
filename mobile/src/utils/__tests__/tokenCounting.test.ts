import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, handledErrors } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  handledErrors: [] as unknown[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: async <T>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (error) {
        handledErrors.push(error);
        return null;
      }
    },
  }),
}));

import {
  countTokens,
  countTokensBatch,
  estimateTokensByCharacters,
} from "../tokenCounting";

describe("tokenCounting", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    handledErrors.length = 0;
  });

  it("normalizes successful single and batch command results", async () => {
    invokeMock
      .mockResolvedValueOnce({
        count: 3,
        tokenizer: "o200k_base",
        estimated: true,
      })
      .mockResolvedValueOnce({
        counts: [3, 2],
        total: 5,
        tokenizer: "o200k_base",
        estimated: true,
      });

    await expect(countTokens("hello world")).resolves.toEqual({
      count: 3,
      tokenizer: "o200k_base",
      estimated: true,
      fallback: false,
    });
    await expect(countTokensBatch(["hello world", "你好"])).resolves.toEqual({
      counts: [3, 2],
      total: 5,
      tokenizer: "o200k_base",
      estimated: true,
      fallback: false,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(1, "count_tokens", {
      text: "hello world",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "count_tokens_batch", {
      texts: ["hello world", "你好"],
    });
  });

  it("returns an ordered character fallback when IPC fails", async () => {
    invokeMock.mockRejectedValue(new Error("IPC unavailable"));
    const texts = ["hello", "你好！", ""];

    const result = await countTokensBatch(texts);

    expect(result).toEqual({
      counts: texts.map(estimateTokensByCharacters),
      total: texts
        .map(estimateTokensByCharacters)
        .reduce((sum, count) => sum + count, 0),
      tokenizer: "character_fallback",
      estimated: true,
      fallback: true,
    });
    expect(handledErrors).toHaveLength(1);
  });

  it("keeps empty input at zero in fallback mode", async () => {
    invokeMock.mockRejectedValue(new Error("IPC unavailable"));

    await expect(countTokens("")).resolves.toMatchObject({
      count: 0,
      fallback: true,
    });
  });
});
