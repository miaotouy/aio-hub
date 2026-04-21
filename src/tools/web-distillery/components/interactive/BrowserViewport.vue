<script setup lang="ts">
import { ref, watch } from "vue";
import { useWebDistilleryStore } from "../../stores/store";
import { iframeBridge } from "../../core/iframe-bridge";

const store = useWebDistilleryStore();
const containerRef = ref<HTMLElement | null>(null);

defineExpose({ containerRef });

// 同步持久高亮
const syncPersistentHighlights = async () => {
  if (!store.recipeDraft) return;
  await iframeBridge.clearHighlights();

  for (const selector of store.recipeDraft.extractSelectors || []) {
    if (selector) await iframeBridge.addHighlight(selector, "include");
  }
  for (const selector of store.recipeDraft.excludeSelectors || []) {
    if (selector) await iframeBridge.addHighlight(selector, "exclude");
  }
};

// 监听规则变化，同步高亮
watch(
  [() => store.recipeDraft?.extractSelectors, () => store.recipeDraft?.excludeSelectors],
  () => {
    syncPersistentHighlights();
  },
  { deep: true },
);
</script>

<template>
  <div class="browser-viewport">
    <div ref="containerRef" class="browser-viewport-inner"></div>

    <!-- 加载遮罩 -->
    <div v-if="store.isLoading" class="viewport-overlay">
      <el-skeleton :rows="10" animated />
    </div>
  </div>
</template>

<style scoped>
.browser-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.browser-viewport-inner {
  width: 100%;
  height: 100%;
}

.viewport-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--container-bg);
  padding: 40px;
  z-index: 10;
}
</style>
