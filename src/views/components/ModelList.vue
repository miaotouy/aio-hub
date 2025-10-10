<script setup lang="ts">
import { computed } from "vue";
import { Plus, Delete, Edit } from "@element-plus/icons-vue";
import type { LlmModelInfo } from "../../types/llm-profiles";

interface Props {
  models: LlmModelInfo[];
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
});

interface Emits {
  (e: "add"): void;
  (e: "edit", index: number): void;
  (e: "delete", index: number): void;
  (e: "fetch"): void;
}

const emit = defineEmits<Emits>();

// 按分组组织模型
const modelGroups = computed(() => {
  const groups = new Map<string, LlmModelInfo[]>();

  props.models.forEach((model) => {
    const group = model.group || "未分组";
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(model);
  });

  return Array.from(groups.entries()).map(([name, models]) => ({
    name,
    models,
  }));
});
</script>

<template>
  <div class="model-list">
    <div class="list-header">
      <span class="model-count">已添加 {{ models.length }} 个模型</span>
      <div class="list-actions">
        <el-button v-if="editable" size="small" @click="emit('fetch')"> 从 API 获取 </el-button>
        <el-button v-if="editable" type="primary" size="small" :icon="Plus" @click="emit('add')">
          手动添加
        </el-button>
      </div>
    </div>

    <div v-if="models.length === 0" class="list-empty">
      <p>还没有添加任何模型</p>
      <p class="hint">点击"手动添加"或"从 API 获取"来添加模型</p>
    </div>

    <el-collapse v-else class="model-groups">
      <el-collapse-item
        v-for="(group, groupIndex) in modelGroups"
        :key="group.name"
        :name="groupIndex"
      >
        <template #title>
          <div class="group-title">
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">({{ group.models.length }})</span>
          </div>
        </template>

        <div class="group-models">
          <div
            v-for="model in group.models"
            :key="model.id"
            class="model-item"
          >
            <div class="model-info">
              <div class="model-name">{{ model.name }}</div>
              <div class="model-id">{{ model.id }}</div>
            </div>

            <div class="model-badges">
              <el-tag v-if="model.isVision" type="success" size="small">VLM</el-tag>
            </div>

            <div v-if="editable" class="model-actions">
              <el-button
                size="small"
                :icon="Edit"
                @click="emit('edit', models.indexOf(model))"
              />
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="emit('delete', models.indexOf(model))"
              />
            </div>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.model-list {
  width: 100%;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.model-count {
  font-size: 14px;
  color: var(--text-color);
}

.list-actions {
  display: flex;
  gap: 8px;
}

.list-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-secondary);
  background: var(--bg-color);
  border-radius: 6px;
  border: 1px solid var(--border-color-light);
}

.list-empty .hint {
  font-size: 12px;
  margin-top: 8px;
}

.model-groups {
  border: none;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-name {
  font-weight: 600;
  font-size: 14px;
}

.group-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.group-models {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 6px;
  border: 1px solid var(--border-color-light);
  transition: all 0.2s;
}

.model-item:hover {
  border-color: var(--border-color);
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.model-id {
  font-size: 12px;
  color: var(--text-color-secondary);
  font-family: monospace;
}

.model-badges {
  display: flex;
  gap: 4px;
}

.model-actions {
  display: flex;
  gap: 4px;
}
</style>