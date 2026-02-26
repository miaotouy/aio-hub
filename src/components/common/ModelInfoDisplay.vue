<template>
  <div v-if="resolvedInfo" class="model-info-display">
    <div class="model-info-row">
      <DynamicIcon
        :src="getModelIcon(resolvedInfo.model) || ''"
        :alt="resolvedInfo.model.name"
        class="info-icon"
      />
      <span class="info-text model-text">{{ resolvedInfo.model.name }}</span>
      <span class="info-separator">·</span>
      <DynamicIcon
        :src="resolvedInfo.profile.icon || resolvedInfo.profile.logoUrl || ''"
        :alt="resolvedInfo.profile.name"
        class="info-icon"
      />
      <span class="info-text profile-text">{{ resolvedInfo.profile.name }}</span>
    </div>
  </div>
  <div v-else class="model-info-display empty">
    <span class="info-text empty-text">{{ emptyText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { parseModelCombo } from "@/utils/modelIdUtils";
import type { LlmProfile, LlmModelInfo } from "@/types/llm-profiles";

const props = withDefaults(
  defineProps<{
    /** 模型组合标识，格式为 `profileId:modelId` */
    modelCombo: string;
    /** 未配置时的提示文字 */
    emptyText?: string;
  }>(),
  {
    modelCombo: "",
    emptyText: "未配置",
  }
);

const { profiles } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();

const resolvedInfo = computed(() => {
  if (!props.modelCombo) return null;
  const [profileId, modelId] = parseModelCombo(props.modelCombo);
  if (!profileId || !modelId) return null;
  const profile = profiles.value.find((p: LlmProfile) => p.id === profileId);
  if (!profile) return null;
  const model = profile.models.find((m: LlmModelInfo) => m.id === modelId);
  if (!model) return null;
  return { profile, model };
});
</script>

<style scoped>
.model-info-display {
  display: inline-flex;
  align-items: center;
}

.model-info-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  line-height: 1.2;
}

.info-icon {
  width: 15px;
  height: 15px;
  object-fit: contain;
  flex-shrink: 0;
}

.info-text {
  white-space: nowrap;
  color: var(--el-text-color-primary);
}

.model-text {
  font-weight: 600;
}

.profile-text {
  opacity: 0.65;
}

.info-separator {
  color: var(--el-text-color-placeholder);
  opacity: 0.5;
}

.empty-text {
  opacity: 0.45;
  font-size: 13px;
}
</style>