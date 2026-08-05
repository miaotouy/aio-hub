<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useReleaseNotesViewerStore } from "../releaseNotesViewerStore";
import { useGuidedFlowStore } from "@/stores/guidedFlowStore";
import UpgradeReleaseNotesStep from "./UpgradeReleaseNotesStep.vue";

const viewer = useReleaseNotesViewerStore();
const guidedFlowStore = useGuidedFlowStore();
const panelRef = ref<HTMLElement | null>(null);
const panelTitle = computed(() => {
  if (viewer.manifests.length === 1) {
    return `v${viewer.manifests[0].version} 版本说明`;
  }
  return `${viewer.manifests.length} 份版本说明`;
});

watch(
  () => viewer.visible,
  async (visible) => {
    if (!visible) return;
    await nextTick();
    panelRef.value?.focus({ preventScroll: true });
  }
);

watch(
  () => guidedFlowStore.hasActiveFlow,
  (hasActiveFlow) => {
    if (hasActiveFlow) viewer.close();
  }
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="viewer.visible"
      class="release-notes-viewer"
      data-testid="release-notes-viewer"
      @click.self="viewer.close"
      @keydown.esc="viewer.close"
    >
      <section
        ref="panelRef"
        class="release-notes-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="panelTitle"
        tabindex="-1"
      >
        <header class="release-notes-panel__header">
          <div>
            <span>更新档案</span>
            <h2>{{ panelTitle }}</h2>
            <p>仅用于阅读本地版本信息，不会改变升级事项或迁移状态。</p>
          </div>
          <button type="button" aria-label="关闭版本说明" @click="viewer.close">
            <X :size="18" />
          </button>
        </header>

        <div class="release-notes-panel__content" data-scroll-owner="viewer">
          <UpgradeReleaseNotesStep
            :versions="viewer.versions"
            :primary-version="viewer.primaryVersion"
          />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.release-notes-viewer {
  position: fixed;
  z-index: calc(var(--z-index-notification) + 1);
  inset: var(--titlebar-height, 0px) 0 0;
  display: flex;
  min-width: 0;
  min-height: 0;
  justify-content: flex-end;
  overflow: hidden;
  background: rgb(var(--backdrop-bg-rgb) / 24%);
  backdrop-filter: blur(calc(var(--ui-blur) * 0.5));
  -webkit-backdrop-filter: blur(calc(var(--ui-blur) * 0.5));
}

.release-notes-panel {
  display: flex;
  width: min(860px, calc(100vw - 24px));
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-left: var(--border-width) solid var(--border-color);
  background: color-mix(in srgb, var(--container-bg) 96%, transparent);
  box-shadow: -20px 0 56px rgb(0 0 0 / 18%);
  outline: none;
}

.release-notes-panel__header {
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--border-color);
  padding: 20px clamp(18px, 3vw, 30px);
  background: color-mix(in srgb, var(--card-bg) 68%, transparent);
}

.release-notes-panel__header > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.release-notes-panel__header span {
  color: var(--primary-color);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.release-notes-panel__header h2 {
  margin: 0;
  color: var(--text-color);
  font-size: clamp(19px, 2.5vw, 25px);
  line-height: 1.3;
}

.release-notes-panel__header p {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.release-notes-panel__header button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  border: 1px solid var(--control-border-color);
  border-radius: 9px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
  cursor: pointer;
}

.release-notes-panel__header button:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.release-notes-panel__content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: clamp(18px, 3vw, 30px);
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

@media (max-width: 620px) {
  .release-notes-panel {
    width: 100%;
    border-left: 0;
  }

  .release-notes-panel__header p {
    display: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .release-notes-viewer {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .release-notes-panel {
    background: var(--container-bg);
  }
}
</style>
