<script setup lang="ts">
import { ref, computed } from 'vue';
import type { LlmModelInfo } from '../../types/llm-profiles';
import { groupBy } from 'lodash-es';
import { useModelIcons } from '../../composables/useModelIcons';

const props = defineProps<{
  models: LlmModelInfo[];
  existingModels: LlmModelInfo[];
  visible: boolean;
}>();

const emit = defineEmits(['update:visible', 'add-models']);

const { getDisplayIconPath, getIconPath } = useModelIcons();

const searchQuery = ref('');
const selectedModels = ref<LlmModelInfo[]>([]);

// 根据分组聚合模型
const groupedModels = computed(() => {
  return groupBy(props.models, 'group');
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
      (model) =>
        model.id.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query)
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
  return selectedModels.value.some((m) => m.id === model.id);
};

// 切换单个模型的选择状态
const toggleModelSelection = (model: LlmModelInfo) => {
  if (isModelExisting(model.id)) return;
  const index = selectedModels.value.findIndex((m) => m.id === model.id);
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
      (sm) => !groupModels.some((gm) => gm.id === sm.id)
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

const handleConfirm = () => {
  emit('add-models', selectedModels.value);
  closeDialog();
};

const closeDialog = () => {
  emit('update:visible', false);
};

// 获取模型图标
const getModelIcon = (model: LlmModelInfo) => {
  if (model.icon) {
    return getDisplayIconPath(model.icon);
  }
  const iconPath = getIconPath(model.id, model.provider);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="从 API 添加模型"
    width="800px"
    top="5vh"
    @update:model-value="closeDialog"
  >
    <div class="model-fetcher-dialog">
      <el-input
        v-model="searchQuery"
        placeholder="搜索模型 ID 或名称"
        clearable
        class="search-input"
      />

      <div class="model-list-container">
        <div v-for="(groupModels, groupName) in filteredGroups" :key="groupName" class="model-group">
          <div class="group-header" @click="toggleGroupSelection(groupModels)">
            <span>{{ groupName }} ({{ groupModels.length }})</span>
            <el-button type="text">
              {{ groupModels.every(m => isModelSelected(m) || isModelExisting(m.id)) ? '取消全选' : '全选' }}
            </el-button>
          </div>
          <div
            v-for="model in groupModels"
            :key="model.id"
            class="model-item"
            :class="{ selected: isModelSelected(model), disabled: isModelExisting(model.id) }"
            @click="toggleModelSelection(model)"
          >
            <img v-if="getModelIcon(model)" :src="getModelIcon(model)!" class="model-icon" alt="" />
            <div v-else class="model-icon-placeholder" />
            <div class="model-info">
              <div class="model-name">{{ model.name }}</div>
              <div class="model-id">{{ model.id }}</div>
            </div>
            <div class="model-status">
              <el-tag v-if="isModelExisting(model.id)" type="info" size="small">已存在</el-tag>
              <el-icon v-else-if="isModelSelected(model)"><i-ep-check /></el-icon>
              <el-icon v-else><i-ep-plus /></el-icon>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <span style="padding-right: 24px;">已选择 {{ selectedModels.length }} 个模型</span>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" @click="handleConfirm" :disabled="selectedModels.length === 0">
        添加
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.model-fetcher-dialog {
  display: flex;
  flex-direction: column;
  height: 60vh;
}
.search-input {
  margin-bottom: 16px;
}
.model-list-container {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px;
}
.model-group {
  margin-bottom: 16px;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  font-weight: bold;
  cursor: pointer;
}
.model-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}
.model-item:hover {
  background-color: var(--card-bg-hover);
}
.model-item.selected {
  background-color: color-mix(in srgb, var(--el-color-primary) 6%, transparent);
  border-color: var(--el-color-primary);
}
.model-item.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.model-icon,
.model-icon-placeholder {
  width: 24px;
  height: 24px;
  margin-right: 12px;
  flex-shrink: 0;
}
.model-info {
  flex-grow: 1;
}
.model-name {
  font-size: 14px;
}
.model-id {
  font-size: 12px;
  color: var(--text-color-secondary);
}
.model-status {
  margin-left: 16px;
}
</style>