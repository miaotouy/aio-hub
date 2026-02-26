<script setup lang="ts">
import { ref, computed } from "vue";
import { useWebDistilleryStore } from "../stores/store";
import { quickFetch, smartExtract } from "../actions";
import { webviewBridge } from "../core/webview-bridge";
import { customMessage } from "@/utils/customMessage";
import { useNotification } from "@/composables/useNotification";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

// 组件导入
import BrowserToolbar from "./BrowserToolbar.vue";
import PreviewPanel from "./PreviewPanel.vue";

const errorHandler = createModuleErrorHandler("web-distillery/workbench");
const logger = createModuleLogger("web-distillery/workbench");
const notify = useNotification();
const store = useWebDistilleryStore();

// 状态管理
const currentUrl = ref("");
const isLoading = ref(false);
const errorMsg = ref<string | null>(null);

const activeLevel = computed(() => (store.result ? (store.result.level as 0 | 1) : 0));

const qualityPercent = computed(() => Math.round((store.result?.quality ?? 0) * 100));
const qualityStatus = computed(() => {
  const q = store.result?.quality ?? 0;
  if (q >= 0.75) return "success";
  if (q >= 0.45) return "warning";
  return "exception";
});

async function handleFetch(level: 0 | 1) {
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
    if (level === 0) {
      const result = await quickFetch({ url, format: "markdown" });
      if (!result) return;

      store.setResult(result);
      if (result.quality < 0.4) {
        notify.warning("提取质量偏低", "页面可能需要 JS 渲染，建议切换到 Level 1 智能提取。", {
          source: "web-distillery",
        });
      }
    } else {
      await webviewBridge.init();
      const result = await smartExtract({ url, format: "markdown", waitTimeout: 12000 });
      if (!result) return;

      store.setResult(result as any);
    }
    customMessage.success("蒸馏完成");
  } catch (err: any) {
    errorHandler.error(err, "蒸馏失败", { url, level });
    errorMsg.value = err?.message || "未知错误";
    store.setError(errorMsg.value || "未知错误");
  } finally {
    isLoading.value = false;
    store.setLoading(false);
  }
}

async function handleRefresh() {
  if (currentUrl.value) await handleFetch(activeLevel.value);
}

function openInteractive() {
  customMessage.info("交互式模式 (Level 2) 即将推出");
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
    />

    <div class="workbench-main">
      <!-- 结果预览区 -->
      <div class="preview-container">
        <PreviewPanel :result="store.result" :loading="isLoading" :error="errorMsg" @refresh="handleRefresh" />
      </div>

      <!-- 右侧基础信息侧栏 -->
      <aside v-if="store.result" class="side-panel">
        <div class="panel-section">
          <div class="section-title">提取质量</div>
          <div class="quality-card">
            <div class="quality-header">
              <span class="quality-label">Level {{ store.result.level }}</span>
              <el-tag size="small" :type="qualityStatus">{{ qualityPercent }}%</el-tag>
            </div>
            <el-progress :percentage="qualityPercent" :status="qualityStatus" :stroke-width="4" :show-text="false" />
          </div>
        </div>

        <div class="panel-section">
          <div class="section-title">页面信息</div>
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
            <div class="info-item">
              <span class="info-label">提取时间</span>
              <span class="info-value">{{ new Date(store.result.fetchedAt).toLocaleTimeString() }}</span>
            </div>
          </div>
        </div>

        <div v-if="store.result.warnings?.length" class="panel-section">
          <div class="section-title warning">提取警告</div>
          <div class="warning-box">
            <div v-for="(w, i) in store.result.warnings" :key="i" class="warning-item">{{ w }}</div>
          </div>
        </div>
      </aside>
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
}

.preview-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 右侧边栏 */
.side-panel {
  width: 240px;
  border-left: 1px solid var(--border-color);
  background-color: var(--sidebar-bg);
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-title.warning {
  color: var(--warning-color);
}

/* 质量卡片 */
.quality-card {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 10px;
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
