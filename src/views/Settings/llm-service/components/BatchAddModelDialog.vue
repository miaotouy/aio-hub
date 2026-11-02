<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { materializeModelIdentity } from "@aiohub/llm-core";
import { ArrowRight, Check } from "@element-plus/icons-vue";
import { ClipboardPaste, Eraser, Plus } from "lucide-vue-next";
import type { LlmModelInfo } from "@/types/llm-profiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { MODEL_CAPABILITIES } from "@/config/model-capabilities";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { customMessage } from "@/utils/customMessage";
import {
  compareModelGroup,
  compareModelId,
  formatModelDisplayName,
} from "@/utils/modelIdUtils";
import { parseModelIdList } from "@/utils/model-id-parser";
import { findPresetModel } from "../utils/model-preset-lookup";

const props = defineProps<{
  visible: boolean;
  existingModels: LlmModelInfo[];
  providerType?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "add-models", models: LlmModelInfo[]): void;
}>();

const { getDisplayIconPath, getIconPath, materializeModel } =
  useModelMetadata();

const textInput = ref("");
const searchQuery = ref("");
const selectedCapabilities = ref<string[]>([]);
const addStatusFilter = ref<"all" | "unadded" | "added">("all");
const selectedIds = ref<Set<string>>(new Set());
const expandedGroups = ref<Record<string, boolean>>({});

/** 将一批模型 ID 物化为带完整元数据的模型对象 */
const buildModelsFromIds = (ids: string[]): LlmModelInfo[] => {
  return ids.map((id) => {
    const preset = findPresetModel(id, props.providerType);
    const base: LlmModelInfo = preset ?? { id, name: "" };
    const materialized = materializeModel({
      ...base,
      id,
      provider: base.provider || props.providerType,
      name: base.name || formatModelDisplayName(id),
    }).model;
    return materializeModelIdentity({
      ...materialized,
      name: materialized.name || formatModelDisplayName(id),
    });
  });
};

const parsedModels = ref<LlmModelInfo[]>([]);

const isModelExisting = (modelId: string): boolean =>
  props.existingModels.some((m) => m.id === modelId);

// 文本变化时重新解析并重建预览模型；默认勾选所有尚未添加的模型
watch(
  textInput,
  (value) => {
    const ids = parseModelIdList(value);
    parsedModels.value = buildModelsFromIds(ids);
    selectedIds.value = new Set(
      parsedModels.value.filter((m) => !isModelExisting(m.id)).map((m) => m.id)
    );
  },
  { immediate: true }
);

// 渠道类型变化会影响预设匹配，需要重建
watch(
  () => props.providerType,
  () => {
    parsedModels.value = buildModelsFromIds(
      parsedModels.value.map((m) => m.id)
    );
  }
);

const parseStats = computed(() => {
  const total = parsedModels.value.length;
  const existing = parsedModels.value.filter((m) =>
    isModelExisting(m.id)
  ).length;
  return {
    total,
    existing,
    added: total - existing,
  };
});

const groupedModels = computed(() => {
  const groups: Record<string, LlmModelInfo[]> = {};
  for (const model of parsedModels.value) {
    const groupName = model.group || "未分组";
    (groups[groupName] ||= []).push(model);
  }
  for (const groupName of Object.keys(groups)) {
    if (!(groupName in expandedGroups.value)) {
      expandedGroups.value[groupName] = true;
    }
  }
  const ordered: Record<string, LlmModelInfo[]> = {};
  for (const groupName of Object.keys(groups).sort(compareModelGroup)) {
    ordered[groupName] = groups[groupName].sort((a, b) =>
      compareModelId(a.id, b.id)
    );
  }
  return ordered;
});

const filteredGroups = computed(() => {
  const query = searchQuery.value.toLowerCase();
  const caps = selectedCapabilities.value;
  const statusFilter = addStatusFilter.value;

  if (!query && caps.length === 0 && statusFilter === "all") {
    return groupedModels.value;
  }

  const result: Record<string, LlmModelInfo[]> = {};
  for (const group in groupedModels.value) {
    const filtered = groupedModels.value[group].filter((model) => {
      if (statusFilter === "added" && !isModelExisting(model.id)) return false;
      if (statusFilter === "unadded" && isModelExisting(model.id)) return false;

      const matchesQuery =
        !query ||
        model.id.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query) ||
        model.modelIdentity?.canonicalId.includes(query);
      if (!matchesQuery) return false;

      if (caps.length > 0) {
        const modelCaps = getActiveCapabilities(model).map(
          (c) => c.key
        ) as string[];
        if (!caps.every((cap) => modelCaps.includes(cap))) return false;
      }

      return true;
    });
    if (filtered.length > 0) result[group] = filtered;
  }
  return result;
});

const getActiveCapabilities = (model: LlmModelInfo) =>
  MODEL_CAPABILITIES.filter((cap) => model.capabilities?.[cap.key]);

const getModelIcon = (model: LlmModelInfo) => {
  if (model.icon) return getDisplayIconPath(model.icon);
  const iconPath = getIconPath(model.id, model.provider || props.providerType);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};

const isSelected = (modelId: string) => selectedIds.value.has(modelId);

const toggleModelSelection = (model: LlmModelInfo) => {
  if (isModelExisting(model.id)) return;
  const next = new Set(selectedIds.value);
  if (next.has(model.id)) next.delete(model.id);
  else next.add(model.id);
  selectedIds.value = next;
};

const isGroupAllSelected = (groupModels: LlmModelInfo[]) => {
  const selectable = groupModels.filter((m) => !isModelExisting(m.id));
  return (
    selectable.length > 0 &&
    selectable.every((m) => selectedIds.value.has(m.id))
  );
};

const toggleGroupSelection = (groupModels: LlmModelInfo[]) => {
  const selectable = groupModels.filter((m) => !isModelExisting(m.id));
  const next = new Set(selectedIds.value);
  if (isGroupAllSelected(groupModels)) {
    selectable.forEach((m) => next.delete(m.id));
  } else {
    selectable.forEach((m) => next.add(m.id));
  }
  selectedIds.value = next;
};

const allVisibleModels = computed(() =>
  Object.values(filteredGroups.value).flat()
);

const isAllSelected = computed(() => {
  const selectable = allVisibleModels.value.filter(
    (m) => !isModelExisting(m.id)
  );
  return (
    selectable.length > 0 &&
    selectable.every((m) => selectedIds.value.has(m.id))
  );
});

const toggleSelectAll = () => {
  const selectable = allVisibleModels.value.filter(
    (m) => !isModelExisting(m.id)
  );
  const next = new Set(selectedIds.value);
  if (isAllSelected.value) {
    selectable.forEach((m) => next.delete(m.id));
  } else {
    selectable.forEach((m) => next.add(m.id));
  }
  selectedIds.value = next;
};

const toggleGroupExpand = (groupName: string) => {
  expandedGroups.value[groupName] = !expandedGroups.value[groupName];
};

const isGroupExpanded = (groupName: string): boolean =>
  expandedGroups.value[groupName] !== false;

const pasteFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) textInput.value = text;
  } catch {
    customMessage.warning("无法读取剪贴板，请手动粘贴");
  }
};

const clearAll = () => {
  textInput.value = "";
};

const selectedModels = computed(() =>
  parsedModels.value.filter(
    (m) => selectedIds.value.has(m.id) && !isModelExisting(m.id)
  )
);

const handleConfirm = () => {
  const modelsToAdd = selectedModels.value.map((model) => {
    const { modelIdentitySuggestion: _suggestion, ...persisted } = model;
    return materializeModel({
      ...persisted,
      provider: model.provider || props.providerType,
      name: model.name || formatModelDisplayName(model.id),
    }).model;
  });
  if (modelsToAdd.length > 0) {
    emit("add-models", modelsToAdd);
  }
  closeDialog();
};

const closeDialog = () => {
  emit("update:visible", false);
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="closeDialog"
    title="批量添加模型"
    width="820px"
    height="82vh"
  >
    <template #content>
      <div class="batch-add-dialog">
        <!-- 输入区 -->
        <section class="input-section">
          <div class="section-toolbar">
            <span class="section-title">模型列表</span>
            <div class="toolbar-actions">
              <el-tooltip content="从剪贴板粘贴" placement="top">
                <el-button
                  text
                  circle
                  aria-label="从剪贴板粘贴"
                  @click="pasteFromClipboard"
                >
                  <ClipboardPaste :size="16" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="清空" placement="top">
                <el-button
                  text
                  circle
                  aria-label="清空输入"
                  :disabled="!textInput"
                  @click="clearAll"
                >
                  <Eraser :size="16" />
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <el-input
            v-model="textInput"
            type="textarea"
            :rows="4"
            resize="none"
            class="model-textarea"
            placeholder="每行一个模型 ID，或用逗号分隔；也支持粘贴 JSON 数组、OpenAI /v1/models 响应或配置字典"
            aria-label="模型列表输入"
          />

          <div v-if="parseStats.total > 0" class="parse-summary">
            <span>识别到 {{ parseStats.total }} 个模型</span>
            <span class="summary-added">新增 {{ parseStats.added }} 个</span>
            <span v-if="parseStats.existing > 0" class="summary-existing"
              >已存在 {{ parseStats.existing }} 个</span
            >
          </div>
        </section>

        <!-- 列表区 -->
        <section class="list-section">
          <div v-if="parsedModels.length === 0" class="empty-state">
            <p>在上方粘贴或输入模型 ID，即可自动匹配元数据并预览</p>
          </div>

          <template v-else>
            <div class="filter-bar">
              <el-input
                v-model="searchQuery"
                placeholder="搜索模型 ID 或名称"
                clearable
                class="search-input"
              />
              <el-select
                v-model="selectedCapabilities"
                multiple
                collapse-tags
                collapse-tags-tooltip
                placeholder="能力筛选"
                class="capability-filter"
                clearable
              >
                <el-option
                  v-for="cap in MODEL_CAPABILITIES"
                  :key="cap.key"
                  :label="cap.label"
                  :value="cap.key"
                >
                  <div class="capability-option">
                    <el-icon :style="{ color: cap.color }">
                      <component :is="cap.icon" />
                    </el-icon>
                    <span>{{ cap.label }}</span>
                  </div>
                </el-option>
              </el-select>
              <el-select
                v-model="addStatusFilter"
                placeholder="添加状态"
                class="status-filter"
              >
                <el-option label="全部" value="all" />
                <el-option label="未添加" value="unadded" />
                <el-option label="已添加" value="added" />
              </el-select>
              <el-button @click="toggleSelectAll">
                {{ isAllSelected ? "全部取消" : "全选" }}
              </el-button>
            </div>

            <div class="model-list-container">
              <div
                v-if="Object.keys(filteredGroups).length === 0"
                class="empty-state"
              >
                <p>没有找到匹配的模型</p>
              </div>
              <div
                v-else
                v-for="(groupModels, groupName) in filteredGroups"
                :key="groupName"
                class="model-group"
              >
                <div class="group-header">
                  <div
                    class="group-title"
                    @click="toggleGroupExpand(groupName)"
                  >
                    <el-icon
                      class="expand-icon"
                      :class="{ expanded: isGroupExpanded(groupName) }"
                    >
                      <ArrowRight />
                    </el-icon>
                    <span class="group-name">{{ groupName }}</span>
                    <span class="group-count">{{ groupModels.length }}</span>
                  </div>
                  <el-button
                    link
                    size="small"
                    @click.stop="toggleGroupSelection(groupModels)"
                  >
                    {{ isGroupAllSelected(groupModels) ? "全部取消" : "全选" }}
                  </el-button>
                </div>
                <transition name="group-collapse">
                  <div
                    v-show="isGroupExpanded(groupName)"
                    class="group-content"
                  >
                    <div
                      v-for="model in groupModels"
                      :key="model.id"
                      class="model-item"
                      :class="{
                        selected: isSelected(model.id),
                        disabled: isModelExisting(model.id),
                      }"
                      @click="toggleModelSelection(model)"
                    >
                      <DynamicIcon
                        :src="getModelIcon(model) || ''"
                        :alt="model.name || model.id"
                        class="model-icon"
                      />
                      <div class="model-info">
                        <div class="model-name-row">
                          <span class="model-name">{{
                            model.name || model.id
                          }}</span>
                          <div
                            v-if="getActiveCapabilities(model).length > 0"
                            class="model-capabilities"
                          >
                            <el-tooltip
                              v-for="cap in getActiveCapabilities(model)"
                              :key="cap.key"
                              :content="cap.description"
                              placement="top"
                              effect="dark"
                            >
                              <el-icon
                                :style="{ color: cap.color }"
                                class="capability-icon"
                              >
                                <component :is="cap.icon" />
                              </el-icon>
                            </el-tooltip>
                          </div>
                        </div>
                        <div class="model-id">{{ model.id }}</div>
                        <div
                          v-if="model.modelIdentity"
                          class="model-identity"
                          :title="model.modelIdentity.canonicalId"
                        >
                          {{ model.modelIdentity.canonicalId }}
                        </div>
                      </div>
                      <div class="model-status">
                        <el-tag
                          v-if="isModelExisting(model.id)"
                          type="info"
                          size="small"
                          >已添加</el-tag
                        >
                        <el-icon v-else-if="isSelected(model.id)">
                          <Check />
                        </el-icon>
                        <el-icon v-else><Plus /></el-icon>
                      </div>
                    </div>
                  </div>
                </transition>
              </div>
            </div>
          </template>
        </section>
      </div>
    </template>

    <template #footer>
      <span class="footer-summary">
        已选 {{ selectedModels.length }} 个待添加模型
      </span>
      <el-button @click="closeDialog">取消</el-button>
      <el-button
        type="primary"
        :disabled="selectedModels.length === 0"
        @click="handleConfirm"
      >
        添加 {{ selectedModels.length }} 个模型
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.batch-add-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.model-textarea :deep(.el-textarea__inner) {
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 12px;
  line-height: 1.55;
  background: var(--input-bg);
}

.parse-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.summary-added {
  color: var(--el-color-success);
}

.summary-existing {
  color: var(--text-color-light);
}

.list-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.filter-bar {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
}

.capability-filter {
  width: 160px;
  flex-shrink: 0;
}

.status-filter {
  width: 110px;
  flex-shrink: 0;
}

.capability-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-list-container {
  flex: 1;
  overflow-y: auto;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  padding: 8px;
  min-height: 0;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.model-group {
  margin-bottom: 12px;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--container-bg);
  user-select: none;
  transition: background 0.2s;
}

.group-header:hover {
  background: var(--card-bg);
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.expand-icon {
  transition: transform 0.3s ease;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.group-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

.group-count {
  font-size: 12px;
  color: var(--text-color-light);
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.3);
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
  padding: 12px;
  background: transparent;
}

.group-collapse-enter-active,
.group-collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.group-collapse-enter-from,
.group-collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.group-collapse-enter-to,
.group-collapse-leave-from {
  opacity: 1;
  max-height: 2000px;
}

.model-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border-color-light);
  background: var(--card-bg);
}

.model-item:hover {
  border-color: var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.model-item.selected {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-color: var(--el-color-primary);
}

.model-item.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.model-icon {
  width: 32px;
  height: 32px;
  margin-right: 12px;
  flex-shrink: 0;
  border-radius: 4px;
}

.model-info {
  flex-grow: 1;
  min-width: 0;
}

.model-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.model-name {
  font-size: 14px;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-capabilities {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.capability-icon {
  font-size: 16px;
  opacity: 0.85;
  transition: opacity 0.2s;
}

.capability-icon:hover {
  opacity: 1;
}

.model-id {
  font-size: 12px;
  color: var(--text-color-secondary);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-identity {
  margin-top: 2px;
  color: var(--el-color-success);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-status {
  margin-left: 16px;
  flex-shrink: 0;
  color: var(--text-color-secondary);
}

.footer-summary {
  padding-right: 24px;
  font-size: 12px;
  color: var(--text-color-secondary);
}
</style>
