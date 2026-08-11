import { describe, expect, it, vi } from "vitest";
import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
} from "../../../types/pipeline";
import { PipelineEngine } from "../PipelineEngine";

function createContext(): PipelineContext {
  return {
    messages: [],
    session: {} as PipelineContext["session"],
    agentConfig: null,
    settings: {} as PipelineContext["settings"],
    timestamp: 0,
    sharedData: new Map(),
    logs: [],
  };
}

function createProcessor(
  id: string,
  execute: ContextProcessor["execute"]
): ContextProcessor {
  return {
    id,
    name: id,
    description: id,
    priority: 100,
    execute,
  };
}

describe("PipelineEngine", () => {
  it("continues after applied, skipped, and safely degraded results", async () => {
    const calls: string[] = [];
    const context = createContext();

    await PipelineEngine.execute(context, [
      createProcessor("applied", async () => {
        calls.push("applied");
        return processorResult.applied("applied message");
      }),
      createProcessor("skipped", async () => {
        calls.push("skipped");
        return processorResult.skipped("nothing matched");
      }),
      createProcessor("degraded", async () => {
        calls.push("degraded");
        return processorResult.degraded("fallback completed");
      }),
      createProcessor("later", async () => {
        calls.push("later");
        return processorResult.applied("later completed");
      }),
    ]);

    expect(calls).toEqual(["applied", "skipped", "degraded", "later"]);
    expect(context.logs).toEqual([
      expect.objectContaining({
        processorId: "applied",
        status: "applied",
        level: "info",
      }),
      expect.objectContaining({
        processorId: "skipped",
        status: "skipped",
        level: "info",
      }),
      expect.objectContaining({
        processorId: "degraded",
        status: "degraded",
        level: "warn",
      }),
      expect.objectContaining({
        processorId: "later",
        status: "applied",
        level: "info",
      }),
    ]);
  });

  it("fails fast when a processor explicitly reports failure", async () => {
    const failure = new Error("processor failed");
    const later = vi.fn(async () => processorResult.applied("later completed"));
    const context = createContext();

    await expect(
      PipelineEngine.execute(context, [
        createProcessor("failed", async () =>
          processorResult.failed("cannot safely continue", failure)
        ),
        createProcessor("later", later),
      ])
    ).rejects.toBe(failure);

    expect(later).not.toHaveBeenCalled();
    expect(context.logs).toEqual([
      expect.objectContaining({
        processorId: "failed",
        status: "failed",
        level: "error",
        message: "cannot safely continue",
      }),
    ]);
  });

  it("fails fast when a processor throws an unrecovered error", async () => {
    const failure = new Error("processor crashed");
    const later = vi.fn(async () => processorResult.applied("later completed"));
    const context = createContext();

    await expect(
      PipelineEngine.execute(context, [
        createProcessor("broken", async () => {
          throw failure;
        }),
        createProcessor("later", later),
      ])
    ).rejects.toBe(failure);

    expect(later).not.toHaveBeenCalled();
    expect(context.logs).toEqual([
      expect.objectContaining({
        processorId: "broken",
        status: "failed",
        level: "error",
      }),
    ]);
  });

  it("rejects processors that do not return an explicit result", async () => {
    const later = vi.fn(async () => processorResult.applied("later completed"));
    const context = createContext();
    const invalidProcessor = createProcessor(
      "invalid",
      (async () => undefined) as unknown as ContextProcessor["execute"]
    );

    await expect(
      PipelineEngine.execute(context, [
        invalidProcessor,
        createProcessor("later", later),
      ])
    ).rejects.toThrow("未返回有效的执行结果");

    expect(later).not.toHaveBeenCalled();
    expect(context.logs[0]).toEqual(
      expect.objectContaining({
        processorId: "invalid",
        status: "failed",
        level: "error",
      })
    );
  });
});
