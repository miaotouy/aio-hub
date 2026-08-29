<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->

<template>
  <el-popover
    placement="bottom-end"
    :width="248"
    trigger="click"
    popper-class="home-options-popover"
  >
    <template #reference>
      <button
        class="home-options-button"
        type="button"
        aria-label="首页选项"
        title="首页选项"
      >
        <Settings2 :size="18" :stroke-width="2" />
      </button>
    </template>
    <div class="home-options-panel">
      <div class="home-options-header">
        <div class="home-options-title">首页选项</div>
        <div class="home-options-hint">调整首页内容显示</div>
      </div>
      <div class="home-option-row">
        <div class="home-option-copy">
          <span class="home-option-label">显示快捷栏</span>
          <span class="home-option-description">
            显示首页顶部的快捷工具和管理按钮
          </span>
        </div>
        <el-switch v-model="showQuickAccess" aria-label="显示快捷栏" />
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Settings2 } from "lucide-vue-next";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [visible: boolean];
}>();

const showQuickAccess = computed({
  get: () => props.modelValue,
  set: (visible: boolean) => emit("update:modelValue", visible),
});
</script>

<style scoped>
.home-options-button {
  position: absolute;
  top: 14px;
  right: 16px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: var(--border-width) solid
    color-mix(in srgb, var(--border-color) 75%, transparent);
  border-radius: 12px;
  color: var(--text-color);
  background: color-mix(in srgb, var(--card-bg) 68%, transparent);
  backdrop-filter: blur(var(--ui-blur));
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.home-options-button:hover,
.home-options-button:focus-visible {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--card-bg) 84%, transparent);
  transform: translateY(-1px);
  outline: none;
}

.home-options-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.home-options-header {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.home-options-title {
  color: var(--text-color);
  font-size: 0.95rem;
  font-weight: 600;
}

.home-options-hint,
.home-option-description {
  color: var(--text-color-light);
  font-size: 0.75rem;
  line-height: 1.4;
}

.home-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0 2px;
  border-top: var(--border-width) solid var(--border-color);
}

.home-option-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  text-align: left;
}

.home-option-label {
  color: var(--text-color);
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
