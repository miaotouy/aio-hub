<script setup lang="ts">
import { onMounted } from "vue";
import WorldbookFullManager from "../llm-chat/components/worldbook/WorldbookFullManager.vue";
import { useWorldbookStore } from "../llm-chat/stores/worldbookStore";

const worldbookStore = useWorldbookStore();

onMounted(() => {
  // 初始化状态同步，确保分离窗口能与主窗口同步
  worldbookStore.initializeSync();
});
</script>

<template>
  <div class="st-worldbook-editor-container">
    <div class="editor-content">
      <WorldbookFullManager />
    </div>
  </div>
</template>

<style scoped>
.st-worldbook-editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
}

.editor-content {
  flex: 1;
  min-height: 0;
  /* 独立工具入口，不需要额外 padding，让内部组件自己控制 */
  box-sizing: border-box;
}

/* 适配 WorldbookFullManager 的内部样式 */
:deep(.worldbook-full-manager) {
  border: none;
  background: transparent;
  backdrop-filter: none;
}
</style>
