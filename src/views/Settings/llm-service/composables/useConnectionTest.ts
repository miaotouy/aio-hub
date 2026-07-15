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

import { ref, watch, type ComputedRef, type Ref } from "vue";
import { useLlmKeyManager } from "@/composables/useLlmKeyManager";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import { customMessage } from "@/utils/customMessage";
import { createChannelProbeService } from "../probe/channel-probe-service";
import { getKeyHealthAction } from "../probe/key-health-policy";
import type { ChannelProbeResult } from "../probe/types";

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
  const batchProgress = ref({ completed: 0, total: 0 });
  let batchController: AbortController | undefined;

  watch(
    () => selectedProfile.value?.id,
    () => {
      batchController?.abort("切换渠道");
      batchController = undefined;
      isBatchTesting.value = false;
      modelTestLoading.value = {};
      keyTestLoading.value = {};
      modelListResult.value = undefined;
      modelProbeResults.value = {};
      batchProgress.value = { completed: 0, total: 0 };
    }
  );

  const testConnection = async () => {
    if (!selectedProfile.value) return;
    isTestingConnection.value = true;
    try {
      const result = await probeService.probe({
        kind: "model-list",
        profile: editForm.value,
      });
      modelListResult.value = result;
      showResultMessage(result, "模型列表");
      return result;
    } finally {
      isTestingConnection.value = false;
    }
  };

  const handleTestModel = async (
    model: LlmModelInfo,
    options: { stream?: boolean; allowCostlyMedia?: boolean } = {}
  ) => {
    if (!selectedProfile.value) return;
    modelTestLoading.value[model.id] = true;
    try {
      const result = await probeService.probe({
        kind: "inference",
        profile: editForm.value,
        modelId: model.id,
        stream: options.stream,
        allowCostlyMedia: options.allowCostlyMedia,
      });
      modelProbeResults.value = {
        ...modelProbeResults.value,
        [model.id]: result,
      };
      showResultMessage(result, model.name || model.id);
      return result;
    } finally {
      modelTestLoading.value[model.id] = false;
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
      applyKeyHealthResult(snapshot.id, key, result);
      showResultMessage(result, "Key");
      return result;
    } finally {
      keyTestLoading.value[key] = false;
    }
  };

  const handleBatchTestModels = async (
    modelIds: string[],
    options: {
      concurrency?: number;
      stream?: boolean;
      allowCostlyMedia?: boolean;
    } = {}
  ) => {
    if (!selectedProfile.value || modelIds.length === 0) return [];
    batchController?.abort();
    batchController = new AbortController();
    isBatchTesting.value = true;
    batchProgress.value = { completed: 0, total: modelIds.length };
    modelIds.forEach((modelId) => {
      modelTestLoading.value[modelId] = true;
    });

    try {
      const results = await probeService.probeBatch({
        profile: editForm.value,
        modelIds,
        concurrency: options.concurrency,
        stream: options.stream,
        allowCostlyMedia: options.allowCostlyMedia,
        signal: batchController.signal,
        onResult: (result, completed, total) => {
          if (result.modelId) {
            modelProbeResults.value = {
              ...modelProbeResults.value,
              [result.modelId]: result,
            };
            modelTestLoading.value[result.modelId] = false;
          }
          batchProgress.value = { completed, total };
        },
      });
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
      modelIds.forEach((modelId) => {
        modelTestLoading.value[modelId] = false;
      });
      isBatchTesting.value = false;
      batchController = undefined;
    }
  };

  const cancelBatchTest = () => batchController?.abort("用户停止批量检查");

  function applyKeyHealthResult(
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
        reportSuccess(profileId, key);
        break;
      case "authentication-failure":
        reportFailure(profileId, key, error, { forceBroken: true });
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
      `${subject}检查失败 [${result.category ?? "unknown"}]：${
        result.errorMessage ?? "未知错误"
      }`
    );
  }
}

function formatDuration(value: number): string {
  return value < 1_000
    ? `${Math.round(value)} ms`
    : `${(value / 1_000).toFixed(2)} s`;
}

function cloneProfile(profile: LlmProfile): LlmProfile {
  return JSON.parse(JSON.stringify(profile));
}
