<script setup lang="ts">
import { ref, computed } from "vue";
import { merge } from "lodash-es";
import { ChevronLeft, Search, Check, Plus, Filter } from "lucide-vue-next";
import type { LlmModelInfo } from "../types";
import { useModelMetadata } from "../composables/useModelMetadata";
import { MODEL_CAPABILITIES } from "../config/model-capabilities";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

interface Props {
  show: boolean;
  models: LlmModelInfo[];
  existingModels: LlmModelInfo[];
}

const props = defineProps<Props>();

interface Emits {
  (e: "update:show", value: boolean): void;
  (e: "add-models", models: LlmModelInfo[]): void;
}

const emit = defineEmits<Emits>();

const { getModelIcon, getModelGroup, getMatchedProperties } = useModelMetadata();

const searchQuery = ref("");
const selectedCapabilities = ref<string[]>([]);
const selectedModels = ref<LlmModelInfo[]>([]);
const expandedGroups = ref<string[]>([]);

const groupedModels = computed(() => {
  const groups: Record<string, LlmModelInfo[]> = {};

  for (const model of props.models) {
    const groupName = getModelGroup(model);
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(model);
  }

  return groups;
});

const filteredGroups = computed(() => {
  const query = searchQuery.value ? searchQuery.value.toLowerCase() : "";
  const caps = selectedCapabilities.value;

  if (!query && caps.length === 0) {
    return groupedModels.value;
  }

  const result: Record<string, LlmModelInfo[]> = {};
  for (const group in groupedModels.value) {
    const filtered = groupedModels.value[group].filter((model) => {
      const matchesQuery =
        !query ||
        model.id.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query);
      if (!matchesQuery) return false;

      if (caps.length > 0) {
        const modelCaps = getActiveCapabilities(model).map((c) => c.key) as string[];
        const hasAllCaps = caps.every((cap) => modelCaps.includes(cap));
        if (!hasAllCaps) return false;
      }

      return true;
    });

    if (filtered.length > 0) {
      result[group] = filtered;
    }
  }
  return result;
});

const isModelExisting = (modelId: string) => {
  return props.existingModels.some((m) => m.id === modelId);
};

const isModelSelected = (model: LlmModelInfo) => {
  return selectedModels.value.some((m: LlmModelInfo) => m.id === model.id);
};

const toggleModelSelection = (model: LlmModelInfo) => {
  if (isModelExisting(model.id)) return;
  const index = selectedModels.value.findIndex((m: LlmModelInfo) => m.id === model.id);
  if (index > -1) {
    selectedModels.value.splice(index, 1);
  } else {
    selectedModels.value.push(model);
  }
};

const allVisibleModels = computed(() => {
  return Object.values(filteredGroups.value).flat();
});

const isAllSelected = computed(() => {
  if (allVisibleModels.value.length === 0) return false;
  return allVisibleModels.value.every((m) => isModelSelected(m) || isModelExisting(m.id));
});

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    // 取消选中当前可见的所有已选模型
    const visibleIds = new Set(allVisibleModels.value.map((m) => m.id));
    selectedModels.value = selectedModels.value.filter((m) => !visibleIds.has(m.id));
  } else {
    // 选中当前可见的所有未存在模型
    for (const model of allVisibleModels.value) {
      if (!isModelSelected(model) && !isModelExisting(model.id)) {
        selectedModels.value.push(model);
      }
    }
  }
};

const toggleGroupSelection = (groupModels: LlmModelInfo[]) => {
  const allInGroupSelected = groupModels.every((m) => isModelSelected(m) || isModelExisting(m.id));

  if (allInGroupSelected) {
    const groupIds = new Set(groupModels.map((m) => m.id));
    selectedModels.value = selectedModels.value.filter((m) => !groupIds.has(m.id));
  } else {
    for (const model of groupModels) {
      if (!isModelSelected(model) && !isModelExisting(model.id)) {
        selectedModels.value.push(model);
      }
    }
  }
};

const handleConfirm = () => {
  const modelsToAdd = selectedModels.value.map((model: LlmModelInfo) => {
    const matchedProps = getMatchedProperties(model.id, model.provider);
    return {
      ...model,
      name: model.name || formatModelName(model.id),
      group: matchedProps?.group || getModelGroup(model),
      icon: matchedProps?.icon || model.icon,
      capabilities: merge({}, matchedProps?.capabilities || {}, model.capabilities || {}),
    };
  });
  emit("add-models", modelsToAdd);
  closePopup();
};

const closePopup = () => {
  emit("update:show", false);
};

const formatModelName = (modelId: string): string => {
  const lastSlashIndex = modelId.lastIndexOf("/");
  let name = lastSlashIndex !== -1 ? modelId.substring(lastSlashIndex + 1) : modelId;
  name = name.replace(/-/g, " ");
  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  return name;
};

const getModelCapabilities = (model: LlmModelInfo) => {
  const matchedProps = getMatchedProperties(model.id, model.provider);
  const matchedCapabilities = matchedProps?.capabilities || {};
  const modelCapabilities = model.capabilities || {};
  return merge({}, matchedCapabilities, modelCapabilities);
};

const getActiveCapabilities = (model: LlmModelInfo) => {
  const capabilities = getModelCapabilities(model);
  return MODEL_CAPABILITIES.filter((cap) => capabilities[cap.key as keyof typeof capabilities]);
};

const toggleCapabilityFilter = (capKey: string) => {
  const key = capKey;
  const index = selectedCapabilities.value.indexOf(key);
  if (index > -1) {
    selectedCapabilities.value.splice(index, 1);
  } else {
    selectedCapabilities.value.push(key);
  }
};
</script>

<template>
  <var-popup
    :show="show"
    @update:show="closePopup"
    position="right"
    style="width: 100%; height: 100%"
  >
    <div class="fetcher-popup">
      <var-app-bar title="从 API 添加模型" fixed safe-area>
        <template #left>
          <var-button round text @click="closePopup">
            <ChevronLeft :size="24" />
          </var-button>
        </template>
        <template #right>
          <var-button type="primary" :disabled="selectedModels.length === 0" @click="handleConfirm">
            添加
          </var-button>
        </template>
      </var-app-bar>

      <div class="fetcher-content">
        <div class="search-section">
          <div class="search-bar">
            <Search :size="16" class="search-icon" />
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="搜索模型名称或 ID..."
            />
          </div>

          <div class="capability-filters">
            <div class="filter-label">
              <Filter :size="14" />
              <span>能力筛选</span>
            </div>
            <div class="filter-chips">
              <div
                v-for="cap in MODEL_CAPABILITIES"
                :key="String(cap.key)"
                class="filter-chip"
                :class="{
                  active: selectedCapabilities.includes(String(cap.key)),
                }"
                :style="{
                  '--cap-color': cap.color,
                  '--cap-bg': selectedCapabilities.includes(String(cap.key))
                    ? `${cap.color}15`
                    : 'transparent',
                }"
                @click="toggleCapabilityFilter(cap.key as string)"
              >
                <component :is="cap.icon" :size="14" />
                <span>{{ cap.label }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="toolbar">
          <span class="toolbar-hint">共 {{ allVisibleModels.length }} 个模型</span>
          <var-button size="mini" type="primary" plain @click="toggleSelectAll">
            {{ isAllSelected ? "取消全选" : "全选" }}
          </var-button>
        </div>

        <div class="model-list-container">
          <div v-if="Object.keys(filteredGroups).length === 0" class="empty-state">
            <p>没有找到匹配的模型</p>
          </div>

          <div v-else class="model-groups">
            <var-collapse v-model="expandedGroups" accordion :offset-top="false" :divider="false">
              <var-collapse-item
                v-for="(groupModels, groupName) in filteredGroups"
                :key="groupName"
                :name="groupName"
                class="model-group"
              >
                <template #title>
                  <div class="group-header">
                    <span class="group-name">{{ groupName }}</span>
                    <span class="group-count">{{ groupModels.length }}</span>
                  </div>
                </template>

                <template #icon>
                  <var-button
                    size="mini"
                    type="primary"
                    text
                    @click.stop="toggleGroupSelection(groupModels)"
                  >
                    {{
                      groupModels.every((m) => isModelSelected(m) || isModelExisting(m.id))
                        ? "取消"
                        : "全选"
                    }}
                  </var-button>
                </template>

                <div class="group-content">
                  <div
                    v-for="model in groupModels"
                    :key="model.id"
                    class="model-card"
                    :class="{
                      selected: isModelSelected(model),
                      disabled: isModelExisting(model.id),
                    }"
                    v-ripple
                    @click="toggleModelSelection(model)"
                  >
                    <div class="model-card-main">
                      <DynamicIcon
                        class="model-logo"
                        :src="getModelIcon(model) || ''"
                        :alt="formatModelName(model.id)"
                      />

                      <div class="model-info">
                        <div class="model-name">
                          {{ formatModelName(model.id) }}
                        </div>
                        <div class="model-id">{{ model.id }}</div>
                      </div>

                      <div class="model-status">
                        <div v-if="isModelExisting(model.id)" class="status-tag existing">
                          已存在
                        </div>
                        <Check
                          v-else-if="isModelSelected(model)"
                          :size="20"
                          color="var(--color-primary)"
                        />
                        <Plus v-else :size="20" color="var(--color-on-surface-variant)" />
                      </div>
                    </div>

                    <div v-if="getActiveCapabilities(model).length > 0" class="model-capabilities">
                      <template
                        v-for="cap in getActiveCapabilities(model).slice(0, 4)"
                        :key="cap.key"
                      >
                        <div
                          class="capability-tag"
                          :style="{
                            '--cap-color': cap.color,
                            color: cap.color,
                          }"
                        >
                          <component :is="cap.icon" :size="12" />
                          <span class="capability-label">{{ cap.label }}</span>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
              </var-collapse-item>
            </var-collapse>
          </div>
        </div>
      </div>

      <div class="footer-bar">
        <span class="selected-count">已选择 {{ selectedModels.length }} 个模型</span>
      </div>
    </div>
  </var-popup>
</template>

<style scoped>
.fetcher-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.fetcher-content {
  flex: 1;
  overflow-y: auto;
  padding: 78px 16px 16px;
}

.search-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-surface-container);
  border-radius: 12px;
  border: 1.5px solid var(--color-outline);
}

.search-icon {
  color: var(--color-on-surface-variant);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--color-on-surface);
  outline: none;
}

.search-input::placeholder {
  color: var(--color-on-surface-variant);
  opacity: 0.5;
}

.capability-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-on-surface);
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--color-surface-container);
  border: 1px solid var(--color-outline-variant);
  font-size: 12px;
  color: var(--color-on-surface);
  cursor: pointer;
  transition: all 0.2s;
}

.filter-chip.active {
  border-color: var(--cap-color, var(--color-primary));
  background: var(--cap-bg, var(--color-primary-container));
  color: var(--cap-color, var(--color-on-primary-container));
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.model-list-container {
  flex: 1;
  min-height: 0;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 24px;
  color: var(--color-on-surface-variant);
  text-align: center;
}

.model-groups {
  display: flex;
  flex-direction: column;
}

.model-group {
  border-radius: 16px;
  overflow: hidden;
  background: var(--color-surface-container);
  margin-bottom: 12px;
}

.model-group:last-child {
  margin-bottom: 0;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.group-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-on-surface);
}

.group-count {
  font-size: 12px;
  color: var(--color-primary);
  padding: 2px 8px;
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
  border-radius: 10px;
  line-height: 1.4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
}

.group-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 4px 8px;
}

.model-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface);
  transition: all 0.2s;
  cursor: pointer;
}

.model-card.selected {
  background: var(--color-primary-container);
  border-color: var(--color-primary);
}

.model-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.model-card-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-on-surface);
  margin-bottom: 2px;
  line-height: 1.4;
}

.model-id {
  font-size: 12px;
  color: var(--color-on-surface-variant);
  font-family: monospace;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-capabilities {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border-top: 1px dashed var(--color-outline-variant);
  padding-top: 8px;
}

.capability-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--cap-color, currentColor) 12%, transparent);
  font-size: 11px;
}

.capability-label {
  font-weight: 500;
}

.model-status {
  flex-shrink: 0;
}

.status-tag {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.status-tag.existing {
  background: var(--color-surface-container);
  color: var(--color-on-surface-variant);
}

.footer-bar {
  padding: 16px 24px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-outline-variant);
  display: flex;
  justify-content: center;
  padding-bottom: calc(16px + var(--safe-area-bottom));
}

.selected-count {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-on-surface);
  padding-bottom: 16px;
}
</style>
