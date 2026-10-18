import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChannelConfigurationError,
  ChannelExecutionError,
  executeChannelRequest,
  resolveChannelCandidates,
  type ChannelProfile,
} from "../src/virtual-channel";

function fixture() {
  const physical = ["primary", "backup"].map((id) => ({
    id,
    type: "openai",
    enabled: true,
    models: [{ id: id + "-model", capabilities: { toolUse: true } }],
  }));
  const profile: ChannelProfile = {
    id: "logical",
    type: "virtual",
    enabled: true,
    virtualChannel: {
      mode: "failover",
      members: physical.map((p) => p.id),
      maxAttempts: 2,
      totalTimeoutMs: 1000,
      attemptTimeoutMs: 100,
    },
    models: [
      {
        id: "chat",
        virtualBindings: {
          chat: physical.map((p) => ({
            profileId: p.id,
            modelId: p.models[0].id,
          })),
        },
      },
    ],
  };
  const profiles: ChannelProfile[] = [profile, ...physical];
  return {
    profile,
    profiles,
    getProfiles: () => profiles,
    modelId: "chat",
    operation: "chat" as const,
  };
}
const http = (status: number) =>
  Object.assign(new Error("upstream failed"), { status });
afterEach(() => vi.useRealTimers());

describe("virtual channel request contract", () => {
  it("uses only configured candidates, preserves the logical binding and records the physical result", async () => {
    const input = fixture();
    input.profiles.unshift({
      id: "unrelated",
      type: "openai",
      enabled: true,
      models: [{ id: "other" }],
    });
    const execute = vi
      .fn()
      .mockRejectedValueOnce(http(429))
      .mockResolvedValueOnce("ok");
    const result = await executeChannelRequest({ ...input, execute });
    expect(execute.mock.calls.map(([t]) => t.profile.id)).toEqual([
      "primary",
      "backup",
    ]);
    expect(result.response).toBe("ok");
    expect(result.execution.requested).toEqual({
      profileId: "logical",
      modelId: "chat",
    });
    expect(result.execution.actual).toEqual({
      profileId: "backup",
      modelId: "backup-model",
    });
    expect(result.execution.attempts[0].decision).toEqual({
      action: "retry",
      reason: "transient_error",
    });
  });
  it.each([400, 401, 403, 504, 524])("stops on status %s", async (status) => {
    const execute = vi.fn().mockRejectedValue(http(status));
    await expect(
      executeChannelRequest({ ...fixture(), execute })
    ).rejects.toBeInstanceOf(ChannelExecutionError);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("stops after output and retains attempt history for the caller", async () => {
    const execute = vi.fn(async ({ markOutput }) => {
      markOutput();
      throw http(503);
    });
    await expect(
      executeChannelRequest({ ...fixture(), execute })
    ).rejects.toMatchObject({
      retryable: false,
      attempts: [{ decision: { action: "stop", reason: "output_started" } }],
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("cancellation terminates the active attempt without trying backup", async () => {
    const controller = new AbortController();
    const aborted = vi.fn();
    const execute = vi.fn(
      async ({ signal }) =>
        new Promise<string>((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted();
            reject(signal.reason);
          });
          controller.abort(new DOMException("cancelled", "AbortError"));
        })
    );
    await expect(
      executeChannelRequest({
        ...fixture(),
        signal: controller.signal,
        execute,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(aborted).toHaveBeenCalledTimes(1);
  });
  it("times out a stalled member, aborts it and passes the remaining budget to backup", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const execute = vi.fn(async ({ signal }) => {
      signals.push(signal);
      return signals.length === 1 ? new Promise<string>(() => {}) : "ok";
    });
    const pending = executeChannelRequest({ ...fixture(), execute });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(result.response).toBe("ok");
    expect(signals[0].aborted).toBe(true);
    expect(result.execution.attempts[0].durationMs).toBe(100);
  });
  it("enforces max attempts and the caller's total time budget", async () => {
    const input = fixture();
    input.profile.virtualChannel!.maxAttempts = 1;
    const execute = vi.fn().mockRejectedValue(http(503));
    await expect(
      executeChannelRequest({ ...input, execute })
    ).rejects.toMatchObject({
      attempts: [{ decision: { reason: "attempt_budget_exhausted" } }],
    });
    expect(execute).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    const stalled = vi.fn(() => new Promise(() => {}));
    const pending = expect(
      executeChannelRequest({ ...fixture(), timeoutMs: 50, execute: stalled })
    ).rejects.toBeInstanceOf(ChannelExecutionError);
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(stalled).toHaveBeenCalledTimes(1);
  });
  it("rechecks member deletion between attempts", async () => {
    const input = fixture();
    const execute = vi.fn(async () => {
      input.profiles.splice(
        input.profiles.findIndex((p) => p.id === "backup"),
        1
      );
      throw http(503);
    });
    await expect(
      executeChannelRequest({ ...input, execute })
    ).rejects.toBeInstanceOf(ChannelConfigurationError);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each([
    "membership",
    "duplicate",
    "disabled",
    "protocol",
    "capability",
    "embedding",
    "budget",
  ])("rejects invalid %s before contacting upstream", (kind) => {
    const input = fixture();
    const targets = input.profile.models[0].virtualBindings!.chat!;
    if (kind === "membership")
      input.profile.virtualChannel!.members = ["primary"];
    if (kind === "duplicate") targets[1] = targets[0];
    if (kind === "disabled") input.profiles[2].enabled = false;
    if (kind === "protocol") input.profiles[2].type = "claude";
    if (kind === "capability") input.profiles[2].models[0].capabilities = {};
    if (kind === "embedding")
      input.profile.models[0].virtualBindings = { embedding: targets };
    if (kind === "budget") input.profile.virtualChannel!.attemptTimeoutMs = -1;
    expect(() =>
      resolveChannelCandidates({
        ...input,
        operation: kind === "embedding" ? "embedding" : "chat",
        requiredCapabilities: ["toolUse"],
      })
    ).toThrow();
  });
});
