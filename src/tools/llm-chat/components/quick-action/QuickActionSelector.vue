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
import { onMounted } from "vue";
import { useQuickActionStore } from "../../stores/quickActionStore";
import { Zap } from "lucide-vue-next";

withDefaults(
  defineProps<{
    modelValue: string[];
    placeholder?: string;
  }>(),
  {
    modelValue: () => [],
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

const quickActionStore = useQuickActionStore();

onMounted(async () => {
  await quickActionStore.loadQuickActions();
});
</script>

<template>
  <div class="quick-action-selector">
    <el-select
      :model-value="modelValue"
      @update:model-value="(val: string[]) => emit('update:modelValue', val)"
      multiple
      filterable
      :max-collapse-tags="8"
      collapse-tags-tooltip
      :placeholder="placeholder || '选择关联的快捷操作组...'"
      class="qa-select"
    >
      <template #prefix>
        <el-icon><Zap /></el-icon>
      </template>
      <el-option
        v-for="set in quickActionStore.quickActionSets"
        :key="set.id"
        :label="set.name"
        :value="set.id"
      >
        <div class="qa-option">
          <span class="qa-name">{{ set.name }}</span>
          <span class="qa-count">{{ set.actionCount }} 个操作</span>
        </div>
      </el-option>
    </el-select>
  </div>
</template>

<style scoped>
.quick-action-selector {
  width: 100%;
}

.qa-select {
  width: 100%;
}

.qa-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.qa-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
