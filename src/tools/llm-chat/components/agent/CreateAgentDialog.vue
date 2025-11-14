<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAgentPresets } from '@/composables/useAgentPresets';
import Avatar from '@/components/common/Avatar.vue';
import type { AgentPreset } from '../../types';

// Emits
interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'create-from-preset', preset: AgentPreset): void;
  (e: 'create-from-blank'): void;
}

defineProps<{ visible: boolean }>();
const emit = defineEmits<Emits>();

const { presets, allTags } = useAgentPresets();
const selectedTag = ref<string | 'all'>('all');

// 根据分类过滤预设
const filteredPresets = computed(() => {
  if (selectedTag.value === 'all') {
    return presets.value;
  }
  return presets.value.filter((p) => p.tags?.includes(selectedTag.value));
});

// 从预设创建
const handleCreateFromPreset = (preset: AgentPreset) => {
  emit('create-from-preset', preset);
  emit('update:visible', false);
};

// 从空白创建
const handleCreateFromBlank = () => {
  emit('create-from-blank');
  emit('update:visible', false);
};

const getCategoryLabel = (category: string | 'all') => {
  if (category === 'all') return '全部';
  return category;
};
</script>

<template>
  <BaseDialog
      :modelValue="visible"
      @update:modelValue="(val: boolean) => emit('update:visible', val)"
    title="创建新智能体"
    width="80%"
    height="75vh"
  >
    <template #content>
      <div class="preset-options">
      <div class="preset-section">
        <h4>从预设模板创建</h4>
        <p class="preset-section-desc">选择一个预设模板，快速开始你的对话。</p>

        <!-- 分类标签 -->
        <div class="category-tabs">
          <button
            @click="selectedTag = 'all'"
            :class="{ active: selectedTag === 'all' }"
            class="category-tab"
          >
            全部
          </button>
          <button
            v-for="tag in allTags"
            :key="tag"
            @click="selectedTag = tag"
            :class="{ active: selectedTag === tag }"
            class="category-tab"
          >
            {{ getCategoryLabel(tag) }}
          </button>
        </div>

        <!-- 预设网格 -->
        <div class="presets-scroll-area">
          <div class="preset-grid">
            <div
              v-for="preset in filteredPresets"
              :key="preset.id"
              class="preset-card"
              @click="handleCreateFromPreset(preset)"
            >
              <Avatar
                :src="preset.icon"
                :alt="preset.name"
                :size="40"
                shape="square"
                :radius="6"
              />
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <el-tooltip :content="preset.description" placement="top" :show-after="500">
                  <div class="preset-desc">{{ preset.description }}</div>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-divider />

      <div class="preset-section">
        <h4>自定义配置</h4>
        <el-button style="width: 100%" @click="handleCreateFromBlank"> 从空白创建 </el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 样式与 CreateProfileDialog.vue 保持一致 */
.preset-options {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.preset-section {
  margin-bottom: 20px;
}
.preset-section:first-child {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.preset-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}
.preset-section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--text-color-secondary);
}
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}
.category-tab {
  padding: 0.5rem 1rem;
  background: var(--card-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}
.category-tab:hover {
  border-color: var(--primary-color);
  background: var(--input-bg);
}
.category-tab.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}
.presets-scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  padding: 2px;
}
.preset-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--card-bg);
}
.preset-card:hover {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.05);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.preset-info {
  flex: 1;
  min-width: 0;
}
.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}
.preset-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  max-height: calc(1.4em * 2);
}
</style>