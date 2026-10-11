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

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { ChatAgent } from "../types/agent";

/** 两个配置入口都依据目标智能体解析模型，避免依赖当前聊天选择。 */
export function useAgentModelContext(
  agent: MaybeRefOrGetter<
    Pick<ChatAgent, "profileId" | "modelId"> | null | undefined
  >
) {
  const { enabledProfiles } = useLlmProfiles();
  const currentProfile = computed(() => {
    const target = toValue(agent);
    return enabledProfiles.value.find(
      (profile) => profile.id === target?.profileId
    );
  });
  const currentModel = computed(
    () =>
      currentProfile.value?.models.find(
        (model) => model.id === toValue(agent)?.modelId
      ) ?? null
  );
  const currentProviderType = computed(() => {
    const type = currentProfile.value?.type;
    // 保留 OpenAI 兼容渠道中 Gemini 模型的专属参数配置。
    return type === "openai" &&
      toValue(agent)?.modelId.toLowerCase().includes("gemini")
      ? "gemini"
      : type;
  });
  const contextLengthLimit = computed(() => {
    const limit = currentModel.value?.tokenLimits?.contextLength;
    return limit && limit > 0 ? limit : undefined;
  });
  return {
    currentProfile,
    currentModel,
    currentProviderType,
    contextLengthLimit,
  };
}
