// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  getCurrentScope,
  onScopeDispose,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import { useLlmKeyManager } from "@/composables/useLlmKeyManager";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import { customMessage } from "@/utils/customMessage";
import { createChannelProbeService } from "../probe/channel-probe-service";
import { getKeyHealthAction } from "@/llm-apis/key-health-policy";
import type {
  BatchProbeProgress,
  ChannelProbeResult,
  ProbeEndpointType,
} from "../probe/types";

const probeService = createChannelProbeService();

export function useConnectionTest(
  editForm: Ref<LlmProfile>,
  selectedProfile: ComputedRef<LlmProfile | null>
) {
  const { syncKeyStates, reportSuccess, reportFailure } = useLlmKeyManager();
  const isTestingConnection = ref(false);
  const isBatchTesting = ref(false);
  const modelTestLoading = ref<Record<string, boolean>>({});
  const keyTestLoading = ref<Record<string, boolean>>({});
  const modelListResult = ref<ChannelProbeResult>();
  const modelProbeResults = ref<Record<string, ChannelProbeResult>>({});
  const batchProgress = ref<BatchProbeProgress>(createEmptyBatchProgress());
  let batchController: AbortController | undefined;
  let keyBatchController: AbortController | undefined;
  const isKeyBatchTesting = ref(false);
  const cancelKeyBatchTest = () => {
    keyBatchController?.abort("结束密钥检查");
    keyBatchController = undefined;
    isKeyBatchTesting.value = false;
    keyTestLoading.value = {};
  };
  let channelEpoch = 0;

  watch(
    () => selectedProfile.value?.id,
    () => {
      ++channelEpoch;
      cancelKeyBatchTest();
      isTestingConnection.value = false;
      batchController?.abort("切换渠道");
      batchController = undefined;
      isBatchTesting.value = false;
      modelTestLoading.value = {};
      keyTestLoading.value = {};
      modelListResult.value = undefined;
      modelProbeResults.value = {};
      batchProgress.value = createEmptyBatchProgress();
    },
    { flush: "sync" }
  );
  if (getCurrentScope())
    onScopeDispose(() => {
      ++channelEpoch;
      batchController?.abort("关闭渠道设置");
      cancelKeyBatchTest();
    });

  const testConnection = async () => {
    if (!selectedProfile.value) return;
    const epoch = channelEpoch;
    isTestingConnection.value = true;
    try {
      const result = await probeService.probe({
        kind: "model-list",
        profile: cloneProfile(editForm.value),
      });
      if (epoch !== channelEpoch) return result;
      modelListResult.value = result;
      showResultMessage(result, "模型列表");
      return result;
    } finally {
      if (epoch === channelEpoch) isTestingConnection.value = false;
    }
  };

  const handleTestModel = async (
    model: LlmModelInfo,
    options: {
      endpointType?: ProbeEndpointType;
      stream?: boolean;
      allowCostlyMedia?: boolean;
    } = {}
  ) => {
    if (!selectedProfile.value) return;
    const epoch = channelEpoch;
    modelTestLoading.value[model.id] = true;
    try {
      const result = await probeService.probe({
        kind: "inference",
        profile: cloneProfile(editForm.value),
        modelId: model.id,
        endpointType: options.endpointType,
        stream: options.stream,
        allowCostlyMedia: options.allowCostlyMedia,
      });
      if (epoch !== channelEpoch) return result;
      modelProbeResults.value = {
        ...modelProbeResults.value,
        [model.id]: result,
      };
      showResultMessage(result, model.name || model.id);
      return result;
    } finally {
      if (epoch === channelEpoch) modelTestLoading.value[model.id] = false;
    }
  };

  const handleTestKey = async ({
    key,
    modelId,
  }: {
    key: string;
    modelId: string;
  }) => {
    if (!selectedProfile.value) return;
    const model = editForm.value.models.find((item) => item.id === modelId);
    if (!model) {
      customMessage.error("未找到测试模型");
      return;
    }

    const epoch = channelEpoch;
    keyTestLoading.value[key] = true;
    try {
      const snapshot = cloneProfile(editForm.value);
      syncKeyStates(snapshot);
      const result = await probeService.probe({
        kind: "key",
        profile: snapshot,
        modelId,
        apiKey: key,
      });
      await applyKeyHealthResult(snapshot.id, key, result);
      if (epoch === channelEpoch) showResultMessage(result, "Key");
      return result;
    } finally {
      if (epoch === channelEpoch) keyTestLoading.value[key] = false;
    }
  };

  const handleBatchTestKeys = async ({
    keys,
    modelId,
  }: {
    keys: string[];
    modelId: string;
  }) => {
    if (!selectedProfile.value) return;
    const snapshot = cloneProfile(editForm.value);
    if (!snapshot.models.some((model) => model.id === modelId)) {
      customMessage.error("未找到测试模型");
      return;
    }
    cancelKeyBatchTest();
    const controller = new AbortController();
    keyBatchController = controller;
    isKeyBatchTesting.value = true;
    const epoch = channelEpoch;
    syncKeyStates(snapshot);
    keys.forEach((key) => {
      keyTestLoading.value[key] = true;
    });
    try {
      return await probeService.probeKeyBatch({
        profile: snapshot,
        modelId,
        keys: [...keys],
        signal: controller.signal,
        onResult: async (key, result) => {
          await applyKeyHealthResult(snapshot.id, key, result);
          if (epoch === channelEpoch && keyBatchController === controller) {
            keyTestLoading.value[key] = false;
            showResultMessage(result, "Key");
          }
        },
      });
    } finally {
      if (keyBatchController === controller) cancelKeyBatchTest();
    }
  };

  const handleBatchTestModels = async (
    modelIds: string[],
    options: {
      concurrency?: number;
      endpointType?: ProbeEndpointType;
      stream?: boolean;
      allowCostlyMedia?: boolean;
    } = {}
  ) => {
    if (!selectedProfile.value || modelIds.length === 0) return [];
    batchController?.abort();
    const controller = new AbortController();
    batchController = controller;
    const epoch = channelEpoch;
    const isCurrentBatch = () =>
      epoch === channelEpoch && batchController === controller;
    isBatchTesting.value = true;
    batchProgress.value = {
      ...createEmptyBatchProgress(),
      total: modelIds.length,
    };
    modelIds.forEach((modelId) => {
      modelTestLoading.value[modelId] = true;
    });

    try {
      const results = await probeService.probeBatch({
        profile: cloneProfile(editForm.value),
        modelIds,
        concurrency: options.concurrency,
        endpointType: options.endpointType,
        stream: options.stream,
        allowCostlyMedia: options.allowCostlyMedia,
        signal: controller.signal,
        onResult: (result, completed, total) => {
          if (!isCurrentBatch()) return;
          if (result.modelId) {
            modelProbeResults.value = {
              ...modelProbeResults.value,
              [result.modelId]: result,
            };
            modelTestLoading.value[result.modelId] = false;
          }
          const previous = batchProgress.value;
          batchProgress.value = {
            completed,
            total,
            succeeded: previous.succeeded + (result.success ? 1 : 0),
            failed:
              previous.failed +
              (!result.success && result.category !== "cancelled" ? 1 : 0),
            cancelled:
              previous.cancelled + (result.category === "cancelled" ? 1 : 0),
          };
        },
      });
      if (!isCurrentBatch()) return results;
      const nextResults = { ...modelProbeResults.value };
      for (const result of results) {
        if (!result.modelId) continue;
        nextResults[result.modelId] = result;
        modelTestLoading.value[result.modelId] = false;
      }
      modelProbeResults.value = nextResults;
      batchProgress.value = summarizeBatchProgress(results);
      const succeeded = results.filter((result) => result.success).length;
      const cancelled = results.filter(
        (result) => result.category === "cancelled"
      ).length;
      customMessage.info(
        cancelled > 0
          ? `批量检查已停止：${succeeded} 个成功，${cancelled} 个已取消`
          : `批量检查完成：${succeeded}/${results.length} 个成功`
      );
      return results;
    } finally {
      if (isCurrentBatch()) {
        modelIds.forEach((modelId) => {
          modelTestLoading.value[modelId] = false;
        });
        isBatchTesting.value = false;
        batchController = undefined;
      }
    }
  };

  const cancelBatchTest = () => batchController?.abort("用户停止批量检查");

  async function applyKeyHealthResult(
    profileId: string,
    key: string,
    result: ChannelProbeResult
  ) {
    const error = Object.assign(
      new Error(result.errorMessage ?? "Key 检查失败"),
      {
        status: result.status,
      }
    );
    switch (getKeyHealthAction(result)) {
      case "success":
        await reportSuccess(profileId, key);
        break;
      case "authentication-failure":
        await reportFailure(profileId, key, error, { forceBroken: true });
        break;
      case "rate-limit-failure":
        reportFailure(profileId, key, error);
        break;
      case "transient-failure":
        reportFailure(profileId, key, error, {
          treatRateLimitAsImmediateBreak: false,
        });
        break;
      case "record-only":
        reportFailure(profileId, key, error, {
          allowAutoDisable: false,
          countTowardThreshold: false,
        });
        break;
      case "ignore":
        break;
    }
  }

  return {
    isTestingConnection,
    isBatchTesting,
    modelTestLoading,
    keyTestLoading,
    modelListResult,
    modelProbeResults,
    batchProgress,
    testConnection,
    handleTestModel,
    handleTestKey,
    handleBatchTestKeys,
    isKeyBatchTesting,
    cancelKeyBatchTest,
    handleBatchTestModels,
    cancelBatchTest,
  };
}

function showResultMessage(result: ChannelProbeResult, subject: string) {
  if (result.success) {
    customMessage.success(
      `${subject}检查成功 (${formatDuration(result.totalMs)})${
        result.responsePreview ? `：${result.responsePreview}` : ""
      }`
    );
    return;
  }
  if (result.category !== "cancelled") {
    customMessage.error(
      `${subject}检查失败 [${categoryLabel(result.category)}]：${
        result.errorMessage ?? "未知错误"
      }`
    );
  }
}

function categoryLabel(category: ChannelProbeResult["category"]): string {
  if (!category) return "unknown";
  const labels: Partial<
    Record<NonNullable<ChannelProbeResult["category"]>, string>
  > = {
    proxy: "本地代理/未连上",
    network: "网络",
    timeout: "超时",
    authentication: "认证",
    authorization: "授权",
    "rate-limit": "限流",
    "bad-request": "请求错误",
    "model-unavailable": "模型不可用",
    "unsupported-capability": "能力不支持",
    configuration: "配置",
    provider: "服务端",
    unknown: "未知",
  };
  return labels[category] ?? category;
}

function formatDuration(value: number): string {
  return value < 1_000
    ? `${Math.round(value)} ms`
    : `${(value / 1_000).toFixed(2)} s`;
}

function cloneProfile(profile: LlmProfile): LlmProfile {
  return JSON.parse(JSON.stringify(profile));
}

function createEmptyBatchProgress(): BatchProbeProgress {
  return {
    completed: 0,
    total: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
  };
}

function summarizeBatchProgress(
  results: ChannelProbeResult[]
): BatchProbeProgress {
  return results.reduce<BatchProbeProgress>(
    (progress, result) => ({
      completed: progress.completed + 1,
      total: progress.total,
      succeeded: progress.succeeded + (result.success ? 1 : 0),
      failed:
        progress.failed +
        (!result.success && result.category !== "cancelled" ? 1 : 0),
      cancelled: progress.cancelled + (result.category === "cancelled" ? 1 : 0),
    }),
    { ...createEmptyBatchProgress(), total: results.length }
  );
}
