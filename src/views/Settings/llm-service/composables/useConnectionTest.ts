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

/**
 * 连接测试逻辑
 * 负责渠道连接测试、模型可用性测试、Key 验证
 */
import { ref } from "vue";
import type { Ref, ComputedRef } from "vue";
import { customMessage } from "@/utils/customMessage";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmKeyManager } from "@/composables/useLlmKeyManager";
import { fetchModelsFromApi } from "@/llm-apis/model-fetcher";
import type { LlmProfile, LlmModelInfo } from "@/types/llm-profiles";

export function useConnectionTest(
  editForm: Ref<LlmProfile>,
  selectedProfile: ComputedRef<LlmProfile | null>
) {
  const { sendRequest } = useLlmRequest();
  const { updateKeyStatus, reportSuccess, reportFailure } = useLlmKeyManager();

  const isTestingConnection = ref(false);
  const modelTestLoading = ref<Record<string, boolean>>({});
  const keyTestLoading = ref<Record<string, boolean>>({});

  /**
   * 构造测试请求参数
   * 根据模型能力识别"特种模型"
   */
  const buildTestOptions = (
    profileId: string,
    model: LlmModelInfo,
    apiKey?: string
  ) => {
    const options: any = {
      profileId,
      modelId: model.id,
      apiKey,
      maxTokens: 10,
      stream: false,
      allowDisabledProfile: true,
      // B4.d: 探测性请求标记为 system-probe，便于 Inspector UI 过滤
      inspectorContext: {
        toolName: "settings-llm-service",
        purpose: "system-probe",
      },
    };

    const caps = model.capabilities || {};

    if (caps.embedding) {
      options.embeddingInput = "hi";
    } else if (caps.rerank) {
      options.rerankQuery = "hi";
      options.rerankDocuments = ["hello", "world"];
    } else {
      options.messages = [{ role: "user", content: "hi" }];
    }

    return options;
  };

  // 渠道连接测试
  const testConnection = async () => {
    if (!selectedProfile.value) return;

    isTestingConnection.value = true;
    const startTime = performance.now();
    try {
      const { models } = await fetchModelsFromApi(editForm.value);
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      if (models.length > 0) {
        customMessage.success(
          `连接成功！已检测到 ${models.length} 个模型 (耗时: ${duration}s)`
        );
      } else {
        customMessage.warning(
          `连接成功，但未返回任何模型 (耗时: ${duration}s)`
        );
      }
    } catch {
      // errorHandler 已在 fetchModelsFromApi 中 handle
    } finally {
      isTestingConnection.value = false;
    }
  };

  // 模型可用性测试
  const handleTestModel = async (model: LlmModelInfo) => {
    if (!selectedProfile.value) return;

    modelTestLoading.value[model.id] = true;
    const startTime = performance.now();
    try {
      const testOptions = buildTestOptions(selectedProfile.value.id, model);
      const response = await sendRequest(testOptions);
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);

      customMessage.success({
        message: `模型响应正常 (耗时: ${duration}s): "${response.content.substring(0, 100)}${
          response.content.length > 100 ? "..." : ""
        }"`,
        duration: 5000,
      });
    } catch {
      // errorHandler 已处理
    } finally {
      modelTestLoading.value[model.id] = false;
    }
  };

  // 多 Key 管理中的特定 Key 测试
  const handleTestKey = async ({
    key,
    modelId,
  }: {
    key: string;
    modelId: string;
  }) => {
    if (!selectedProfile.value) return;

    const model = selectedProfile.value.models.find((m) => m.id === modelId);
    if (!model) {
      customMessage.error("未找到测试模型");
      return;
    }

    keyTestLoading.value[key] = true;
    const startTime = performance.now();
    try {
      const testOptions = buildTestOptions(
        selectedProfile.value.id,
        model,
        key
      );
      const response = await sendRequest(testOptions);
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);

      updateKeyStatus(selectedProfile.value.id, key, {
        isBroken: false,
        isEnabled: true,
        lastUsedTime: Date.now(),
      });
      reportSuccess(selectedProfile.value.id, key);

      customMessage.success(
        `Key 验证成功 (耗时: ${duration}s): ${response.content.substring(0, 50)}...`
      );
    } catch (error: any) {
      updateKeyStatus(selectedProfile.value.id, key, {
        isBroken: true,
        lastErrorMessage: error.message || "测试请求失败",
      });
      reportFailure(selectedProfile.value.id, key, error);
    } finally {
      keyTestLoading.value[key] = false;
    }
  };

  return {
    isTestingConnection,
    modelTestLoading,
    keyTestLoading,
    testConnection,
    handleTestModel,
    handleTestKey,
  };
}
