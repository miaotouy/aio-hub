// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { createTextTokenScope } from "../tokenCalculationScope";
const result = (count: number) => ({
  count,
  isEstimated: false,
  tokenizerName: "fixture",
});

describe("request-scoped text token calculation", () => {
  // Public contract: identical concurrent and completed work is reused in one scope.
  it("shares pending and completed results while keeping scopes independent", async () => {
    let release!: (value: ReturnType<typeof result>) => void;
    const calculate = vi.fn(
      () =>
        new Promise<ReturnType<typeof result>>((r) => {
          release = r;
        })
    );
    const identity = () => ({ revision: 1 });
    const scope = createTextTokenScope(calculate, identity);
    const first = scope("hello", "model");
    const second = scope("hello", "model");
    expect(calculate).toHaveBeenCalledTimes(1);
    release(result(3));
    expect(await first).toEqual(result(3));
    expect(await second).toEqual(result(3));
    expect(await scope("hello", "model")).toEqual(result(3));
    calculate.mockResolvedValue(result(4));
    expect(
      await createTextTokenScope(calculate, identity)("hello", "model")
    ).toEqual(result(4));
    expect(calculate).toHaveBeenCalledTimes(2);
  });

  it("separates text, model, explicit tokenizer and registry revisions", async () => {
    let revision = 1,
      tokenizerProfileId = "first";
    const calculate = vi.fn(async () => result(2));
    const scope = createTextTokenScope(calculate, () => ({
      revision,
      tokenizerProfileId,
    }));
    await scope("hello", "model");
    await scope("changed", "model");
    await scope("hello", "another-model");
    tokenizerProfileId = "second";
    await scope("hello", "model");
    revision++;
    await scope("hello", "model");
    expect(calculate).toHaveBeenCalledTimes(5);
    expect(calculate).toHaveBeenLastCalledWith("hello", "model", "second");
  });

  it("retries rejected calculations and keeps oversized text outside its retention bound", async () => {
    const calculate = vi
      .fn()
      .mockRejectedValueOnce(new Error("worker restarted"))
      .mockResolvedValue(result(1));
    const scope = createTextTokenScope(calculate, () => ({ revision: 1 }), {
      maxEntries: 2,
      maxChars: 4,
    });
    await expect(scope("hi", "model")).rejects.toThrow("worker restarted");
    expect(await scope("hi", "model")).toEqual(result(1));
    await scope("long-text", "model");
    await scope("long-text", "model");
    await scope("hi", "model");
    expect(calculate).toHaveBeenCalledTimes(4);
    await scope("ok", "model");
    await scope("a", "model");
    await scope("hi", "model");
    expect(calculate).toHaveBeenCalledTimes(7);
  });
});
