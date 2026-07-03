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

import { computed } from "vue";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import { parseModelCombo } from "@/utils/modelIdUtils";

export interface EmbeddingModelOption {
  value: string;
  label: string;
  group: string;
  profile: LlmProfile;
  model: LlmModelInfo;
  profileId: string;
  modelId: string;
  profileIndex: number;
}

export interface EmbeddingModelTarget {
  combo: string;
  label: string;
  profile: LlmProfile;
  modelId: string;
}

export function useEmbeddingModelOptions() {
  const { enabledProfiles } = useLlmProfiles();

  const availableEmbeddingModels = computed<EmbeddingModelOption[]>(() => {
    const models: EmbeddingModelOption[] = [];

    enabledProfiles.value.forEach((profile, profileIndex) => {
      profile.models.forEach((model) => {
        if (model.capabilities?.embedding !== true) return;
        if (model.capabilities?.rerank === true) return;

        models.push({
          value: `${profile.id}:${model.id}`,
          label: model.name || model.id,
          group: `${profile.name} (${profile.type})`,
          profile,
          model,
          profileId: profile.id,
          modelId: model.id,
          profileIndex,
        });
      });
    });

    return models.sort((a, b) => {
      if (a.profileIndex !== b.profileIndex) {
        return a.profileIndex - b.profileIndex;
      }
      return a.model.id.localeCompare(b.model.id);
    });
  });

  const modelGroups = computed(() => {
    const groups: string[] = [];
    availableEmbeddingModels.value.forEach((model) => {
      if (!groups.includes(model.group)) {
        groups.push(model.group);
      }
    });
    return groups;
  });

  const resolveModelCombo = (
    combo: string | null | undefined
  ): EmbeddingModelTarget | null => {
    if (!combo) return null;
    const [profileId, modelId] = parseModelCombo(combo);
    const option = availableEmbeddingModels.value.find(
      (item) => item.profileId === profileId && item.modelId === modelId
    );
    if (!option) return null;

    return {
      combo: option.value,
      label: option.label,
      profile: option.profile,
      modelId: option.modelId,
    };
  };

  const buildSingleModelCombo = (
    profile: LlmProfile | null,
    modelId: string
  ) => {
    if (!profile || !modelId) return "";
    return `${profile.id}:${modelId}`;
  };

  return {
    availableEmbeddingModels,
    modelGroups,
    resolveModelCombo,
    buildSingleModelCombo,
  };
}
