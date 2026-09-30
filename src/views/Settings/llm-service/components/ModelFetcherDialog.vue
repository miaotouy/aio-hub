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
import { ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import type { LlmModelInfo } from "@/types/llm-profiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { MODEL_CAPABILITIES } from "@/config/model-capabilities";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { compareModelGroup, compareModelId } from "@/utils/modelIdUtils";

const props = defineProps<{
  models: LlmModelInfo[];
  rawResponse?: any;
  existingModels: LlmModelInfo[];
  visible: boolean;
  providerType?: string;
}>();

const emit = defineEmits(["update:visible", "add-models", "remove-models"]);

const { getDisplayIconPath, getIconPath, materializeModel } =
  useModelMetadata();

const searchQuery = ref("");
const selectedCapabilities = ref<string[]>([]);
const selectedModels = ref<LlmModelInfo[]>([]);
// 在本窗口内标记为「移除」的已添加模型 ID；确认时统一通知父组件移除
const removeModelIds = ref<Set<string>>(new Set());
const expandedGroups = ref<Record<string, boolean>>({});
// 添加状态筛选：全部 / 未添加 / 已添加
const addStatusFilter = ref<"all" | "unadded" | "added">("all");

// 根据分组聚合模型（使用 getModelGroup 获取正确的分组）
const groupedModels = computed(() => {
  const groups: Record<string, LlmModelInfo[]> = {};
  for (const model of props.models) {
    const materialized = materializeModel({
      ...model,
      provider: model.provider || props.providerType,
    }).model;
    const groupName = materialized.group || "未分组";
    (groups[groupName] ||= []).push(materialized);
  }
  for (const groupName of Object.keys(groups)) {
    if (!(groupName in expandedGroups.value))
      expandedGroups.value[groupName] = true;
  }
  const orderedGroups: Record<string, LlmModelInfo[]> = {};
  for (const groupName of Object.keys(groups).sort(compareModelGroup)) {
    orderedGroups[groupName] = groups[groupName].sort((a, b) =>
      compareModelId(a.id, b.id)
    );
  }
  return orderedGroups;
});
// 过滤后的模型
const filteredGroups = computed(() => {
  const query = searchQuery.value ? searchQuery.value.toLowerCase() : "";
  const caps = selectedCapabilities.value;
  const statusFilter = addStatusFilter.value;

  if (!query && caps.length === 0 && statusFilter === "all") {
    return groupedModels.value;
  }

  const result: Record<string, LlmModelInfo[]> = {};
  for (const group in groupedModels.value) {
    const filtered = groupedModels.value[group].filter((model) => {
      // 0. 添加状态筛选
      if (statusFilter === "added" && !isModelExisting(model.id)) return false;
      if (statusFilter === "unadded" && isModelExisting(model.id)) return false;

      // 1. 搜索词匹配
      const matchesQuery =
        !query ||
        model.id.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query) ||
        model.modelIdentity?.canonicalId.includes(query);
      if (!matchesQuery) return false;

      // 2. 能力匹配 (AND 逻辑：必须包含所有选中的能力)
      if (caps.length > 0) {
        const modelCaps = getActiveCapabilities(model).map(
          (c) => c.key
        ) as string[];
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

// 检查模型是否已存在
const isModelExisting = (modelId: string) => {
  return props.existingModels.some((m) => m.id === modelId);
};

// 检查已添加模型是否被标记为「待移除」
const isModelMarkedRemoved = (modelId: string) => {
  return removeModelIds.value.has(modelId);
};

// 检查模型是否已选择
const isModelSelected = (model: LlmModelInfo) => {
  return selectedModels.value.some((m: LlmModelInfo) => m.id === model.id);
};

// 切换单个模型的状态：未添加 → 选中待添加；已添加 → 标记待移除
const toggleModelSelection = (model: LlmModelInfo) => {
  if (isModelExisting(model.id)) {
    const next = new Set(removeModelIds.value);
    if (next.has(model.id)) {
      next.delete(model.id);
    } else {
      next.add(model.id);
    }
    removeModelIds.value = next;
    return;
  }
  const index = selectedModels.value.findIndex(
    (m: LlmModelInfo) => m.id === model.id
  );
  if (index > -1) {
    selectedModels.value.splice(index, 1);
  } else {
    selectedModels.value.push(model);
  }
};

// 切换整个分组的选择状态
const toggleGroupSelection = (groupModels: LlmModelInfo[]) => {
  const allChecked = groupModels.every((m) => {
    if (isModelExisting(m.id)) {
      return !isModelMarkedRemoved(m.id);
    }
    return isModelSelected(m);
  });
  if (allChecked) {
    // 全部取消：清空待添加选中，并把已添加模型标记为移除
    selectedModels.value = selectedModels.value.filter(
      (sm: LlmModelInfo) => !groupModels.some((gm) => gm.id === sm.id)
    );
    const next = new Set(removeModelIds.value);
    for (const model of groupModels) {
      if (isModelExisting(model.id)) {
        next.add(model.id);
      }
    }
    removeModelIds.value = next;
  } else {
    // 全部添加：清空移除标记，并把未添加模型加入选中
    const next = new Set(removeModelIds.value);
    for (const model of groupModels) {
      if (isModelExisting(model.id)) {
        next.delete(model.id);
      }
    }
    removeModelIds.value = next;
    for (const model of groupModels) {
      if (!isModelSelected(model) && !isModelExisting(model.id)) {
        selectedModels.value.push(model);
      }
    }
  }
};

// 切换分组展开状态
const toggleGroupExpand = (groupName: string) => {
  expandedGroups.value[groupName] = !expandedGroups.value[groupName];
};

// 判断分组是否展开
const isGroupExpanded = (groupName: string): boolean => {
  return expandedGroups.value[groupName] !== false;
};

// --- 全选/复制功能 ---

// 拍平的、当前可见的模型列表
const allVisibleModels = computed(() => {
  return Object.values(filteredGroups.value).flat();
});

// 判断当前可见模型是否已全部勾选（未添加的已选中，已添加的未标记移除）
const isAllSelected = computed(() => {
  if (allVisibleModels.value.length === 0) return false;
  return allVisibleModels.value.every((m) =>
    isModelExisting(m.id)
      ? !isModelMarkedRemoved(m.id)
      : isModelSelected(m)
  );
});

// 切换全部模型的勾选状态（含已添加模型的移除标记）
const toggleSelectAll = () => {
  const visibleExisting = allVisibleModels.value.filter((m) =>
    isModelExisting(m.id)
  );
  if (isAllSelected.value) {
    // 全部取消：清空待添加选中，并把已添加模型标记为移除
    const visibleIds = new Set(allVisibleModels.value.map((m) => m.id));
    selectedModels.value = selectedModels.value.filter(
      (m) => !visibleIds.has(m.id)
    );
    const next = new Set(removeModelIds.value);
    for (const model of visibleExisting) {
      next.add(model.id);
    }
    removeModelIds.value = next;
  } else {
    // 全部勾选：清空移除标记，并把未添加模型加入选中
    const next = new Set(removeModelIds.value);
    for (const model of visibleExisting) {
      next.delete(model.id);
    }
    removeModelIds.value = next;
    for (const model of allVisibleModels.value) {
      if (!isModelSelected(model) && !isModelExisting(model.id)) {
        selectedModels.value.push(model);
      }
    }
  }
};
// 复制适配后的模型数据为 JSON
const copyModelsJson = async () => {
  try {
    const jsonString = JSON.stringify(props.models, null, 2);
    await navigator.clipboard.writeText(jsonString);
    customMessage.success("适配后的模型 JSON 已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
    console.error("Failed to copy models JSON:", error);
  }
};

// 复制 API 原始返回体
const copyRawResponse = async () => {
  if (!props.rawResponse) {
    customMessage.warning("暂无原始响应数据");
    return;
  }
  try {
    const jsonString = JSON.stringify(props.rawResponse, null, 2);
    await navigator.clipboard.writeText(jsonString);
    customMessage.success("原始响应 JSON 已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
    console.error("Failed to copy raw response:", error);
  }
};

const handleConfirm = () => {
  const modelsToAdd = selectedModels.value.map((model) => {
    const { modelIdentitySuggestion: _suggestion, ...persistedModel } = model;
    return materializeModel({
      ...persistedModel,
      provider: model.provider || props.providerType,
      name: formatModelName(model.id),
      capabilities: getModelCapabilities(model),
    }).model;
  });
  if (modelsToAdd.length > 0) {
    emit("add-models", modelsToAdd);
  }
  if (removeModelIds.value.size > 0) {
    emit("remove-models", [...removeModelIds.value]);
  }
  closeDialog();
};
const closeDialog = () => {
  emit("update:visible", false);
};

// 获取模型图标
const getModelIcon = (model: LlmModelInfo) => {
  if (model.icon) {
    return getDisplayIconPath(model.icon);
  }
  const iconPath = getIconPath(model.id, model.provider || props.providerType);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};

// 格式化模型名称
const formatModelName = (modelId: string): string => {
  // 找到最后一个 / 的位置
  const lastSlashIndex = modelId.lastIndexOf("/");

  // 如果找到 /，取后面的部分，否则使用整个 ID
  let name =
    lastSlashIndex !== -1 ? modelId.substring(lastSlashIndex + 1) : modelId;

  // 将 - 替换为空格
  name = name.replace(/-/g, " ");

  // 将 gpt 替换为 GPT
  name = name.replace(/\bgpt\b/gi, "GPT");

  // 首字母大写
  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  return name;
};

// 获取模型能力
const getModelCapabilities = (model: LlmModelInfo) => model.capabilities || {};
// 获取激活的能力列表
const getActiveCapabilities = (model: LlmModelInfo) => {
  const capabilities = getModelCapabilities(model);
  return MODEL_CAPABILITIES.filter(
    (cap) => capabilities[cap.key as keyof typeof capabilities]
  );
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="closeDialog"
    title="从 API 添加模型"
    width="800px"
    height="80vh"
  >
    <template #content>
      <div class="model-fetcher-dialog">
        <div class="search-bar-container">
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
            style="width: 160px"
            clearable
          >
            <el-option
              v-for="cap in MODEL_CAPABILITIES"
              :key="cap.key"
              :label="cap.label"
              :value="cap.key"
            >
              <div style="display: flex; align-items: center">
                <el-icon
                  style="margin-right: 8px"
                  :style="{ color: cap.color }"
                >
                  <component :is="cap.icon" />
                </el-icon>
                <span>{{ cap.label }}</span>
              </div>
            </el-option>
          </el-select>
          <el-select
            v-model="addStatusFilter"
            placeholder="添加状态"
            style="width: 120px"
          >
            <el-option label="全部" value="all" />
            <el-option label="未添加" value="unadded" />
            <el-option label="已添加" value="added" />
          </el-select>
          <el-button @click="toggleSelectAll">{{
            isAllSelected ? "全部取消" : "全选"
          }}</el-button>
          <el-dropdown trigger="click">
            <el-button>
              <el-icon class="el-icon--left"><i-ep-copy-document /></el-icon>
              复制数据
              <el-icon class="el-icon--right"><i-ep-arrow-down /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="copyModelsJson"
                  >复制适配后 JSON</el-dropdown-item
                >
                <el-dropdown-item @click="copyRawResponse"
                  >复制原始响应</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
              <div class="group-title" @click="toggleGroupExpand(groupName)">
                <el-icon
                  class="expand-icon"
                  :class="{ expanded: isGroupExpanded(groupName) }"
                >
                  <i-ep-arrow-right />
                </el-icon>
                <span class="group-name">{{ groupName }}</span>
                <span class="group-count">{{ groupModels.length }}</span>
              </div>
              <el-button
                link
                size="small"
                @click.stop="toggleGroupSelection(groupModels)"
              >
                {{
                  groupModels.every((m) =>
                    isModelExisting(m.id)
                      ? !isModelMarkedRemoved(m.id)
                      : isModelSelected(m)
                  )
                    ? "全部取消"
                    : "全选"
                }}
              </el-button>
            </div>
            <transition name="group-collapse">
              <div v-show="isGroupExpanded(groupName)" class="group-content">
                <div
                  v-for="model in groupModels"
                  :key="model.id"
                  class="model-item"
                  :class="{
                    selected: isModelSelected(model),
                    markedRemove: isModelExisting(model.id) && isModelMarkedRemoved(model.id),
                    disabled: isModelExisting(model.id) && !isModelMarkedRemoved(model.id),
                  }"
                  @click="toggleModelSelection(model)"
                >
                  <DynamicIcon
                    :src="getModelIcon(model) || ''"
                    :alt="formatModelName(model.id)"
                    class="model-icon"
                  />
                  <div class="model-info">
                    <div class="model-name-row">
                      <span class="model-name">{{
                        formatModelName(model.id)
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
                      {{ model.modelIdentity.canonicalId }} · 内置精确识别
                    </div>
                    <div
                      v-else-if="
                        model.capabilities?.embedding &&
                        model.modelIdentitySuggestion
                      "
                      class="model-identity is-suggestion"
                      :title="model.modelIdentitySuggestion.evidence"
                    >
                      建议：{{
                        model.modelIdentitySuggestion.identity.canonicalId
                      }}
                      · 待确认
                    </div>
                  </div>
                  <div class="model-status">
                    <template v-if="isModelExisting(model.id)">
                      <el-tag
                        v-if="isModelMarkedRemoved(model.id)"
                        type="danger"
                        size="small"
                        >待移除</el-tag
                      >
                      <el-tag v-else type="info" size="small">已添加</el-tag>
                    </template>
                    <el-icon v-else-if="isModelSelected(model)"
                      ><i-ep-check
                    /></el-icon>
                    <el-icon v-else><i-ep-plus /></el-icon>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <span style="padding-right: 24px">
        添加 {{ selectedModels.length }} 个<template
          v-if="removeModelIds.size > 0"
        >
          ，移除 {{ removeModelIds.size }} 个</template
        >
      </span>
      <el-button @click="closeDialog">取消</el-button>
      <el-button
        type="primary"
        @click="handleConfirm"
        :disabled="selectedModels.length === 0 && removeModelIds.size === 0"
      >
        确定
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.model-fetcher-dialog {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.search-bar-container {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.search-input {
  flex: 1;
}
.model-list-container {
  flex: 1;
  overflow-y: auto;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 8px;
}
.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--text-color-secondary);
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
  background: var(--card-bg-hover);
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
/* 折叠动画 */
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
  padding: 12px;
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
  background-color: color-mix(
    in srgb,
    var(--el-color-primary) 10%,
    var(--card-bg)
  );
  border-color: var(--el-color-primary);
}
.model-item.markedRemove {
  background-color: color-mix(
    in srgb,
    var(--el-color-danger) 10%,
    var(--card-bg)
  );
  border-color: var(--el-color-danger);
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
.model-identity.is-suggestion {
  color: var(--el-color-warning);
}
.model-status {
  margin-left: 16px;
}

.el-button {
  margin-left: 0px;
}
</style>
