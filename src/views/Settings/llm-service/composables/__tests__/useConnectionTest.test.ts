import { computed, effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelProbeResult } from "../../probe/types";
import type { LlmProfile } from "@/types/llm-profiles";

const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  probeBatch: vi.fn(),
  probeKeyBatch: vi.fn(),
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
    probeKeyBatch: mocks.probeKeyBatch,
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

  it("records configuration failures without counting them", async () => {
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
    expect(mocks.reportFailure.mock.calls[0][3]).toEqual({
      allowAutoDisable: false,
      countTowardThreshold: false,
    });
    expect(mocks.reportSuccess).not.toHaveBeenCalled();
  });

  it("records bad requests without counting them", async () => {
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
    expect(mocks.reportFailure.mock.calls[0][3]).toEqual({
      allowAutoDisable: false,
      countTowardThreshold: false,
    });
    expect(mocks.reportSuccess).not.toHaveBeenCalled();
  });

  it("lets rate limits trigger the breaker when it is enabled", async () => {
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
    expect(mocks.reportFailure.mock.calls[0][3]).toBeUndefined();
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
  it("keeps late model and model-list probe results attached to the channel that started them", async () => {
    const pending: Array<(value: ChannelProbeResult) => void> = [];
    mocks.probe.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve))
    );
    const selected = ref<LlmProfile>(structuredClone(source));
    const form = ref<LlmProfile>(structuredClone(source));
    const scope = effectScope();
    try {
      const value = scope.run(() =>
        useConnectionTest(
          form,
          computed(() => selected.value)
        )
      )!;
      const first = value.testConnection();
      const second = value.handleTestModel(source.models[0]);
      selected.value = { ...selected.value, id: "another-channel" };
      form.value = JSON.parse(JSON.stringify(selected.value));
      await nextTick();
      pending.forEach((resolve) =>
        resolve(result({ kind: "inference", modelId: "model-1" }))
      );
      await Promise.all([first, second]);
      expect(value.modelListResult.value).toBeUndefined();
      expect(value.modelProbeResults.value).toEqual({});
      expect(value.isTestingConnection.value).toBe(false);
      expect(mocks.messageSuccess).not.toHaveBeenCalled();
    } finally {
      scope.stop();
    }
  });

  it("ignores cancelled-channel batch callbacks while another channel is being checked", async () => {
    let finish!: (value: ChannelProbeResult[]) => void;
    let request: {
      signal: AbortSignal;
      onResult: (
        result: ChannelProbeResult,
        completed: number,
        total: number
      ) => void;
    };
    mocks.probeBatch.mockImplementation((input) => {
      request = input;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const selected = ref<LlmProfile>(structuredClone(source));
    const form = ref<LlmProfile>(structuredClone(source));
    const scope = effectScope();
    try {
      const value = scope.run(() =>
        useConnectionTest(
          form,
          computed(() => selected.value)
        )
      )!;
      const running = value.handleBatchTestModels(["model-1"]);
      selected.value = { ...selected.value, id: "another-channel" };
      form.value = JSON.parse(JSON.stringify(selected.value));
      await nextTick();
      expect(request!.signal.aborted).toBe(true);
      const late = result({ modelId: "model-1" });
      request!.onResult(late, 1, 1);
      finish([late]);
      await running;
      expect(value.modelProbeResults.value).toEqual({});
      expect(value.batchProgress.value.total).toBe(0);
      expect(mocks.messageInfo).not.toHaveBeenCalled();
    } finally {
      scope.stop();
    }
  });
});

it("cancels a key batch on channel switch and keeps health writes attached to its origin", async () => {
  const edit = ref(structuredClone(source));
  const selected = ref(structuredClone(source));
  const scope = effectScope();
  const value = scope.run(() =>
    useConnectionTest(
      edit,
      computed(() => selected.value)
    )
  )!;
  let batch!: Parameters<
    ReturnType<
      typeof import("../../probe/channel-probe-service").createChannelProbeService
    >["probeKeyBatch"]
  >[0];
  let finish!: () => void;
  mocks.probeKeyBatch.mockImplementation((request) => {
    batch = request;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const pending = value.handleBatchTestKeys({
    keys: ["origin-key", "next-key"],
    modelId: "model-1",
  });
  selected.value = {
    ...source,
    id: "destination",
    baseUrl: "https://other.test",
  };
  edit.value = JSON.parse(JSON.stringify(selected.value));
  expect(batch.signal?.aborted).toBe(true);
  expect(batch.profile.id).toBe(source.id);
  await batch.onResult?.("origin-key", result());
  expect(mocks.reportSuccess).toHaveBeenLastCalledWith(source.id, "origin-key");
  finish();
  await pending;
  expect(value.isKeyBatchTesting.value).toBe(false);
  scope.stop();
});
