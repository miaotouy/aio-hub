<template>
  <div class="canvas-window">
    <!-- 顶部悬浮栏 -->
    <CanvasFloatingBar
      :title="activeCanvas?.metadata.name || 'Canvas Stage'"
      :show-status-bar="showStatusBar"
      @refresh="forceRefresh"
      @toggle-status-bar="showStatusBar = !showStatusBar"
      @open-vscode="openInVSCode"
      @close="closeWindow"
    />

    <!-- 主预览区域 -->
    <div class="preview-container">
      <CanvasPreviewPane
        :srcdoc="srcdoc"
        :is-refreshing="isRefreshing"
        @console-message="handleConsoleMessage"
      />
    </div>

    <!-- 底部状态栏 -->
    <CanvasStatusBar
      v-if="showStatusBar"
      current-file="index.html"
      :file-count="activeCanvas?.metadata.fileCount || 0"
      :pending-count="Object.keys(pendingUpdates).length"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { useCanvasStateConsumer } from "../../composables/useCanvasStateConsumer";
import { useCanvasPreview, type ConsoleMessage } from "../../composables/useCanvasPreview";
import { useCanvasStorage } from "../../composables/useCanvasStorage";
import CanvasPreviewPane from "./CanvasPreviewPane.vue";
import CanvasFloatingBar from "./CanvasFloatingBar.vue";
import CanvasStatusBar from "./CanvasStatusBar.vue";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/Window");

// 1. 状态同步消费者
const { activeCanvasId, pendingUpdates } = useCanvasStateConsumer();

// 2. 存储访问（用于物理文件回退）
const storage = useCanvasStorage();

// 3. 预览引擎
const {
  srcdoc,
  isRefreshing,
  consoleMessages,
  refreshPreview,
  forceRefresh,
} = useCanvasPreview({
  canvasId: () => activeCanvasId.value,
  pendingUpdates: () => pendingUpdates,
  readPhysicalFile: (id, path) => storage.readPhysicalFile(id, path),
  basePath: () => null, // 暂时不需要
});

// 4. UI 状态
const showStatusBar = ref(true);
const activeCanvas = ref<any>(null); // 这里的 metadata 需要通过某种方式获取，或者从 activeCanvasId 监听获取

// 监听 ID 变化，加载元数据（如果是第一次打开）
watch(activeCanvasId, async (newId) => {
  if (newId) {
    const metadata = await storage.readCanvasMetadata(newId);
    if (metadata) {
      activeCanvas.value = { metadata };
    }
    refreshPreview();
  }
}, { immediate: true });

// 监听影子文件变化，自动刷新预览
watch(() => ({ ...pendingUpdates }), () => {
  refreshPreview();
}, { deep: true });

function handleConsoleMessage(payload: any) {
  const msg: ConsoleMessage = {
    id: Math.random().toString(36).slice(2),
    level: payload.level,
    args: payload.args,
    timestamp: payload.timestamp,
  };
  consoleMessages.value.push(msg);
  // 保持最近 100 条
  if (consoleMessages.value.length > 100) {
    consoleMessages.value.shift();
  }
}

async function openInVSCode() {
  if (!activeCanvasId.value) return;
  const basePath = await storage.getCanvasBasePath(activeCanvasId.value);
  await invoke("open_path_in_vscode", { path: basePath });
}

function closeWindow() {
  getCurrentWebviewWindow().close();
}

onMounted(() => {
  logger.info("Canvas 舞台窗口已挂载");
});
</script>

<style scoped lang="scss">
.canvas-window {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f5f5f5;

  .preview-container {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
}
</style>