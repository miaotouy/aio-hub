import { describe, expect, it } from "vitest";
import {
  buildEmbeddingCacheScopeKey,
  hashEmbeddingInput,
} from "../useEmbeddingCache";

describe("embedding cache contract", () => {
  it("isolates dimensions, task types, encodings and adapter contracts", () => {
    const base = buildEmbeddingCacheScopeKey(
      "profile:model",
      { dimensions: 1024, taskType: "RETRIEVAL_QUERY" },
      { adapterContractVersion: 1, inputKind: "query" }
    );
    expect(
      buildEmbeddingCacheScopeKey(
        "profile:model",
        { dimensions: 1024, taskType: "RETRIEVAL_DOCUMENT" },
        { adapterContractVersion: 1, inputKind: "document" }
      )
    ).not.toBe(base);
    expect(
      buildEmbeddingCacheScopeKey(
        "profile:model",
        { dimensions: 1536, taskType: "RETRIEVAL_QUERY" },
        { adapterContractVersion: 1, inputKind: "query" }
      )
    ).not.toBe(base);
    expect(
      buildEmbeddingCacheScopeKey(
        "profile:model",
        { dimensions: 1024, taskType: "RETRIEVAL_QUERY" },
        { adapterContractVersion: 2, inputKind: "query" }
      )
    ).not.toBe(base);
  });

  it("uses deterministic content hashes instead of raw cache keys", async () => {
    expect(await hashEmbeddingInput("same text")).toBe(
      await hashEmbeddingInput("same text")
    );
    expect(await hashEmbeddingInput("same text")).not.toBe(
      await hashEmbeddingInput("other text")
    );
  });
});
