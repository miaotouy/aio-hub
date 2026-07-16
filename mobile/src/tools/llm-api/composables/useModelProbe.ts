import { computed, reactive, ref, watch, type Ref } from "vue";
import { resolveProbePlan, type ChannelProbeResult } from "@aiohub/llm-core";
import type { LlmProfile } from "../types";
import { createChannelProbeService } from "../probe/channel-probe-service";

export type ModelProbeRowStatus =
  | "idle"
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "stopped"
  | "unsupported";

export interface ModelProbeOptions {
  concurrency: 1 | 2 | 3 | 4;
  streamChat: boolean;
  timeoutMs: number;
}

export interface ModelProbeService {
  probeBatch: ReturnType<typeof createChannelProbeService>["probeBatch"];
}

export function useModelProbe(
  profile: Ref<LlmProfile | null>,
  service: ModelProbeService = createChannelProbeService()
) {
  const selectedIds = ref<string[]>([]);
  const runOrder = ref<string[]>([]);
  const results = reactive<Record<string, ChannelProbeResult>>({});
  const rowStatuses = reactive<Record<string, ModelProbeRowStatus>>({});
  const rowStartedAt = reactive<Record<string, number>>({});
  const isRunning = ref(false);
  const completedCount = ref(0);
  const snapshotFingerprint = ref<string>();
  const controller = ref<AbortController>();
  const options = reactive<ModelProbeOptions>({
    concurrency: 3,
    streamChat: false,
    timeoutMs: 60_000,
  });

  const currentFingerprint = computed(() =>
    profile.value ? createProfileProbeFingerprint(profile.value) : ""
  );
  const isStale = computed(
    () =>
      Boolean(snapshotFingerprint.value) &&
      snapshotFingerprint.value !== currentFingerprint.value
  );
  const successCount = computed(
    () => runOrder.value.filter((id) => results[id]?.success).length
  );
  const failedCount = computed(
    () =>
      runOrder.value.filter(
        (id) =>
          results[id] &&
          !results[id].success &&
          results[id].category !== "cancelled"
      ).length
  );
  const stoppedCount = computed(
    () =>
      runOrder.value.filter((id) => results[id]?.category === "cancelled")
        .length
  );
  const runningCount = computed(
    () => runOrder.value.filter((id) => rowStatuses[id] === "running").length
  );
  const waitingCount = computed(
    () => runOrder.value.filter((id) => rowStatuses[id] === "queued").length
  );
  const progress = computed(() =>
    runOrder.value.length
      ? Math.round((completedCount.value / runOrder.value.length) * 100)
      : 0
  );

  function open(initialModelId?: string) {
    const models = profile.value?.models ?? [];
    if (initialModelId && models.some((model) => model.id === initialModelId)) {
      selectedIds.value = [initialModelId];
      return;
    }
    if (selectedIds.value.length === 0) {
      selectedIds.value = models
        .filter((model) => resolveProbePlan(model).supported)
        .map((model) => model.id);
    }
  }

  async function run(
    modelIds = selectedIds.value,
    runOptions: { allowCostlyMedia?: boolean } = {}
  ) {
    if (!profile.value || isRunning.value || modelIds.length === 0) return;
    const snapshot = cloneProfile(profile.value);
    const orderedIds = snapshot.models
      .map((model) => model.id)
      .filter((id) => modelIds.includes(id));
    if (orderedIds.length === 0) return;

    controller.value = new AbortController();
    isRunning.value = true;
    completedCount.value = 0;
    runOrder.value = orderedIds;
    snapshotFingerprint.value = createProfileProbeFingerprint(snapshot);
    for (const id of orderedIds) {
      delete results[id];
      delete rowStartedAt[id];
      rowStatuses[id] = "queued";
    }

    try {
      const batchResults = await service.probeBatch({
        profile: snapshot,
        modelIds: orderedIds,
        concurrency: options.concurrency,
        stream: options.streamChat,
        timeoutMs: options.timeoutMs,
        signal: controller.value.signal,
        allowCostlyMedia: runOptions.allowCostlyMedia,
        onStart(modelId) {
          rowStatuses[modelId] = "running";
          rowStartedAt[modelId] = Date.now();
        },
        onResult(result, completed) {
          if (result.modelId) {
            results[result.modelId] = result;
            rowStatuses[result.modelId] = statusFromResult(result);
          }
          completedCount.value = completed;
        },
      });
      batchResults.forEach((result) => {
        if (!result.modelId) return;
        results[result.modelId] = result;
        rowStatuses[result.modelId] = statusFromResult(result);
      });
      completedCount.value = batchResults.length;
    } finally {
      isRunning.value = false;
      controller.value = undefined;
    }
  }

  function stop() {
    controller.value?.abort(new DOMException("检查已停止", "AbortError"));
  }

  function retryFailed(allowCostlyMedia = false) {
    const ids = runOrder.value.filter((id) => {
      const result = results[id];
      return result && !result.success;
    });
    return run(ids, { allowCostlyMedia });
  }

  function resetSelection() {
    selectedIds.value = [];
    runOrder.value = [];
    completedCount.value = 0;
  }

  function clearSession() {
    stop();
    selectedIds.value = [];
    runOrder.value = [];
    completedCount.value = 0;
    snapshotFingerprint.value = undefined;
    for (const key of Object.keys(results)) delete results[key];
    for (const key of Object.keys(rowStatuses)) delete rowStatuses[key];
    for (const key of Object.keys(rowStartedAt)) delete rowStartedAt[key];
  }

  watch(
    () => profile.value?.id,
    (next, previous) => {
      if (previous && next !== previous) clearSession();
    }
  );

  return {
    selectedIds,
    runOrder,
    results,
    rowStatuses,
    rowStartedAt,
    isRunning,
    completedCount,
    successCount,
    failedCount,
    stoppedCount,
    runningCount,
    waitingCount,
    progress,
    isStale,
    options,
    open,
    run,
    stop,
    retryFailed,
    resetSelection,
    clearSession,
  };
}

export function createProfileProbeFingerprint(profile: LlmProfile): string {
  return stableStringify({
    type: profile.type,
    baseUrl: profile.baseUrl,
    apiKeys: profile.apiKeys.map(hashSensitiveValue),
    customHeaders: Object.fromEntries(
      Object.entries(profile.customHeaders ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key.toLowerCase(), hashSensitiveValue(value)])
    ),
    customEndpoints: profile.customEndpoints,
    networkStrategy: profile.networkStrategy,
    relaxIdCerts: profile.relaxIdCerts,
    http1Only: profile.http1Only,
    options: hashSensitiveObject(profile.options),
    models: profile.models.map((model) => ({
      id: model.id,
      capabilities: model.capabilities,
    })),
  });
}

function statusFromResult(result: ChannelProbeResult): ModelProbeRowStatus {
  if (result.success) return "success";
  if (result.category === "cancelled") return "stopped";
  if (result.category === "unsupported-capability") return "unsupported";
  return "failed";
}

function cloneProfile(profile: LlmProfile): LlmProfile {
  return JSON.parse(JSON.stringify(profile));
}

function hashSensitiveValue(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v${value.length}:${(hash >>> 0).toString(16)}`;
}

function hashSensitiveObject(value: unknown): unknown {
  if (typeof value === "string") return hashSensitiveValue(value);
  if (Array.isArray(value)) return value.map(hashSensitiveObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        hashSensitiveObject(item),
      ])
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
