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
import InputPanelLayout from "@/components/common/input-panel/InputPanelLayout.vue";
import { Plus } from "lucide-vue-next";
import {
  QUICK_PROMPT_LIBRARY,
  MEDIA_TYPE_PROMPT_HINTS,
} from "../prompt-library";
import type { MediaTaskType } from "../types";

const props = defineProps<{
  activeType: MediaTaskType;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "insert", prompt: string): void;
}>();

const activeCategoryId = ref(
  QUICK_PROMPT_LIBRARY[props.activeType][0]?.id || ""
);

const categories = computed(() => QUICK_PROMPT_LIBRARY[props.activeType]);
const activeCategory = computed(
  () =>
    categories.value.find(
      (category) => category.id === activeCategoryId.value
    ) || categories.value[0]
);

watch(
  () => props.activeType,
  (type) => {
    activeCategoryId.value = QUICK_PROMPT_LIBRARY[type][0]?.id || "";
  }
);

const handleInsert = (prompt: string) => {
  if (props.disabled) return;
  emit("insert", prompt);
};
</script>

<template>
  <InputPanelLayout class="quick-prompt-library">
    <template #controls>
      <div class="quick-prompt-hint">
        {{ MEDIA_TYPE_PROMPT_HINTS[props.activeType] }}
      </div>
      <el-tabs v-model="activeCategoryId" class="quick-prompt-tabs">
        <el-tab-pane
          v-for="category in categories"
          :key="category.id"
          :label="category.label"
          :name="category.id"
        />
      </el-tabs>
    </template>
    <div v-if="activeCategory" class="quick-prompt-content">
      <div class="quick-prompt-grid">
        <button
          v-for="prompt in activeCategory.prompts"
          :key="prompt"
          type="button"
          class="quick-prompt-item"
          :disabled="props.disabled"
          :title="prompt"
          @click="handleInsert(prompt)"
        >
          <span>{{ prompt }}</span>
          <el-icon class="quick-prompt-add"><Plus /></el-icon>
        </button>
      </div>
    </div>
  </InputPanelLayout>
</template>

<style scoped>
.quick-prompt-library {
  width: 100%;
  color: var(--el-text-color-primary);
}

.quick-prompt-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.quick-prompt-tabs {
  margin: 6px 0 0;
}

.quick-prompt-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.quick-prompt-tabs :deep(.el-tabs__content) {
  display: none;
}

.quick-prompt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 8px;
}

.quick-prompt-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-height: 42px;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
  transition:
    border-color 0.2s,
    background-color 0.2s,
    color 0.2s,
    transform 0.2s;
}

.quick-prompt-item:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), 0.08);
  color: var(--el-color-primary);
  transform: translateY(-1px);
}

.quick-prompt-item:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.quick-prompt-add {
  flex: none;
  margin-top: 1px;
  color: var(--el-text-color-secondary);
}
</style>
