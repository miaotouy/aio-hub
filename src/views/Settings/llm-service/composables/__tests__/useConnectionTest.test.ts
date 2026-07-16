import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelProbeResult } from "../../probe/types";
import type { LlmProfile } from "@/types/llm-profiles";

const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  probeBatch: vi.fn(),
  syncKeyStates: vi.fn(),
  reportSuccess: vi.fn(),
  reportFailure: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  messageInfo: vi.fn(),
}));

vi.mock("../../probe/channel-probe-service", () => ({
  createChannelProbeService: () => ({
    probe: mocks.probe,
    probeBatch: mocks.probeBatch,
  }),
}));

vi.mock("@/composables/useLlmKeyManager", () => ({
  useLlmKeyManager: () => ({
    syncKeyStates: mocks.syncKeyStates,
    reportSuccess: mocks.reportSuccess,
    reportFailure: mocks.reportFailure,
  }),
}));

vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: mocks.messageSuccess,
    error: mocks.messageError,
    info: mocks.messageInfo,
  },
}));

import { useConnectionTest } from "../useConnectionTest";

const source: LlmProfile = {
  id: "profile-1",
  name: "Test",
  type: "openai",
  baseUrl: "https://example.com",
  apiKeys: ["key-1"],
  enabled: true,
  models: [{ id: "model-1", name: "Model" }],
};

function result(values: Partial<ChannelProbeResult> = {}): ChannelProbeResult {
  return {
    success: true,
    kind: "key",
    modelId: "model-1",
    endpointType: "auto",
    phase: "semantic-validation",
    totalMs: 10,
    testedAt: 1,
    ...values,
  };
}

describe("useConnectionTest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports one success for a key probe", async () => {
    mocks.probe.mockResolvedValue(result());
    const composable = useConnectionTest(
      ref(source),
      computed(() => source)
    );
    await composable.handleTestKey({ key: "key-1", modelId: "model-1" });
    expect(mocks.reportSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.reportFailure).not.toHaveBeenCalled();
  });

  it("marks an explicit authentication failure once", async () => {
    mocks.probe.mockResolvedValue(
      result({
        success: false,
        category: "authentication",
        status: 401,
        errorMessage: "invalid key",
      })
    );
    const composable = useConnectionTest(
      ref(source),
      computed(() => source)
    );
    await composable.handleTestKey({ key: "key-1", modelId: "model-1" });
    expect(mocks.reportFailure).toHaveBeenCalledTimes(1);
    expect(mocks.reportFailure.mock.calls[0][3]).toEqual({ forceBroken: true });
    expect(mocks.reportSuccess).not.toHaveBeenCalled();
  });

  it("does not alter key health for configuration failures", async () => {
    mocks.probe.mockResolvedValue(
      result({
        success: false,
        category: "configuration",
        errorMessage: "bad endpoint",
      })
    );
    const composable = useConnectionTest(
      ref(source),
      computed(() => source)
    );
    await composable.handleTestKey({ key: "key-1", modelId: "model-1" });
    expect(mocks.reportFailure).not.toHaveBeenCalled();
    expect(mocks.reportSuccess).not.toHaveBeenCalled();
  });

  it("records bad requests only in the probe result", async () => {
    mocks.probe.mockResolvedValue(
      result({
        success: false,
        category: "bad-request",
        status: 400,
        errorMessage: "invalid request body",
      })
    );
    const composable = useConnectionTest(
      ref(source),
      computed(() => source)
    );
    await composable.handleTestKey({ key: "key-1", modelId: "model-1" });
    expect(mocks.reportFailure).not.toHaveBeenCalled();
    expect(mocks.reportSuccess).not.toHaveBeenCalled();
  });

  it("records rate limits without contributing to the broken threshold", async () => {
    mocks.probe.mockResolvedValue(
      result({
        success: false,
        category: "rate-limit",
        status: 429,
        errorMessage: "rate limited",
      })
    );
    const composable = useConnectionTest(
      ref(source),
      computed(() => source)
    );
    await composable.handleTestKey({ key: "key-1", modelId: "model-1" });
    expect(mocks.reportFailure.mock.calls[0][3]).toEqual({
      allowAutoDisable: false,
      countTowardThreshold: false,
    });
  });

  it("passes explicit endpoint options to a single model probe", async () => {
    mocks.probe.mockResolvedValue(
      result({ kind: "inference", endpointType: "openai-responses" })
    );
    const composable = useConnectionTest(
      ref(source),
      computed(() => source)
    );

    await composable.handleTestModel(source.models[0], {
      endpointType: "openai-responses",
      stream: true,
    });

    expect(mocks.probe).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointType: "openai-responses",
        modelId: "model-1",
        stream: true,
      })
    );
  });

  it("reconciles all batch results and final progress after cancellation", async () => {
    const success = result({
      kind: "batch-model",
      endpointType: "openai-responses",
      modelId: "model-1",
    });
    const failure = result({
      success: false,
      kind: "batch-model",
      endpointType: "openai-responses",
      modelId: "model-2",
      category: "provider",
    });
    const cancelled = result({
      success: false,
      kind: "batch-model",
      endpointType: "openai-responses",
      modelId: "model-3",
      category: "cancelled",
    });
    mocks.probeBatch.mockImplementation(async (request) => {
      request.onResult?.(success, 1, 3);
      return [success, failure, cancelled];
    });
    const composable = useConnectionTest(
      ref(source),
      computed(() => source)
    );

    await composable.handleBatchTestModels(["model-1", "model-2", "model-3"], {
      endpointType: "openai-responses",
      concurrency: 2,
    });

    expect(mocks.probeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointType: "openai-responses",
        concurrency: 2,
      })
    );
    expect(composable.batchProgress.value).toEqual({
      completed: 3,
      total: 3,
      succeeded: 1,
      failed: 1,
      cancelled: 1,
    });
    expect(Object.keys(composable.modelProbeResults.value)).toEqual([
      "model-1",
      "model-2",
      "model-3",
    ]);
  });
});
