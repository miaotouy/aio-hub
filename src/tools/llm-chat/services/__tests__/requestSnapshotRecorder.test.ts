import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
const storage = vi.hoisted(() => ({
  save: vi.fn(),
  reserve: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock("../requestSnapshots", () => ({
  requestSnapshots: { save: storage.save, reserve: storage.reserve },
  reportSnapshotError: storage.reportError,
}));
import { createRequestSnapshotRecorder } from "../requestSnapshotRecorder";
import type { LlmResponse } from "@/llm-apis/common";
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.clearAllMocks();
  let index = 0;
  storage.reserve.mockImplementation(() => ++index);
  storage.save.mockResolvedValue(undefined);
});
const context = () => ({
  sessionId: "session",
  requestId: "logical-request",
  logicalProfileId: "virtual",
  logicalModelId: "selected",
  sources: Promise.resolve([]),
  epoch: 0,
  saveTextPreview: false,
  assistantNodeIds: () => ["assistant", "segment"],
});
const route = {
  actualProfileId: "member",
  actualModelId: "actual",
  providerType: "claude",
  adapterId: "anthropic-messages",
};
const event = {
  requestId: "wire",
  startedAt: 1,
  request: {
    method: "POST" as const,
    url: "https://secret.test?key=private",
    headers: { Authorization: "private" },
    streaming: false,
    body: {
      kind: "json" as const,
      value: { messages: [{ role: "user", content: "hello" }] },
    },
  },
};
describe("physical request attempt capture", () => {
  it("records lower sends separately, preserving logical ID, actual route and VCP node association", async () => {
    const recorder = createRequestSnapshotRecorder(context());
    const capture = recorder.capture(route);
    capture.observer.onRequest?.(event);
    capture.observer.onError?.({
      requestId: "wire",
      error: new Error("network"),
      occurredAt: 2,
    });
    capture.observer.onRequest?.({ ...event, startedAt: 3 });
    capture.complete({
      content: "ok",
      usage: {
        promptTokens: 2,
        completionTokens: 3,
        totalTokens: 5,
        providerUsageStatus: "reported",
        reportedUsageFields: { input_tokens: 2, output_tokens: 3 },
      },
    });
    await recorder.flush();
    const [failed, completed] = storage.save.mock.calls.map((call) => call[0]);
    expect([failed.attemptIndex, completed.attemptIndex]).toEqual([1, 2]);
    expect(failed.attemptId).not.toBe(completed.attemptId);
    expect(failed.status).toBe("error");
    expect(completed).toMatchObject({
      requestId: "logical-request",
      status: "completed",
      assistantNodeIds: ["assistant", "segment"],
      route: {
        ...route,
        logicalProfileId: "virtual",
        logicalModelId: "selected",
      },
      processingScope: "server",
    });
    expect(JSON.stringify(completed)).not.toContain("private");
    expect(storage.reportError).not.toHaveBeenCalled();
  });
  it("retains explicit upstream zero separately from later local estimation", async () => {
    const recorder = createRequestSnapshotRecorder(context());
    const capture = recorder.capture(route);
    const response: LlmResponse = {
      content: "answer",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        providerUsageStatus: "reported",
        reportedUsageFields: { input_tokens: 0, output_tokens: 0 },
      },
    };
    capture.observer.onRequest?.(event);
    capture.complete(response);
    response.estimatedUsage = {
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
      isLocalEstimated: true,
    };
    response.usage = response.estimatedUsage;
    recorder.supplement(response);
    await recorder.flush();
    const saved =
      storage.save.mock.calls[storage.save.mock.calls.length - 1][0];
    expect(saved.providerUsage.totalTokens).toBe(0);
    expect(saved.reportedUsageFields).toEqual({
      input_tokens: 0,
      output_tokens: 0,
    });
    expect(saved.estimatedUsage.totalTokens).toBe(7);
  });
  it("retains decoded usage received before a streaming failure", async () => {
    const recorder = createRequestSnapshotRecorder(context());
    const capture = recorder.capture(route);
    capture.observer.onRequest?.(event);
    capture.observer.onUsage?.({
      requestId: "wire",
      usage: {
        promptTokens: 1200,
        completionTokens: 0,
        totalTokens: 1200,
        providerUsageStatus: "partial",
        reportedUsageFields: {
          input_tokens: 100,
          cache_read_input_tokens: 900,
          cache_creation_input_tokens: 200,
        },
      },
    });
    capture.error(new Error("disconnected"));
    await recorder.flush();
    expect(storage.save.mock.calls[0][0]).toMatchObject({
      status: "error",
      providerUsageStatus: "partial",
      providerUsage: { promptTokens: 1200 },
    });
  });
  it("excludes pre-send failures and settles cancellation once", async () => {
    const recorder = createRequestSnapshotRecorder(context());
    const capture = recorder.capture(route);
    capture.error(new Error("build failed"));
    await recorder.flush();
    expect(storage.save).not.toHaveBeenCalled();
    capture.observer.onRequest?.(event);
    capture.error(new DOMException("cancelled", "AbortError"));
    capture.error(new Error("duplicate"));
    await recorder.flush();
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save.mock.calls[0][0].status).toBe("aborted");
  });
});
