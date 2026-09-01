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
    :width="280"
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

      <div class="home-option-row">
        <div class="home-option-copy">
          <span class="home-option-label">显示趣味标志 (Doodle)</span>
          <span class="home-option-description">
            在首页上方显示应用名和趣味副标题
          </span>
        </div>
        <el-switch v-model="showHomeDoodle" aria-label="显示趣味标志" />
      </div>

      <div class="home-option-row" v-if="showHomeDoodle">
        <div class="home-option-copy sub-option">
          <span class="home-option-label">启用花哨标题样式</span>
          <span class="home-option-description">
            开启后标题会随机呈现各种花哨的艺术字效果
          </span>
        </div>
        <el-switch v-model="enableFancyDoodle" aria-label="启用花哨标题样式" />
      </div>

      <div class="home-option-row flex-column">
        <div class="home-option-copy">
          <span class="home-option-label">分类栏位置</span>
          <span class="home-option-description">
            调整工具分类导航栏的显示位置
          </span>
        </div>
        <el-radio-group
          v-model="categoryLayout"
          size="small"
          class="home-option-radio-group"
        >
          <el-radio-button value="left">左侧</el-radio-button>
          <el-radio-button value="right">右侧</el-radio-button>
          <el-radio-button value="top">上方</el-radio-button>
          <el-radio-button value="bottom">下方</el-radio-button>
        </el-radio-group>
      </div>

      <div class="home-option-row flex-column">
        <div class="home-option-copy">
          <span class="home-option-label">卡片样式</span>
          <span class="home-option-description">
            调整工具卡片的视觉呈现风格
          </span>
        </div>
        <el-radio-group
          v-model="cardStyle"
          size="small"
          class="home-option-radio-group"
        >
          <el-radio-button value="classic">经典</el-radio-button>
          <el-radio-button value="compact">紧凑</el-radio-button>
          <el-radio-button value="large">精致</el-radio-button>
          <el-radio-button value="list">列表</el-radio-button>
        </el-radio-group>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Settings2 } from "lucide-vue-next";
import { useAppSettingsStore } from "@/stores/appSettingsStore";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [visible: boolean];
}>();

const appSettingsStore = useAppSettingsStore();
const settings = computed(() => appSettingsStore.settings);

const showQuickAccess = computed({
  get: () => props.modelValue,
  set: (visible: boolean) => emit("update:modelValue", visible),
});

const showHomeDoodle = computed({
  get: () => settings.value.showHomeDoodle ?? true,
  set: (visible: boolean) =>
    appSettingsStore.update({ showHomeDoodle: visible }),
});

const enableFancyDoodle = computed({
  get: () => settings.value.enableFancyDoodle ?? false,
  set: (visible: boolean) =>
    appSettingsStore.update({ enableFancyDoodle: visible }),
});

const categoryLayout = computed({
  get: () => settings.value.homeCategoryLayout ?? "left",
  set: (val) => appSettingsStore.update({ homeCategoryLayout: val }),
});

const cardStyle = computed({
  get: () => settings.value.homeCardStyle ?? "classic",
  set: (val) => appSettingsStore.update({ homeCardStyle: val }),
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
  padding: 12px 0;
  border-top: var(--border-width) solid var(--border-color);
}

.home-option-row.flex-column {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.home-option-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  text-align: left;
}

.home-option-copy.sub-option {
  padding-left: 12px;
  border-left: 2px solid var(--border-color);
}

.home-option-radio-group {
  display: flex;
  width: 100%;
}

.home-option-radio-group :deep(.el-radio-button) {
  flex: 1;
}

.home-option-radio-group :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 0;
  font-size: 0.75rem;
}

.home-option-label {
  color: var(--text-color);
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
