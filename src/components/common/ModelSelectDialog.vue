<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { ElInput, ElEmpty } from 'element-plus';
import { useModelSelectDialog } from '@/composables/useModelSelectDialog';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useModelMetadata } from '@/composables/useModelMetadata';
import type { LlmProfile, LlmModelInfo } from '@/types/llm-profiles';
import BaseDialog from '@/components/common/BaseDialog.vue';
import DynamicIcon from '@/components/common/DynamicIcon.vue';
import { MODEL_CAPABILITIES } from '@/config/model-capabilities';

const { isDialogVisible, currentSelection, select, cancel } = useModelSelectDialog();
const { enabledProfiles } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();

const searchQuery = ref('');
const modelListWrapperRef = ref<HTMLDivElement>();

// 组合并筛选所有可用模型
const allModels = computed(() => {
  const models: Array<{
    profile: LlmProfile;
    model: LlmModelInfo;
  }> = [];

  enabledProfiles.value.forEach((profile) => {
    profile.models.forEach((model) => {
      models.push({ profile, model });
    });
  });

  if (!searchQuery.value) {
    return models;
  }

  const lowerCaseQuery = searchQuery.value.toLowerCase();
  return models.filter(
    ({ model, profile }) =>
      model.name.toLowerCase().includes(lowerCaseQuery) ||
      profile.name.toLowerCase().includes(lowerCaseQuery)
  );
});
// 按 profile 分组
const modelGroups = computed(() => {
  const groups: Map<string, { profile: LlmProfile; models: LlmModelInfo[] }> = new Map();

  allModels.value.forEach(({ profile, model }) => {
    if (!groups.has(profile.id)) {
      groups.set(profile.id, { profile, models: [] });
    }
    groups.get(profile.id)!.models.push(model);
  });

  // 简单排序，可以根据需要调整
  return Array.from(groups.values()).sort((a, b) => a.profile.name.localeCompare(b.profile.name));
});

// 判断是否为当前选中的模型
function isCurrentModel(profile: LlmProfile, model: LlmModelInfo): boolean {
  if (!currentSelection.value) return false;
  return currentSelection.value.profile.id === profile.id &&
         currentSelection.value.model.id === model.id;
}

// 生成模型的唯一 key
function getModelKey(profile: LlmProfile, model: LlmModelInfo): string {
  return `${profile.id}-${model.id}`;
}

function handleSelectModel(profile: LlmProfile, model: LlmModelInfo) {
  select({ profile, model });
}

function handleClose() {
  cancel();
}

// 滚动到当前选中的模型
watch(isDialogVisible, async (visible) => {
  if (visible && currentSelection.value) {
    await nextTick();
    const currentKey = getModelKey(currentSelection.value.profile, currentSelection.value.model);
    const currentElement = document.querySelector(`[data-model-key="${currentKey}"]`);
    if (currentElement && modelListWrapperRef.value) {
      currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
});
</script>

<template>
  <BaseDialog :visible="isDialogVisible" title="搜索模型" width="600px" @update:visible="(val) => !val && handleClose()"
    @close="handleClose">
    <template #content>
      <div class="model-select-content">
        <el-input v-model="searchQuery" placeholder="搜索模型名称或服务商..." clearable class="search-input" />

        <div ref="modelListWrapperRef" class="model-list-wrapper">
          <div v-if="allModels.length > 0" class="model-list">
            <div v-for="group in modelGroups" :key="group.profile.id" class="model-group">
              <h3 class="group-title">{{ group.profile.name }}</h3>
              <div
                v-for="model in group.models"
                :key="model.id"
                :data-model-key="getModelKey(group.profile, model)"
                :class="['model-item', { 'is-current': isCurrentModel(group.profile, model) }]"
                @click="handleSelectModel(group.profile, model)">
                <div class="model-item-content">
                  <div class="model-avatar">
                    <DynamicIcon v-if="getModelIcon(model)" :src="getModelIcon(model)!" :alt="model.name"
                      class="model-icon" />
                    <div v-else class="model-icon-placeholder">
                      {{ model.name.substring(0, 2).toUpperCase() }}
                    </div>
                  </div>
                  <div class="model-info">
                    <div class="model-header">
                      <span class="model-name-text">{{ model.name }}</span>
                      <div class="model-capabilities">
                        <template v-for="capability in MODEL_CAPABILITIES" :key="capability.key">
                          <el-tooltip v-if="model.capabilities?.[capability.key]" :content="capability.description"
                            placement="top">
                            <el-icon class="capability-icon" :class="capability.className"
                              :style="{ color: capability.color }">
                              <component :is="capability.icon" />
                            </el-icon>
                          </el-tooltip>
                        </template>
                      </div>
                    </div>
                    <div class="model-id-text">{{ model.id }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="没有找到匹配的模型" />
        </div>
      </div>
    </template>
  </BaseDialog>
</template>
<style scoped>
.model-select-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 400px;
  max-height: 60vh;
}

.search-input {
  flex-shrink: 0;
}

.model-list-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.model-list {
  padding: 4px;
}

.model-group {
  margin-bottom: 20px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  padding: 0 8px;
}

.model-item {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
  border: 2px solid transparent;
}

.model-item:hover {
  background-color: var(--el-fill-color-light);
}

.model-item.is-current {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  border-color: var(--primary-color);
}

.model-item.is-current:hover {
  background-color: color-mix(in srgb, var(--primary-color) 15%, transparent);
}

/* 暗色主题下的阴影效果 */
html.dark .model-item.is-current {
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

/* 亮色主题下的阴影效果 */
html:not(.dark) .model-item.is-current {
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

.model-item-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-avatar {
  flex-shrink: 0;
}

.model-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 6px;
}

.model-icon-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
  margin-bottom: 4px;
}

.model-name-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.model-id-text {
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  color: var(--el-text-color-regular);
}

.model-capabilities {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.capability-icon {
  font-size: 16px;
  cursor: help;
  transition: transform 0.2s;
}

.capability-icon:hover {
  transform: scale(1.15);
}

/* 滚动条样式 */
.model-list-wrapper::-webkit-scrollbar {
  width: 6px;
}

.model-list-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.model-list-wrapper::-webkit-scrollbar-thumb {
  background: var(--el-border-color-light);
  border-radius: 3px;
}

.model-list-wrapper::-webkit-scrollbar-thumb:hover {
  background: var(--el-border-color);
}
</style>