<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays } from "lucide-vue-next";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import { useReleaseNotesViewerStore } from "../releaseNotesViewerStore";
import { releaseNotesRegistry } from "../releaseNotesRegistry";

const props = defineProps<{
  versions: string[];
  primaryVersion?: string;
}>();

const viewer = useReleaseNotesViewerStore();

const archive = computed(() => releaseNotesRegistry.getAll().slice().reverse());

const selectedManifest = computed(() => {
  const selected = viewer.selectedVersion
    ? releaseNotesRegistry.get(viewer.selectedVersion)
    : undefined;
  if (selected) return selected;
  const primary = props.primaryVersion
    ? releaseNotesRegistry.get(props.primaryVersion)
    : undefined;
  if (primary) return primary;
  for (const version of props.versions) {
    const manifest = releaseNotesRegistry.get(version);
    if (manifest) return manifest;
  }
  return archive.value[0];
});
</script>

<template>
  <div class="release-notes-step">
    <div v-if="archive.length" class="archive-layout">
      <aside class="archive-sidebar" aria-label="历史版本列表">
        <button
          v-for="manifest in archive"
          :key="manifest.version"
          type="button"
          class="archive-item"
          :class="{
            'is-active': manifest.version === selectedManifest?.version,
            'is-current': manifest.version === primaryVersion,
          }"
          @click="viewer.select(manifest.version)"
        >
          <span class="archive-item__meta">
            <strong>v{{ manifest.version }}</strong>
            <span
              v-if="manifest.version === primaryVersion"
              class="current-badge"
            >
              当前
            </span>
            <span class="archive-item__date">{{ manifest.publishedAt }}</span>
          </span>
          <span class="archive-item__title">{{ manifest.title }}</span>
        </button>
      </aside>

      <section
        v-if="selectedManifest"
        :key="selectedManifest.version"
        class="archive-detail"
      >
        <div class="release-meta">
          <strong>v{{ selectedManifest.version }}</strong>
          <span
            v-if="selectedManifest.version === primaryVersion"
            class="current-badge"
          >
            当前版本
          </span>
          <span class="release-date">
            <CalendarDays :size="13" />
            {{ selectedManifest.publishedAt }}
          </span>
        </div>
        <h4>{{ selectedManifest.title }}</h4>
        <p class="release-summary">{{ selectedManifest.summary }}</p>
        <ul v-if="selectedManifest.highlights?.length" class="highlight-list">
          <li v-for="item in selectedManifest.highlights" :key="item">
            {{ item }}
          </li>
        </ul>
        <div class="release-body">
          <RichTextRenderer
            :content="selectedManifest.body"
            :version="RendererVersion.V2_CUSTOM_PARSER"
            :enable-enter-animation="false"
          />
        </div>
      </section>
    </div>

    <el-empty
      v-else
      description="此构建未包含可显示的本地版本说明"
      :image-size="64"
    />
  </div>
</template>

<style scoped>
.release-notes-step {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.archive-layout {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  gap: 16px;
}

.archive-sidebar {
  display: flex;
  width: 228px;
  min-width: 0;
  flex: none;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

.archive-item {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.archive-item:hover {
  border-color: var(--border-color);
  background: color-mix(in srgb, var(--card-bg) 60%, transparent);
}

.archive-item.is-active {
  border-color: color-mix(in srgb, var(--primary-color) 42%, transparent);
  background: color-mix(in srgb, var(--primary-color) 9%, transparent);
}

.archive-item__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--text-color-secondary);
  font-size: 11px;
}

.archive-item__meta strong {
  color: var(--primary-color);
  font-size: 12px;
}

.archive-item__date {
  margin-left: auto;
  flex: none;
}

.archive-item__title {
  overflow: hidden;
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-badge {
  flex: none;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
  font-weight: 600;
}

.archive-detail {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 2px;
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

.release-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

h4 {
  margin: 7px 0 4px;
  color: var(--text-color);
  font-size: 17px;
  line-height: 1.35;
}

.release-summary {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.highlight-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 14px 0 0;
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
  margin-top: 14px;
  border-top: 1px solid var(--border-color);
  padding-top: 14px;
  font-size: 13px;
}

@media (max-width: 620px) {
  .archive-layout {
    flex-direction: column;
  }

  .archive-sidebar {
    width: auto;
    max-height: none;
    flex-direction: row;
    overflow: auto;
    padding-right: 0;
    padding-bottom: 4px;
  }

  .archive-item {
    min-width: 190px;
    flex: none;
  }
}
</style>
