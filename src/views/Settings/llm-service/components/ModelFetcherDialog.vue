<script setup lang="ts">
import { ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import type { LlmModelInfo } from "@/types/llm-profiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { MODEL_CAPABILITIES } from "@/config/model-capabilities";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

const props = defineProps<{
  models: LlmModelInfo[];
  existingModels: LlmModelInfo[];
  visible: boolean;
}>();

const emit = defineEmits(["update:visible", "add-models"]);

const { getDisplayIconPath, getIconPath, getModelGroup, getMatchedProperties } = useModelMetadata();

const searchQuery = ref("");
const selectedModels = ref<LlmModelInfo[]>([]);
const expandedGroups = ref<Record<string, boolean>>({});

// 根据分组聚合模型（使用 getModelGroup 获取正确的分组）
const groupedModels = computed(() => {
  const groups: Record<string, LlmModelInfo[]> = {};

  for (const model of props.models) {
    const groupName = getModelGroup(model);
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(model);
  }

  // 初始化展开状态（默认全部展开）
  for (const groupName of Object.keys(groups)) {
    if (!(groupName in expandedGroups.value)) {
      expandedGroups.value[groupName] = true;
    }
  }

  return groups;
});

// 过滤后的模型
const filteredGroups = computed(() => {
  if (!searchQuery.value) {
    return groupedModels.value;
  }
  const query = searchQuery.value.toLowerCase();
  const result: Record<string, LlmModelInfo[]> = {};
  for (const group in groupedModels.value) {
    const filtered = groupedModels.value[group].filter(
      (model) => model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query)
    );
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

// 检查模型是否已选择
const isModelSelected = (model: LlmModelInfo) => {
  return selectedModels.value.some((m: LlmModelInfo) => m.id === model.id);
};

// 切换单个模型的选择状态
const toggleModelSelection = (model: LlmModelInfo) => {
  if (isModelExisting(model.id)) return;
  const index = selectedModels.value.findIndex((m: LlmModelInfo) => m.id === model.id);
  if (index > -1) {
    selectedModels.value.splice(index, 1);
  } else {
    selectedModels.value.push(model);
  }
};

// 切换整个分组的选择状态
const toggleGroupSelection = (groupModels: LlmModelInfo[]) => {
  const allSelected = groupModels.every((m) => isModelSelected(m) || isModelExisting(m.id));
  if (allSelected) {
    // 全部取消选择
    selectedModels.value = selectedModels.value.filter(
      (sm: LlmModelInfo) => !groupModels.some((gm) => gm.id === sm.id)
    );
  } else {
    // 全部添加
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

// 判断当前可见模型是否已全部选择
const isAllSelected = computed(() => {
  if (allVisibleModels.value.length === 0) return false;
  return allVisibleModels.value.every((m) => isModelSelected(m) || isModelExisting(m.id));
});

// 切换全部模型的选择状态
const toggleSelectAll = () => {
  if (isAllSelected.value) {
    // 全部取消选择
    const visibleIds = new Set(allVisibleModels.value.map((m) => m.id));
    selectedModels.value = selectedModels.value.filter((m) => !visibleIds.has(m.id));
  } else {
    // 全部添加
    for (const model of allVisibleModels.value) {
      if (!isModelSelected(model) && !isModelExisting(model.id)) {
        selectedModels.value.push(model);
      }
    }
  }
};

// 复制原始模型数据为 JSON
const copyModelsJson = async () => {
  try {
    const jsonString = JSON.stringify(props.models, null, 2);
    await navigator.clipboard.writeText(jsonString);
    customMessage.success("模型 JSON 已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
    console.error("Failed to copy models JSON:", error);
  }
};

const handleConfirm = () => {
  // 对选中的模型进行处理，使用格式化后的名称
  const modelsToAdd = selectedModels.value.map((model: LlmModelInfo) => ({
    ...model,
    name: formatModelName(model.id),
  }));
  emit("add-models", modelsToAdd);
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
  const iconPath = getIconPath(model.id, model.provider);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};

// 格式化模型名称
const formatModelName = (modelId: string): string => {
  // 找到最后一个 / 的位置
  const lastSlashIndex = modelId.lastIndexOf("/");

  // 如果找到 /，取后面的部分，否则使用整个 ID
  let name = lastSlashIndex !== -1 ? modelId.substring(lastSlashIndex + 1) : modelId;

  // 将 - 替换为空格
  name = name.replace(/-/g, " ");

  // 首字母大写
  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  return name;
};

// 获取模型能力
const getModelCapabilities = (model: LlmModelInfo) => {
  // 优先使用模型自身的能力配置
  if (model.capabilities) {
    return model.capabilities;
  }

  // 否则使用元数据规则匹配的能力
  const matchedProps = getMatchedProperties(model.id, model.provider);
  return matchedProps?.capabilities || {};
};

// 获取激活的能力列表
const getActiveCapabilities = (model: LlmModelInfo) => {
  const capabilities = getModelCapabilities(model);
  return MODEL_CAPABILITIES.filter((cap) => capabilities[cap.key as keyof typeof capabilities]);
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
          <el-button @click="toggleSelectAll">{{ isAllSelected ? "取消全选" : "全选" }}</el-button>
          <el-button @click="copyModelsJson">
            <el-icon class="el-icon--left"><i-ep-copy-document /></el-icon>
            复制 JSON
          </el-button>
        </div>

        <div class="model-list-container">
          <div v-if="Object.keys(filteredGroups).length === 0" class="empty-state">
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
                <el-icon class="expand-icon" :class="{ expanded: isGroupExpanded(groupName) }">
                  <i-ep-arrow-right />
                </el-icon>
                <span class="group-name">{{ groupName }}</span>
                <span class="group-count">{{ groupModels.length }}</span>
              </div>
              <el-button link size="small" @click.stop="toggleGroupSelection(groupModels)">
                {{
                  groupModels.every((m) => isModelSelected(m) || isModelExisting(m.id))
                    ? "取消全选"
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
                  :class="{ selected: isModelSelected(model), disabled: isModelExisting(model.id) }"
                  @click="toggleModelSelection(model)"
                >
                  <DynamicIcon
                    :src="getModelIcon(model) || ''"
                    :alt="formatModelName(model.id)"
                    class="model-icon"
                  />
                  <div class="model-info">
                    <div class="model-name-row">
                      <span class="model-name">{{ formatModelName(model.id) }}</span>
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
                          <el-icon :style="{ color: cap.color }" class="capability-icon">
                            <component :is="cap.icon" />
                          </el-icon>
                        </el-tooltip>
                      </div>
                    </div>
                    <div class="model-id">{{ model.id }}</div>
                  </div>
                  <div class="model-status">
                    <el-tag v-if="isModelExisting(model.id)" type="info" size="small"
                      >已存在</el-tag
                    >
                    <el-icon v-else-if="isModelSelected(model)"><i-ep-check /></el-icon>
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
      <span style="padding-right: 24px">已选择 {{ selectedModels.length }} 个模型</span>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" @click="handleConfirm" :disabled="selectedModels.length === 0">
        添加
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
  border: 1px solid var(--border-color);
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
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, var(--card-bg));
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
.model-status {
  margin-left: 16px;
}

.el-button {
  margin-left: 0px;
}
</style>
