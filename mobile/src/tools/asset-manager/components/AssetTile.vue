<script setup lang="ts">
import {
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Pin,
} from "lucide-vue-next";
import { computed } from "vue";
import { formatAssetBytes } from "../composables/useAssetLibrary";
import type { AssetRecord } from "../types";

const props = defineProps<{
  asset: AssetRecord;
  selected: boolean;
}>();

const emit = defineEmits<{
  open: [assetId: string];
  select: [assetId: string];
}>();

const icon = computed(() => {
  switch (props.asset.kind) {
    case "image":
      return FileImage;
    case "audio":
      return FileAudio;
    case "video":
      return FileVideo;
    case "document":
      return FileText;
    default:
      return File;
  }
});

const statusLabel = computed(() => {
  const labels: Record<AssetRecord["availability"], string> = {
    ready: "可用",
    importing: "导入中",
    reclaimed: "原件已清理",
    missing: "原件缺失",
    error: "异常",
  };
  return labels[props.asset.availability];
});
</script>

<template>
  <article
    class="asset-tile"
    :class="{ 'asset-tile--selected': selected, 'asset-tile--muted': asset.libraryState === 'hidden' }"
  >
    <button class="asset-main" type="button" @click="emit('open', asset.id)">
      <span class="asset-icon" :data-kind="asset.kind">
        <component :is="icon" :size="30" :stroke-width="1.6" />
      </span>
      <span class="asset-copy">
        <span class="asset-name">{{ asset.displayName }}</span>
        <span class="asset-meta">{{ formatAssetBytes(asset.sizeBytes) }} · {{ asset.mimeType }}</span>
      </span>
    </button>
    <div class="asset-footer">
      <span class="status" :data-status="asset.availability">{{ statusLabel }}</span>
      <Pin v-if="asset.retentionPolicy === 'pinned'" :size="15" aria-label="已固定" />
      <button
        class="select-button"
        type="button"
        :aria-label="selected ? '取消选择' : '选择资产'"
        :aria-pressed="selected"
        @click="emit('select', asset.id)"
      >
        <span aria-hidden="true">{{ selected ? "✓" : "" }}</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
.asset-tile {
  min-width: 0;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  overflow: hidden;
}

.asset-tile--selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px var(--primary-color);
}

.asset-tile--muted {
  opacity: 0.72;
}

.asset-main {
  width: 100%;
  min-width: 0;
  padding: 14px 12px 10px;
  display: flex;
  gap: 11px;
  align-items: center;
  text-align: left;
  color: inherit;
  background: transparent;
  border: 0;
}

.asset-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  display: grid;
  place-items: center;
  border-radius: var(--app-radius-md);
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, var(--input-bg));
}

.asset-icon[data-kind="audio"] {
  color: var(--success-color);
  background: color-mix(in srgb, var(--success-color) 12%, var(--input-bg));
}

.asset-icon[data-kind="video"] {
  color: var(--danger-color);
  background: color-mix(in srgb, var(--danger-color) 10%, var(--input-bg));
}

.asset-icon[data-kind="document"] {
  color: var(--warning-color);
  background: color-mix(in srgb, var(--warning-color) 12%, var(--input-bg));
}

.asset-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.asset-name {
  overflow: hidden;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-meta {
  overflow: hidden;
  color: var(--text-color-light);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-footer {
  min-height: 42px;
  padding: 0 10px 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-light);
}

.status {
  flex: 1;
  font-size: 12px;
}

.status[data-status="missing"],
.status[data-status="error"] {
  color: var(--danger-color);
}

.status[data-status="importing"] {
  color: var(--primary-color);
}

.select-button {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--input-bg);
  color: transparent;
}

.select-button[aria-pressed="true"] {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: white;
}
</style>
