import type { Subprocess } from "bun";
import { describe, expect, it, vi } from "vitest";
import {
  FatalWaitError,
  runCommand,
  waitForSubprocessExit,
  waitUntil,
  withTimeout,
} from "./process";

describe("mobile E2E process control", () => {
  it("fails immediately when a wait probe reports a fatal subprocess exit", async () => {
    const started = performance.now();
    await expect(
      waitUntil(
        async () => {
          throw new FatalWaitError("emulator exited");
        },
        { timeoutMs: 5_000, intervalMs: 100, description: "emulator boot" }
      )
    ).rejects.toThrow("emulator exited");
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("keeps retrying ordinary transient probe errors", async () => {
    let attempts = 0;
    await expect(
      waitUntil(
        async () => {
          attempts += 1;
          if (attempts < 3) throw new Error("not ready");
          return "ready";
        },
        { timeoutMs: 1_000, intervalMs: 5, description: "transient probe" }
      )
    ).resolves.toBe("ready");
  });

  it("bounds cleanup operations independently", async () => {
    await expect(
      withTimeout(new Promise((resolve) => setTimeout(resolve, 1_000)), {
        timeoutMs: 20,
        description: "cleanup probe",
      })
    ).rejects.toThrow("cleanup probe");
  });
  it("keeps a successful command result when an inherited output pipe stays open", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("completed\n"));
      },
    });
    const stderr = new ReadableStream<Uint8Array>();
    const previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
    const spawn = vi.fn().mockReturnValue({
      exited: Promise.resolve(0),
      stdout,
      stderr,
    } as unknown as Subprocess);
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      value: { env: {}, spawn },
    });

    try {
      const result = runCommand(["synthetic-command"]);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(result).resolves.toMatchObject({
        exitCode: 0,
        stdout: "completed\n",
        stderr: "",
      });
      expect(spawn).toHaveBeenCalledOnce();
    } finally {
      if (previousBun) {
        Object.defineProperty(globalThis, "Bun", previousBun);
      } else {
        Reflect.deleteProperty(globalThis, "Bun");
      }
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("clears the losing subprocess timeout timer after an early exit", async () => {
    vi.useFakeTimers();
    try {
      const subprocess = {
        exited: Promise.resolve(0),
      } as Subprocess;
      await expect(waitForSubprocessExit(subprocess, 60_000)).resolves.toBe(
        true
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
