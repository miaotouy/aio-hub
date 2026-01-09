<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { ChevronDown, Bot } from "lucide-vue-next";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { useModelMetadata } from "../composables/useModelMetadata";
import { useI18n } from "@/i18n";
import type { LlmProfile, LlmModelInfo } from "../types";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

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

const router = useRouter();
const { tRaw } = useI18n();
const store = useLlmProfilesStore();

const displayPlaceholder = computed(
  () => props.placeholder || tRaw("tools.llm-api.common.选择模型")
);
const { getModelIcon } = useModelMetadata();

const showPopup = ref(false);

// 格式化所有可用模型
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

// 按 Profile 分组
const modelGroups = computed(() => {
  const groups = new Map<string, typeof availableModels.value>();

  availableModels.value.forEach((item) => {
    const groupName = `${item.profile.name} (${item.profile.type})`;
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName)!.push(item);
  });

  return Array.from(groups.entries()).map(([name, items]) => ({
    name,
    items,
  }));
});

// 当前选中的信息
const selectedInfo = computed(() => {
  return availableModels.value.find((m) => m.value === props.modelValue);
});

const handleSelect = (item: (typeof availableModels.value)[0]) => {
  emit("update:modelValue", item.value);
  emit("change", { profileId: item.profile.id, modelId: item.model.id });
  showPopup.value = false;
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
    <var-popup position="bottom" v-model:show="showPopup" round>
      <div class="model-select-popup">
        <div class="popup-header">
          <div class="popup-title">{{ tRaw("tools.llm-api.common.选择模型") }}</div>
        </div>

        <div class="popup-content">
          <div v-if="modelGroups.length === 0" class="empty-state">
            <p>{{ tRaw("tools.llm-api.common.未配置模型") }}</p>
            <var-button type="primary" size="small" @click="router.push('/tools/llm-api')">
              {{ tRaw("tools.llm-api.common.去配置") }}
            </var-button>
          </div>

          <div v-else class="group-list">
            <div v-for="group in modelGroups" :key="group.name" class="model-group">
              <div class="group-header">{{ group.name }}</div>
              <div class="group-items">
                <div
                  v-for="item in group.items"
                  :key="item.value"
                  class="model-item"
                  :class="{ active: modelValue === item.value }"
                  v-ripple
                  @click="handleSelect(item)"
                >
                  <DynamicIcon
                    :src="getModelIcon(item.model) || ''"
                    :alt="item.label"
                    class="item-icon"
                  />
                  <div class="item-info">
                    <div class="item-name">{{ item.label }}</div>
                    <div class="item-id">{{ item.model.id }}</div>
                  </div>
                  <var-radio
                    v-if="modelValue === item.value"
                    :model-value="true"
                    readonly
                    checked-value="true"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </var-popup>
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
  padding: 16px;
  text-align: center;
  border-bottom: 1px solid var(--color-outline-variant);
}

.popup-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-on-surface);
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

.group-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 8px;
  padding-left: 4px;
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
