<script setup lang="ts">
import { ref, markRaw, computed } from "vue";
import { GlassWater } from "lucide-vue-next";
import { useWebDistilleryStore } from "./stores/store";
import { quickFetch, smartExtract } from "./actions";
import { webviewBridge } from "./core/webview-bridge";
import { customMessage } from "@/utils/customMessage";
import { useNotification } from "@/composables/useNotification";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import ComponentHeader from "@/components/ComponentHeader.vue";

const errorHandler = createModuleErrorHandler("web-distillery/ui");
const logger = createModuleLogger("web-distillery/ui");
const notify = useNotification();

import BrowserToolbar from "./components/BrowserToolbar.vue";
import PreviewPanel from "./components/PreviewPanel.vue";
import ApiSniffer from "./components/ApiSniffer.vue";
import CookieLab from "./components/CookieLab.vue";

const store = useWebDistilleryStore();

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
      if (!result) return; // Error handled by wrapAsync

      store.setResult(result);
      if (result.quality < 0.4) {
        notify.warning("提取质量偏低", "页面可能需要 JS 渲染，建议切换到 Level 1 智能提取。", {
          source: "web-distillery",
        });
      }
    } else {
      await webviewBridge.init();
      const result = await smartExtract({ url, format: "markdown", waitTimeout: 12000 });
      if (!result) return; // Error handled by wrapAsync

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
  <div class="web-distillery">
    <ComponentHeader title="网页蒸馏室" :icon="markRaw(GlassWater)" />

    <div class="distillery-body">
      <!-- 顶部工具栏 -->
      <BrowserToolbar
        v-model="currentUrl"
        :loading="isLoading"
        :active-level="activeLevel"
        @fetch="handleFetch"
        @refresh="handleRefresh"
        @open-interactive="openInteractive"
      />

      <!-- 主内容区 -->
      <div class="distillery-main">
        <!-- 左侧信息侧边栏 -->
        <aside class="info-sidebar">
          <!-- 层级状态 -->
          <div class="sidebar-section">
            <div class="section-label">蒸馏层级</div>
            <div class="status-card">
              <div class="status-card-main">
                <span class="status-level">
                  {{ store.result ? `Level ${store.result.level}` : "—" }}
                </span>
                <el-tag v-if="store.result" size="small" :type="qualityStatus"> {{ qualityPercent }}% </el-tag>
              </div>
              <div class="status-card-desc">
                {{
                  store.result
                    ? store.result.level === 0
                      ? "快速 HTTP 请求"
                      : "Webview 渲染提取"
                    : "输入 URL 开始蒸馏"
                }}
              </div>
            </div>
          </div>

          <!-- 质量进度条 -->
          <div v-if="store.result" class="sidebar-section">
            <div class="section-label">提取质量</div>
            <el-progress :percentage="qualityPercent" :status="qualityStatus" :stroke-width="6" :show-text="false" />
          </div>

          <!-- 页面信息列表 -->
          <div v-if="store.result" class="sidebar-section">
            <div class="section-label">页面信息</div>
            <div class="info-list">
              <div class="info-row">
                <span class="info-key">字数</span>
                <span class="info-val">{{ store.result.contentLength?.toLocaleString() }}</span>
              </div>
              <div class="info-row">
                <span class="info-key">格式</span>
                <span class="info-val">{{ store.result.format?.toUpperCase() }}</span>
              </div>
              <div v-if="store.result.metadata?.language" class="info-row">
                <span class="info-key">语言</span>
                <span class="info-val">{{ store.result.metadata.language }}</span>
              </div>
              <div v-if="store.result.metadata?.author" class="info-row">
                <span class="info-key">作者</span>
                <span class="info-val" :title="store.result.metadata.author">
                  {{ store.result.metadata.author }}
                </span>
              </div>
              <div class="info-row">
                <span class="info-key">时间</span>
                <span class="info-val">{{ new Date(store.result.fetchedAt).toLocaleTimeString() }}</span>
              </div>
            </div>
          </div>

          <!-- 发现的 API -->
          <div class="sidebar-section">
            <ApiSniffer />
          </div>

          <div class="sidebar-divider" />

          <!-- Cookie 实验室 -->
          <div class="sidebar-section">
            <CookieLab />
          </div>

          <div class="sidebar-divider" />

          <!-- 警告列表 -->
          <div v-if="store.result?.warnings?.length" class="sidebar-section">
            <div class="section-label warning-label">警告</div>
            <div class="warning-list">
              <div v-for="(w, i) in store.result.warnings" :key="i" class="warning-row">{{ w }}</div>
            </div>
          </div>
        </aside>

        <!-- 右侧预览区 -->
        <main class="preview-main">
          <PreviewPanel :result="store.result" :loading="isLoading" :error="errorMsg" @refresh="handleRefresh" />
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.web-distillery {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.distillery-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.distillery-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 左侧信息侧边栏 */
.info-sidebar {
  width: 210px;
  min-width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  padding: 12px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: var(--sidebar-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.sidebar-section {
  padding-bottom: 12px;
}

.sidebar-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px -10px 12px;
  opacity: 0.6;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-color-light);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.warning-label {
  color: var(--warning-color);
}

/* 状态卡片 */
.status-card {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 10px;
  backdrop-filter: blur(var(--ui-blur));
}
.status-card-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
}
.status-level {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}
.status-card-desc {
  font-size: 11px;
  color: var(--text-color-light);
}

/* 信息列表 */
.info-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.info-key {
  color: var(--text-color-light);
  flex-shrink: 0;
}
.info-val {
  color: var(--text-color);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}

/* API 列表 */
.api-badge {
  margin-left: 4px;
}
.api-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.api-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.api-path {
  color: var(--text-color-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 警告列表 */
.warning-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.warning-row {
  font-size: 11px;
  color: var(--warning-color);
  background: color-mix(in srgb, var(--warning-color) 8%, transparent);
  border-radius: 4px;
  padding: 4px 7px;
  line-height: 1.4;
}

/* 右侧预览主区 */
.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
