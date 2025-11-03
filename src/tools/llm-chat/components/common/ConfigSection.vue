<script setup lang="ts">
import { computed } from "vue";
import type { Component } from "vue";

/**
 * 可复用的配置分组组件，提供统一的折叠/展开样式和交互
 */

const props = defineProps<{
  /** 分组标题 */
  title: string;
  /** 图标组件（如 i-ep-setting） */
  icon?: Component | string;
  /** 展开状态（支持 v-model） */
  expanded?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:expanded", value: boolean): void;
}>();

// 本地展开状态
const isExpanded = computed({
  get: () => props.expanded ?? true,
  set: (value) => emit("update:expanded", value),
});

// 切换展开/折叠
const toggle = () => {
  isExpanded.value = !isExpanded.value;
};
</script>

<template>
  <div class="config-section">
    <div
      class="config-section-header clickable"
      @click="toggle"
      :title="isExpanded ? '点击折叠' : '点击展开'"
    >
      <div class="section-title-wrapper">
        <component v-if="icon" :is="icon" class="section-icon" />
        <span class="config-section-title">{{ title }}</span>
      </div>
      <i-ep-arrow-down class="collapse-icon" :class="{ expanded: isExpanded }" />
    </div>

    <div class="config-section-content" :class="{ collapsed: !isExpanded }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.config-section {
  margin-bottom: 16px;
}

.config-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--primary-color) 3%, transparent),
    color-mix(in srgb, var(--primary-color) 1%, transparent)
  );
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.config-section-header::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--primary-color);
  opacity: 0;
  transition: opacity 0.25s;
}

.config-section-header.clickable {
  cursor: pointer;
  user-select: none;
}

.config-section-header.clickable:hover {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--primary-color) 8%, transparent),
    color-mix(in srgb, var(--primary-color) 4%, transparent)
  );
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-color) 15%, transparent);
  transform: translateY(-1px);
}

.config-section-header.clickable:hover::before {
  opacity: 1;
}

.config-section-header.clickable:active {
  transform: translateY(0);
}

.section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.section-icon {
  font-size: 16px;
  color: var(--primary-color);
  transition: transform 0.25s;
  flex-shrink: 0;
}

.config-section-header:hover .section-icon {
  transform: scale(1.1);
}

.config-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.collapse-icon {
  font-size: 14px;
  color: var(--text-color-light);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.collapse-icon.expanded {
  transform: rotate(180deg);
  color: var(--primary-color);
}

.config-section-header:hover .collapse-icon {
  color: var(--primary-color);
}

.config-section-content {
  max-height: 2000px;
  overflow: hidden;
  transition:
    max-height 0.3s ease-in-out,
    opacity 0.3s ease-in-out;
  opacity: 1;
}

.config-section-content.collapsed {
  max-height: 0;
  opacity: 0;
}
</style>