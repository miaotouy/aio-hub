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
        ref="previewPaneRef"
        :preview-src="previewSrc"
        :preview-srcdoc="previewSrcdoc"
        :is-refreshing="isRefreshing"
        @console-message="handleConsoleMessage"
      />
    </div>

    <!-- 底部状态栏 -->
    <CanvasStatusBar
      v-if="showStatusBar"
      current-file="index.html"
      :file-count="activeCanvas?.metadata.fileCount || 0"
      :pending-count="0"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, useAttrs } from "vue";
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
const attrs = useAttrs();

// 1. 状态同步消费者
const { activeCanvasId: syncedId, lastFileChangeTimestamp } = useCanvasStateConsumer();
const activeCanvasId = ref<string | null>(null);

// 调试日志：检查状态来源
onMounted(() => {
  logger.info("CanvasWindow 挂载检查", {
    attrs: attrs,
    syncedId: syncedId.value,
    canvasIdAttr: attrs["canvas-id"],
  });
});

// 优先使用同步 ID，如果没有则尝试从 attrs 获取（兼容嵌入模式）
watch(
  [syncedId, () => attrs["canvas-id"]],
  ([sId, aId]) => {
    const finalId = sId || (aId as string) || null;
    if (finalId !== activeCanvasId.value) {
      logger.info("CanvasWindow ID 更新", { sId, aId, finalId });
      activeCanvasId.value = finalId;
    }
  },
  { immediate: true },
);

// 2. 存储访问
const storage = useCanvasStorage();

const canvasBasePath = ref<string | null>(null);

// 3. 预览引擎
const { previewSrc, previewSrcdoc, isRefreshing, consoleMessages, refreshPreview, forceRefresh } = useCanvasPreview({
  canvasId: () => activeCanvasId.value,
  basePath: () => canvasBasePath.value,
  readPhysicalFile: (id, path) => storage.readPhysicalFile(id, path),
});

// 4. UI 状态
const showStatusBar = ref(true);
const activeCanvas = ref<any>(null);

// 监听 ID 变化，加载元数据
watch(
  () => activeCanvasId.value,
  async (newId) => {
    if (newId) {
      const [metadata, basePath] = await Promise.all([
        storage.readCanvasMetadata(newId),
        storage.getCanvasBasePath(newId),
      ]);

      if (metadata) {
        activeCanvas.value = { metadata };
      }
      canvasBasePath.value = basePath;
      logger.info("Canvas 路径已加载", { basePath });
      refreshPreview();
    } else {
      activeCanvas.value = null;
      canvasBasePath.value = null;
    }
  },
  { immediate: true },
);

// 监听文件变更通知，自动刷新预览
watch(lastFileChangeTimestamp, () => {
  refreshPreview();
});

function handleConsoleMessage(payload: any) {
  const msg: ConsoleMessage = {
    id: Math.random().toString(36).slice(2),
    level: payload.level,
    args: payload.args,
    timestamp: payload.timestamp,
  };
  consoleMessages.value.push(msg);
  if (consoleMessages.value.length > 100) {
    consoleMessages.value.shift();
  }
}

async function openInVSCode() {
  if (!activeCanvasId.value) return;
  const basePath = canvasBasePath.value || (await storage.getCanvasBasePath(activeCanvasId.value));
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
  background-color: var(--container-bg);

  .preview-container {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
}
</style>
