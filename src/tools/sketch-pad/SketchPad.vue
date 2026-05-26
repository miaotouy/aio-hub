<template>
  <div class="sketch-pad-tool">
    <!-- 1. 草图列表界面 -->
    <SketchGallery v-if="state.currentView.value === 'gallery'" />

    <!-- 2. 编辑界面 -->
    <div v-else class="editor-container">
      <!-- 画布区域（底层，占满） -->
      <KonvaCanvas />

      <!-- 悬浮工具栏（顶部居中） -->
      <Toolbar />

      <!-- 悬浮属性面板（左下角） -->
      <PropertyPanel />

      <!-- 悬浮图层面板（右下角） -->
      <LayerPanel />
    </div>

    <!-- 设置对话框（不参与 v-if/v-else 链） -->
    <SketchSettingsDialog v-model="showSettings" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import SketchGallery from "./components/SketchGallery.vue";
import Toolbar from "./components/Toolbar.vue";
import KonvaCanvas from "./components/KonvaCanvas.vue";
import PropertyPanel from "./components/PropertyPanel.vue";
import LayerPanel from "./components/LayerPanel.vue";
import SketchSettingsDialog from "./components/SketchSettingsDialog.vue";

import { createEditorSession, provideEditorSession } from "./composables/useEditorSession";
import { useHistoryApplicator } from "./composables/useHistoryApplicator";
import { useProjectLifecycle } from "./composables/useProjectLifecycle";
import { useEditorExport } from "./composables/useEditorExport";
import { useLayerOperations } from "./composables/useLayerOperations";
import { useAutoSave } from "./composables/useAutoSave";
import { useEditorKeyboard } from "./composables/useEditorKeyboard";
import { useSketchPadStore } from "./stores/sketchPadStore";

// ─── 创建并 provide EditorSession ───
const session = createEditorSession();
provideEditorSession(session);

const { state } = session;
const store = useSketchPadStore();

// 设置对话框
const showSettings = ref(false);

// ─── 组合各功能模块 ───
const historyApplicator = useHistoryApplicator(session);
// 注册 applicator 到 runtime，使 session.actions.undo/redo 能完整工作
session.runtime.registerHistoryApplicator(historyApplicator.applyHistoryEntry);

const exportActions = useEditorExport(session);
const lifecycle = useProjectLifecycle(session);
const layerOps = useLayerOperations(session);
const autoSave = useAutoSave(session, exportActions);
const keyboard = useEditorKeyboard(session, exportActions);

// ─── 将模块方法暴露到 session 上下文（供子组件通过 provide/inject 使用） ───
// 注意：这些通过 provide 额外的 key 暴露，或者子组件直接使用 session.actions

// ─── 初始化 ───
onMounted(async () => {
  // 加载画板设置
  await store.loadSettings();
  session.actions.applySettingsDefaults(store.settings);

  // 同步项目索引
  await store.syncIndex();

  // 启动自动保存定时器
  autoSave.startAutoSaveTimer();
});

// ─── 暴露给子组件的额外上下文（通过 provide） ───
import { provide } from "vue";

// 暴露 lifecycle、export、layerOps 等模块供子组件使用
export interface SketchPadContext {
  lifecycle: ReturnType<typeof useProjectLifecycle>;
  exportActions: ReturnType<typeof useEditorExport>;
  layerOps: ReturnType<typeof useLayerOperations>;
  historyApplicator: ReturnType<typeof useHistoryApplicator>;
  keyboard: ReturnType<typeof useEditorKeyboard>;
  showSettings: typeof showSettings;
}

const sketchPadContext: SketchPadContext = {
  lifecycle,
  exportActions,
  layerOps,
  historyApplicator,
  keyboard,
  showSettings,
};

provide("sketchPadContext", sketchPadContext);
</script>

<style scoped>
.sketch-pad-tool {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
}
</style>
