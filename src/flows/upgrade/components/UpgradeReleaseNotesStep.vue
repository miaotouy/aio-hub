<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { CalendarDays, ChevronDown } from "lucide-vue-next";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import { releaseNotesRegistry } from "../releaseNotesRegistry";
import type { UpgradeFlowContext } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const expandedVersions = ref<string[]>([]);

const manifests = computed(() =>
  props.context.releaseVersions
    .map((version) => releaseNotesRegistry.get(version))
    .filter((manifest) => manifest !== undefined)
    .sort((left, right) => {
      if (left.version === props.context.primaryReleaseVersion) return -1;
      if (right.version === props.context.primaryReleaseVersion) return 1;
      return 0;
    })
);
</script>

<template>
  <div class="release-notes-step">
    <el-collapse v-if="manifests.length" v-model="expandedVersions">
      <el-collapse-item
        v-for="(manifest, index) in manifests"
        :key="manifest.version"
        :name="manifest.version"
      >
        <template #title>
          <div class="release-summary">
            <div class="release-copy">
              <div class="release-meta">
                <strong>v{{ manifest.version }}</strong>
                <span v-if="index === 0" class="current-badge">当前</span>
                <span class="release-date">
                  <CalendarDays :size="13" />
                  {{ manifest.publishedAt }}
                </span>
              </div>
              <h4>{{ manifest.title }}</h4>
              <p>{{ manifest.summary }}</p>
            </div>
            <ChevronDown class="expand-icon" :size="17" aria-hidden="true" />
          </div>
        </template>

        <div class="release-details">
          <ul v-if="manifest.highlights?.length" class="highlight-list">
            <li v-for="item in manifest.highlights" :key="item">{{ item }}</li>
          </ul>
          <div class="release-body">
            <RichTextRenderer
              :content="manifest.body"
              :version="RendererVersion.V2_CUSTOM_PARSER"
              :enable-enter-animation="false"
            />
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <el-empty
      v-else
      description="此构建未包含可显示的本地版本说明"
      :image-size="64"
    />
  </div>
</template>

<style scoped>
.release-notes-step :deep(.el-collapse) {
  border-top: 0;
  border-bottom: 0;
}

.release-notes-step :deep(.el-collapse-item) {
  margin-bottom: 10px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
}

.release-notes-step :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 82px;
  padding: 13px 14px;
  border-bottom: 0;
  background: transparent;
  line-height: normal;
}

.release-notes-step :deep(.el-collapse-item__arrow) {
  display: none;
}

.release-notes-step :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
  background: transparent;
}

.release-notes-step :deep(.el-collapse-item__content) {
  padding: 0;
}

.release-summary {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  text-align: left;
}

.release-copy {
  min-width: 0;
}

.release-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-secondary);
  font-size: 11px;
}

.release-meta strong {
  color: var(--primary-color);
  font-size: 12px;
}

.current-badge {
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
  font-weight: 600;
}

.release-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

h4 {
  margin: 5px 0 4px;
  overflow: hidden;
  color: var(--text-color);
  font-size: 15px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

p {
  margin: 0;
  overflow: hidden;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  flex: none;
  color: var(--text-color-secondary);
  transition: transform 160ms ease;
}

.release-notes-step
  :deep(.el-collapse-item.is-active)
  .release-summary
  .expand-icon {
  transform: rotate(180deg);
}

.release-details {
  display: grid;
  gap: 14px;
  margin: 0 14px 14px;
  border-top: 1px solid var(--border-color);
  padding-top: 14px;
}

.highlight-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.highlight-list li {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--text-color-secondary);
  font-size: 11px;
}

.release-body {
  min-width: 0;
  font-size: 13px;
}

@media (prefers-reduced-motion: reduce) {
  .expand-icon {
    transition: none;
  }
}
</style>
