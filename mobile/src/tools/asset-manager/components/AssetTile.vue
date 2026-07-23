<script setup lang="ts">
import {
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Pin,
} from "lucide-vue-next";
import { computed, onBeforeUnmount } from "vue";
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

const LONG_PRESS_DELAY_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressOrigin: { x: number; y: number } | null = null;
let pressState: "idle" | "pending" | "moved" | "long-pressed" = "idle";

function clearPressTimer() {
  if (pressTimer !== null) clearTimeout(pressTimer);
  pressTimer = null;
}

function startPress(event: PointerEvent) {
  if (event.button !== 0) return;
  clearPressTimer();
  pressState = "pending";
  pressOrigin = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    pressTimer = null;
    if (pressState !== "pending") return;
    pressState = "long-pressed";
    emit("select", props.asset.id);
  }, LONG_PRESS_DELAY_MS);
}

function movePress(event: PointerEvent) {
  if (!pressOrigin) return;
  const distance = Math.hypot(
    event.clientX - pressOrigin.x,
    event.clientY - pressOrigin.y
  );
  if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) {
    clearPressTimer();
    if (pressState === "pending") pressState = "moved";
  }
}

function finishPress() {
  clearPressTimer();
  pressOrigin = null;
}

function cancelPress() {
  finishPress();
  if (pressState === "pending" || pressState === "long-pressed") {
    pressState = "moved";
  }
}

function openAsset() {
  if (pressState === "moved" || pressState === "long-pressed") {
    pressState = "idle";
    return;
  }
  pressState = "idle";
  emit("open", props.asset.id);
}

onBeforeUnmount(clearPressTimer);

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
    :class="{
      'asset-tile--selected': selected,
      'asset-tile--muted': asset.libraryState === 'hidden',
    }"
  >
    <button
      class="asset-main"
      type="button"
      @pointerdown="startPress"
      @pointermove="movePress"
      @pointerup="finishPress"
      @pointercancel="cancelPress"
      @pointerleave="cancelPress"
      @contextmenu.prevent
      @click="openAsset"
    >
      <span class="asset-icon" :data-kind="asset.kind">
        <component :is="icon" :size="30" :stroke-width="1.6" />
      </span>
      <span class="asset-copy">
        <span class="asset-name">{{ asset.displayName }}</span>
        <span class="asset-meta"
          >{{ formatAssetBytes(asset.sizeBytes) }} · {{ asset.mimeType }}</span
        >
      </span>
    </button>
    <div class="asset-footer">
      <span class="status" :data-status="asset.availability">{{
        statusLabel
      }}</span>
      <Pin
        v-if="asset.retentionPolicy === 'pinned'"
        :size="15"
        aria-label="已固定"
      />
    </div>
    <button
      class="select-button"
      type="button"
      :aria-label="selected ? '取消选择' : '选择资产'"
      :aria-pressed="selected"
      @click="emit('select', asset.id)"
    >
      <span aria-hidden="true">{{ selected ? "✓" : "" }}</span>
    </button>
  </article>
</template>

<style scoped>
.asset-tile {
  position: relative;
  aspect-ratio: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
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
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 6px 7px 26px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: stretch;
  text-align: center;
  color: inherit;
  background: transparent;
  border: 0;
}

.asset-icon {
  width: 36px;
  height: 36px;
  margin: 0 auto;
  flex: 0 0 36px;
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
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.asset-name {
  overflow: hidden;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-meta {
  overflow: hidden;
  color: var(--text-color-light);
  font-size: 10px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-footer {
  position: absolute;
  right: 6px;
  bottom: 4px;
  left: 7px;
  min-height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-color-light);
}

.status {
  flex: 1;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status[data-status="missing"],
.status[data-status="error"] {
  color: var(--danger-color);
}

.status[data-status="importing"] {
  color: var(--primary-color);
}

.select-button {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: transparent;
}

.select-button span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--input-bg);
}

.select-button[aria-pressed="true"] span {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: white;
}
</style>
