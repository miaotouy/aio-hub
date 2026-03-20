<script setup lang="ts">
import { ref, computed, onUnmounted, watch, onMounted } from "vue";
import { useWebDistilleryStore } from "../stores/store";
import { quickFetch, smartExtract, processLocalContent } from "../actions";
import { webviewBridge } from "../core/webview-bridge";
import { customMessage } from "@/utils/customMessage";
import { useSendToChat } from "@/composables/useSendToChat";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Loading } from "@element-plus/icons-vue";
import InfoCard from "@/components/common/InfoCard.vue";
import DropZone from "@/components/common/DropZone.vue";

// 组件导入
import BrowserToolbar from "./BrowserToolbar.vue";
import PreviewPanel from "./PreviewPanel.vue";
import RecipeEditor from "./RecipeEditor.vue";

const errorHandler = createModuleErrorHandler("web-distillery/workbench");
const logger = createModuleLogger("web-distillery/workbench");
const { sendToChat } = useSendToChat();
const store = useWebDistilleryStore();

// 状态管理
const currentUrl = ref(store.url);
const isLoading = ref(false);
const errorMsg = ref<string | null>(null);
const webviewPlaceholder = ref<HTMLElement | null>(null);
const isInteractive = computed(() => store.isInteractiveMode);

const activeLevel = computed(() => {
  if (store.isInteractiveMode) return 2;
  return store.result ? (store.result.level as 0 | 1) : 0;
});

const qualityPercent = computed(() => Math.round((store.result?.quality ?? 0) * 100));
const qualityStatus = computed(() => {
  const q = store.result?.quality ?? 0;
  if (q >= 0.75) return "success";
  if (q >= 0.45) return "warning";
  return "exception";
});

// --- Webview 坐标同步逻辑 ---
let resizeObserver: ResizeObserver | null = null;
let syncTimer: any = null;
let pollTimer: any = null;

async function syncWebviewBounds() {
  if (!webviewPlaceholder.value || !store.isInteractiveMode || !store.isWebviewCreated) return;

  try {
    const rect = webviewPlaceholder.value.getBoundingClientRect();
    const mainWindow = getCurrentWebviewWindow();
    const factor = await mainWindow.scaleFactor();

    // 获取主窗口在屏幕上的绝对位置 (物理单位)
    const outerPos = await mainWindow.outerPosition();

    // 计算子窗口在屏幕上的绝对位置 (逻辑单位)
    // 注意：36 是标题栏的高度 (var(--titlebar-height))
    const x = outerPos.x / factor + rect.left;
    const y = outerPos.y / factor + rect.top + 36;

    await webviewBridge.resize(x, y, rect.width, rect.height);
  } catch (err) {
    // 忽略同步过程中的错误（通常是窗口已关闭）
    logger.debug("Sync bounds failed", err);
  }
}

const startSyncing = () => {
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      if (syncTimer) cancelAnimationFrame(syncTimer);
      syncTimer = requestAnimationFrame(() => syncWebviewBounds());
    });
  }
  if (webviewPlaceholder.value) {
    resizeObserver.observe(webviewPlaceholder.value);
  }

  // 增加定时轮询，解决主窗口移动时 ResizeObserver 不触发的问题
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    syncWebviewBounds();
  }, 200);

  syncWebviewBounds();
};

const stopSyncing = async () => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (syncTimer) {
    cancelAnimationFrame(syncTimer);
    syncTimer = null;
  }

  try {
    await webviewBridge.destroy();
  } catch (e) {
    logger.warn("Destroy webview failed on stopSyncing", e);
  } finally {
    store.setWebviewCreated(false);
  }
};

watch(
  () => store.isInteractiveMode,
  (val) => {
    if (val) {
      setTimeout(startSyncing, 100); // 等待 DOM 渲染
      if (currentUrl.value) {
        handleFetch(2);
      }
    } else {
      stopSyncing();
    }
  },
);

onMounted(() => {
  currentUrl.value = store.url;
});

onUnmounted(async () => {
  try {
    await stopSyncing();
  } catch (err) {
    logger.debug("Cleanup on unmount failed", err);
  }
});

async function handleFetch(level: 0 | 1 | 2) {
  const url = currentUrl.value.trim();
  if (!url) {
    customMessage.warning("请输入目标 URL");
    return;
  }

  logger.info("Fetch triggered", { url, level });
  isLoading.value = true;
  errorMsg.value = null;
  store.setLoading(true);

  try {
    // 处理本地路径 (Windows: C:\... 或 Unix: /... 或 file://)
    const isLocalPath = /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith("/") || url.startsWith("file://");
    if (isLocalPath) {
      const path = url.startsWith("file://") ? url.slice(7) : url;
      await handleFileDrop([path]);
      return;
    }

    if (level === 0) {
      logger.info("Executing quickFetch (Level 0)");
      const result = await quickFetch({ url, format: "markdown" });
      if (!result) {
        throw new Error("获取内容失败");
      }

      store.setResult(result);
    } else if (level === 1) {
      logger.info("Executing smartExtract (Level 1)");
      await webviewBridge.init();
      logger.debug("Bridge initialized for smartExtract");
      const result = await smartExtract({ url, format: "markdown", waitTimeout: 12000 });
      if (!result) {
        throw new Error("智能提取失败");
      }

      store.setResult(result);
    } else if (level === 2) {
      // 创建前先尝试销毁旧的，确保幂等
      try {
        await webviewBridge.destroy();
      } catch (e) {
        logger.debug("Pre-destroy failed", e);
      }

      await webviewBridge.init();
      await new Promise((resolve) => setTimeout(resolve, 100)); // 给 DOM 渲染留出时间

      if (!webviewPlaceholder.value) {
        throw new Error("找不到浏览器挂载点");
      }

      const rect = webviewPlaceholder.value.getBoundingClientRect();
      const mainWindow = getCurrentWebviewWindow();
      const factor = await mainWindow.scaleFactor();
      const outerPos = await mainWindow.outerPosition();

      await webviewBridge.createWebview({
        url,
        x: outerPos.x / factor + rect.left,
        y: outerPos.y / factor + rect.top + 36,
        width: rect.width,
        height: rect.height,
      });
    }
    customMessage.success(level === 2 ? "浏览器已就绪" : "蒸馏完成");
  } catch (err: any) {
    errorHandler.error(err, "操作失败", { url, level });
    errorMsg.value = err?.message || "未知错误";
    store.setError(errorMsg.value || "未知错误");

    // 发生错误时强制清理资源
    try {
      await webviewBridge.forceCleanup();
    } catch (cleanupErr) {
      logger.debug("Force cleanup after error failed", cleanupErr);
    }
  } finally {
    isLoading.value = false;
    store.setLoading(false);
  }
}

async function handleRefresh() {
  if (currentUrl.value) await handleFetch(activeLevel.value as any);
}

function openInteractive() {
  store.setInteractiveMode(!store.isInteractiveMode);
}

async function handleFileUpload(payload: { content: string; fileName: string }) {
  logger.info("File upload triggered", { fileName: payload.fileName });
  isLoading.value = true;
  errorMsg.value = null;
  store.setLoading(true);

  try {
    const result = await processLocalContent(payload.content, payload.fileName);
    if (!result) return;

    store.setResult(result);
    store.setUrl(`file://${payload.fileName}`);
    currentUrl.value = `file://${payload.fileName}`;
    customMessage.success("文件处理完成");
  } catch (err: any) {
    errorHandler.error(err, "文件处理失败", { fileName: payload.fileName });
    errorMsg.value = err?.message || "未知错误";
    store.setError(errorMsg.value || "未知错误");
  } finally {
    isLoading.value = false;
    store.setLoading(false);
  }
}

async function handleFileDrop(paths: string[]) {
  if (!paths || paths.length === 0) return;

  const path = paths[0]; // 网页蒸馏通常只处理单个文件
  const fileName = path.split(/[/\\]/).pop() || "local-file.html";

  try {
    isLoading.value = true;
    const content = await readTextFile(path);
    await handleFileUpload({ content, fileName });
  } catch (err: any) {
    errorHandler.error(err, "读取拖入的文件失败", { path });
  } finally {
    isLoading.value = false;
  }
}

function handleSendToChat() {
  if (!store.result?.content) {
    customMessage.warning("没有可发送的内容");
    return;
  }

  const result = store.result;

  // 构建发送内容
  let textToSend = `# 网页内容\n\n`;
  if (result.title) {
    textToSend += `**标题**: ${result.title}\n`;
  }
  if (store.url) {
    textToSend += `**来源**: ${store.url}\n`;
  }
  textToSend += `\n---\n\n${result.content}`;

  sendToChat(textToSend, {
    format: "plain",
    successMessage: "已将网页内容发送到聊天",
  });
}
</script>

<template>
  <div class="workbench-layout">
    <!-- 顶部工具栏 -->
    <BrowserToolbar
      v-model="currentUrl"
      :loading="isLoading"
      :active-level="activeLevel"
      @fetch="handleFetch"
      @refresh="handleRefresh"
      @open-interactive="openInteractive"
      @upload="handleFileUpload"
    />

    <div class="workbench-main">
      <!-- 拖拽上传覆盖层 -->
      <DropZone
        overlay
        hide-content
        show-overlay-on-drag
        :accept="['.html', '.htm']"
        placeholder="拖放 HTML 文件到此处进行蒸馏"
        @drop="handleFileDrop"
      />

      <!-- Level 2: 交互模式双面板 -->
      <template v-if="isInteractive">
        <div class="interactive-container">
          <!-- 左侧：浏览器占位符 -->
          <div ref="webviewPlaceholder" class="webview-viewport">
            <div v-if="isLoading" class="webview-mask">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>正在初始化浏览器...</span>
            </div>
            <div class="webview-tip">
              <h3>独立的交互窗口已叠加在此区域</h3>
              <p>您可以在左侧窗口操作网页，右侧配置规则</p>
            </div>
          </div>

          <!-- 右侧：配方编辑器 -->
          <div class="recipe-panel">
            <RecipeEditor />
          </div>
        </div>
      </template>

      <!-- Level 0/1: 结果预览区 -->
      <template v-else>
        <div class="preview-container">
          <PreviewPanel
            :result="store.result"
            :loading="isLoading"
            :error="errorMsg"
            @refresh="handleRefresh"
            @send-to-chat="handleSendToChat"
          />
        </div>

        <!-- 右侧基础信息侧栏 (始终显示) -->
        <aside class="side-panel">
          <template v-if="store.result">
            <div class="quality-section">
              <div class="section-title">提取质量</div>
              <div class="quality-card">
                <div class="quality-header">
                  <span class="quality-label">Level {{ store.result.level }}</span>
                  <el-tag size="small" :type="qualityStatus">{{ qualityPercent }}%</el-tag>
                </div>
                <el-progress
                  :percentage="qualityPercent"
                  :status="qualityStatus"
                  :stroke-width="4"
                  :show-text="false"
                />
              </div>
            </div>

            <InfoCard>
              <template #header>
                <div class="section-title">页面信息</div>
              </template>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">字数</span>
                  <span class="info-value">{{ store.result.contentLength?.toLocaleString() }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">格式</span>
                  <span class="info-value">{{ store.result.format?.toUpperCase() }}</span>
                </div>
                <div v-if="store.result.metadata?.language" class="info-item">
                  <span class="info-label">语言</span>
                  <span class="info-value">{{ store.result.metadata.language }}</span>
                </div>
                <div v-if="store.result.recipeName" class="info-item">
                  <span class="info-label">匹配配方</span>
                  <el-tag size="small" effect="plain" type="primary">{{ store.result.recipeName }}</el-tag>
                </div>
                <div class="info-item">
                  <span class="info-label">提取时间</span>
                  <span class="info-value">{{ new Date(store.result.fetchedAt).toLocaleTimeString() }}</span>
                </div>
              </div>
            </InfoCard>

            <InfoCard v-if="store.result.warnings?.length">
              <template #header>
                <div class="section-title warning">提取警告</div>
              </template>
              <div class="warning-box">
                <div v-for="(w, i) in store.result.warnings" :key="i" class="warning-item">{{ w }}</div>
              </div>
            </InfoCard>
          </template>

          <!-- 空状态提示 -->
          <InfoCard v-if="!store.result">
            <template #header>
              <div class="section-title">使用提示</div>
            </template>
            <div class="empty-hint">
              <p>在上方输入 URL 并选择提取级别：</p>
              <ul>
                <li><strong>Level 0</strong>: 快速提取</li>
                <li><strong>Level 1</strong>: 智能提取</li>
                <li><strong>Level 2</strong>: 交互模式</li>
              </ul>
            </div>
          </InfoCard>
        </aside>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 工作台布局 */
.workbench-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.workbench-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
  backdrop-filter: blur(var(--ui-blur));
}

.preview-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Level 2 交互模式容器 */
.interactive-container {
  flex: 1;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-color-page);
}

.webview-viewport {
  flex: 1;
  min-width: 400px;
  background-color: #000;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--border-color);
}

.webview-mask {
  position: absolute;
  inset: 0;
  z-index: 10;
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
}

.webview-tip {
  text-align: center;
  color: #666;
  pointer-events: none;
}

.webview-tip h3 {
  margin-bottom: 8px;
  color: #888;
}

.recipe-panel {
  width: 400px;
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* 右侧边栏 */
.side-panel {
  width: 260px;
  border-left: 1px solid var(--border-color);
  background-color: var(--sidebar-bg);
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.section-title.warning {
  color: var(--warning-color);
}

/* 质量区块 */
.quality-section {
  display: flex;
  flex-direction: column;
}

.quality-card {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
}

.quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.quality-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

/* 信息网格 */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.info-label {
  color: var(--text-color-light);
}

.info-value {
  color: var(--text-color);
}

/* 警告框 */
.warning-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.warning-item {
  font-size: 11px;
  color: var(--warning-color);
  background: color-mix(in srgb, var(--warning-color) 8%, transparent);
  border-radius: 4px;
  padding: 6px 10px;
  line-height: 1.4;
}
</style>
