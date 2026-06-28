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
