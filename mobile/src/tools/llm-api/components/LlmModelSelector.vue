<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronDown, Bot } from "lucide-vue-next";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { useModelMetadata } from "../composables/useModelMetadata";
import { useI18n } from "@/i18n";
import type { LlmProfile, LlmModelInfo } from "../types";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import ModelSelectPopup from "./ModelSelectPopup.vue";

interface Props {
  modelValue: string; // 格式: profileId:modelId
  placeholder?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "",
  disabled: false,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "change", value: { profileId: string; modelId: string }): void;
}>();

const { tRaw } = useI18n();
const store = useLlmProfilesStore();

const displayPlaceholder = computed(
  () => props.placeholder || tRaw("tools.llm-api.common.选择模型")
);
const { getModelIcon } = useModelMetadata();

const showPopup = ref(false);

// 格式化所有可用模型（仅用于显示当前选中项）
const availableModels = computed(() => {
  const models: Array<{
    value: string; // profileId:modelId
    label: string;
    profile: LlmProfile;
    model: LlmModelInfo;
  }> = [];

  store.enabledProfiles.forEach((profile) => {
    profile.models.forEach((model) => {
      models.push({
        value: `${profile.id}:${model.id}`,
        label: model.name,
        profile,
        model,
      });
    });
  });

  return models;
});

// 当前选中的信息
const selectedInfo = computed(() => {
  return availableModels.value.find((m) => m.value === props.modelValue);
});

const handleSelect = (item: { value: string; profileId: string; modelId: string }) => {
  emit("update:modelValue", item.value);
  emit("change", { profileId: item.profileId, modelId: item.modelId });
};

const togglePopup = () => {
  if (props.disabled) return;
  showPopup.value = !showPopup.value;
};
</script>

<template>
  <div class="llm-model-selector" :class="{ disabled }" @click="togglePopup">
    <div class="selector-trigger" v-ripple>
      <div class="selected-content">
        <template v-if="selectedInfo">
          <DynamicIcon
            :src="getModelIcon(selectedInfo.model) || ''"
            :alt="selectedInfo.label"
            class="model-icon"
          />
          <span class="model-name">{{ selectedInfo.label }}</span>
        </template>
        <template v-else>
          <Bot :size="18" class="placeholder-icon" />
          <span class="placeholder-text">{{ displayPlaceholder }}</span>
        </template>
      </div>
      <ChevronDown :size="16" class="arrow-icon" :class="{ active: showPopup }" />
    </div>

    <!-- 模型选择弹窗 -->
    <ModelSelectPopup
      v-model:show="showPopup"
      :model-value="modelValue"
      @select="handleSelect"
    />
  </div>
</template>

<style scoped>
.llm-model-selector {
  width: 100%;
  max-width: 240px;
}

.selector-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--color-surface-container-high);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--color-outline-variant);
}

.selector-trigger:active {
  background: var(--color-surface-container-highest);
}

.selected-content {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.model-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  flex-shrink: 0;
}

.model-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.placeholder-icon {
  color: var(--color-on-surface-variant);
  opacity: 0.6;
}

.placeholder-text {
  font-size: 0.9rem;
  color: var(--color-on-surface-variant);
}

.arrow-icon {
  margin-left: 4px;
  color: var(--color-on-surface-variant);
  transition: transform 0.3s;
}

.arrow-icon.active {
  transform: rotate(180deg);
}

/* Popup Styles */
.model-select-popup {
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
}

.popup-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-outline-variant);
  background: var(--color-surface);
  position: sticky;
  top: 0;
  z-index: 10;
}

.popup-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-on-surface);
  text-align: center;
  margin-bottom: 12px;
}

.search-bar {
  padding: 0 4px;
}

.search-bar :deep(.var-input) {
  --input-placeholder-color: var(--color-on-surface-variant);
}

.popup-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 32px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-on-surface-variant);
}

.empty-state p {
  margin-bottom: 16px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 12px;
  padding-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.profile-group {
  margin-bottom: 24px;
}

.profile-group:last-child {
  margin-bottom: 0;
}

.model-sub-group {
  margin-bottom: 16px;
}

.model-sub-group:last-child {
  margin-bottom: 0;
}

.sub-group-header {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-on-surface-variant);
  margin-bottom: 8px;
  padding-left: 8px;
  opacity: 0.8;
  border-left: 2px solid var(--color-outline-variant);
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-surface-container);
  transition: all 0.2s;
}

.model-item:active {
  background: var(--color-surface-container-high);
}

.model-item.active {
  background: var(--color-primary-container);
  border: 1px solid var(--color-primary);
}

.item-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-on-surface);
  margin-bottom: 2px;
}

.item-id {
  font-size: 0.75rem;
  color: var(--color-on-surface-variant);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.disabled {
  opacity: 0.6;
  pointer-events: none;
}
</style>
