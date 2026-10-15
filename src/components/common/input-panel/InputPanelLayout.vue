<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    /** host scrolls the body; content reserves a height; layout delegates sizing and scrolling. */
    scroll?: "host" | "content" | "layout";
  }>(),
  { scroll: "host" }
);
</script>

<template>
  <div class="input-panel-layout" :class="`scroll-${scroll}`">
    <div v-if="$slots.controls" class="panel-controls">
      <slot name="controls" />
    </div>
    <div class="panel-body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="panel-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.input-panel-layout {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: var(--input-panel-max-height, min(260px, 32vh));
  box-sizing: border-box;
  overflow: hidden;
}
.panel-controls,
.panel-footer {
  flex: none;
  min-width: 0;
  padding: 8px 12px;
}
.panel-controls {
  border-bottom: var(--border-width) solid var(--border-color);
}
.panel-footer {
  padding-top: 6px;
  padding-bottom: 6px;
  border-top: var(--border-width) solid var(--border-color);
}
.panel-body {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  padding: 8px 12px;
  overflow: auto;
  overscroll-behavior: contain;
}
.scroll-content {
  height: var(--input-panel-max-height, min(260px, 32vh));
}
.scroll-content > .panel-body,
.scroll-layout > .panel-body {
  display: flex;
  overflow: hidden;
}
.scroll-layout > .panel-body {
  padding: 0;
}
.scroll-content > .panel-body > :deep(*),
.scroll-layout > .panel-body > :deep(*) {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
