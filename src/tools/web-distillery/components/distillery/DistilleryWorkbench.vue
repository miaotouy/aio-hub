<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { useWebDistilleryStore } from "../../stores/store";
import { extractLocalContent } from "../../core/engines/local";
import { iframeBridge } from "../../core/iframe-bridge";
import { customMessage } from "@/utils/customMessage";
import { useSendToChat } from "@/composables/useSendToChat";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { readTextFile } from "@tauri-apps/plugin-fs";
import InfoCard from "@/components/common/InfoCard.vue";
import DropZone from "@/components/common/DropZone.vue";
import { fetchPage } from "../../service";
import {
  fetchEngineCatalog,
  getFetchEngineName,
  type FetchEngineId,
} from "../../core/engines/catalog";

// 组件导入
import BrowserToolbar from "./BrowserToolbar.vue";
import PreviewPanel from "./PreviewPanel.vue";

const errorHandler = createModuleErrorHandler("web-distillery/workbench");
const logger = createModuleLogger("web-distillery/workbench");
const { sendToChat } = useSendToChat();
const store = useWebDistilleryStore();

// 状态管理
const currentUrl = computed({
  get: () => store.url,
  set: (url: string) => store.setUrl(url),
});
const isLoading = ref(false);
const errorMsg = ref<string | null>(null);
const showTextInput = ref(false);
const pastedText = ref("");
const pastedFormat = ref<"auto" | "html" | "md" | "txt">("auto");
const localContent = ref<{
  content: string;
  fileName: string;
  url: string;
} | null>(null);

const activeMode = computed(() => {
  return store.result?.mode === "interactive"
    ? "smart"
    : (store.result?.mode ?? store.config.defaultMode);
});

const qualityPercent = computed(() =>
  Math.round((store.result?.quality ?? 0) * 100)
);
const qualityStatus = computed(() => {
  const q = store.result?.quality ?? 0;
  if (q >= 0.75) return "success";
  if (q >= 0.45) return "warning";
  return "exception";
});

onUnmounted(async () => {
  try {
    await iframeBridge.destroy();
  } catch (err) {
    logger.debug("Cleanup on unmount failed", err);
  }
});

async function handleFetch(mode: FetchEngineId) {
  const url = currentUrl.value.trim();
  if (!url) {
    customMessage.warning("请输入目标 URL");
    return;
  }

  if (localContent.value && url === localContent.value.url) {
    await handleFileUpload(localContent.value);
    return;
  }

  logger.info("Fetch triggered", { url, mode });
  isLoading.value = true;
  errorMsg.value = null;
  store.setLoading(true);

  try {
    // 处理本地路径 (Windows: C:\... 或 Unix: /...)
    const isLocalPath =
      /^[a-zA-Z]:[\\/]/.test(url) ||
      url.startsWith("/") ||
      url.startsWith("file://");
    if (isLocalPath) {
      const path = url.startsWith("file://") ? url.slice(7) : url;
      await handleFileDrop([path]);
      return;
    }

    const result = await fetchPage({ url, engine: mode });
    store.setResult(result);
    customMessage.success("蒸馏完成");
  } catch (err: any) {
    errorHandler.error(err, "操作失败", { url, mode });
    errorMsg.value = err?.message || "未知错误";
    store.setError(errorMsg.value || "未知错误");
  } finally {
    isLoading.value = false;
    store.setLoading(false);
  }
}

async function handleRefresh() {
  if (currentUrl.value) await handleFetch(activeMode.value);
}

async function handlePastedContent() {
  if (!pastedText.value.trim() || isLoading.value) return;
  const format =
    pastedFormat.value === "auto"
      ? /^\s*<(?:!doctype\b|[a-z][\w:-]*\b[^>]*>)/i.test(pastedText.value)
        ? "html"
        : "md"
      : pastedFormat.value;
  const success = await handleFileUpload({
    content: pastedText.value,
    fileName: `clipboard.${format}`,
  });
  if (success) showTextInput.value = false;
}

async function handleFileUpload(payload: {
  content: string;
  fileName: string;
}) {
  logger.info("File upload triggered", { fileName: payload.fileName });
  isLoading.value = true;
  errorMsg.value = null;
  store.setLoading(true);

  try {
    const result = await extractLocalContent(
      payload.content,
      payload.fileName,
      {
        format: store.config.defaultFormat,
        cleanMode: store.config.defaultCleanMode,
      }
    );
    localContent.value = { ...payload, url: result.url };
    store.setResult(result);
    store.setUrl(result.url);
    customMessage.success("内容处理完成");
    return true;
  } catch (err: any) {
    errorHandler.error(err, "内容处理失败", { fileName: payload.fileName });
    errorMsg.value = err?.message || "未知错误";
    store.setError(errorMsg.value || "未知错误");
    return false;
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
      :active-mode="activeMode"
      @fetch="handleFetch"
      @refresh="handleRefresh"
      @upload="handleFileUpload"
      @paste-text="showTextInput = !showTextInput"
    />

    <section
      v-if="showTextInput"
      class="text-input-panel"
      aria-label="粘贴文本处理"
    >
      <div class="text-input-controls">
        <span>粘贴内容</span>
        <el-select
          v-model="pastedFormat"
          aria-label="输入格式"
          class="text-format-select"
        >
          <el-option label="自动识别" value="auto" />
          <el-option label="HTML" value="html" />
          <el-option label="Markdown" value="md" />
          <el-option label="纯文本" value="txt" />
        </el-select>
        <el-button :disabled="isLoading" @click="showTextInput = false"
          >收起</el-button
        >
        <el-button
          type="primary"
          :loading="isLoading"
          :disabled="!pastedText.trim()"
          @click="handlePastedContent"
          >处理文本</el-button
        >
      </div>
      <el-input
        v-model="pastedText"
        type="textarea"
        :rows="6"
        resize="vertical"
        aria-label="待处理文本"
        placeholder="在此粘贴 HTML、Markdown 或纯文本"
        :disabled="isLoading"
        @keydown.ctrl.enter.prevent="handlePastedContent"
        @keydown.meta.enter.prevent="handlePastedContent"
      />
    </section>

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

      <!-- 结果预览区 -->
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
                <span class="quality-label">
                  模式:
                  {{ getFetchEngineName(store.result.mode) }}
                </span>
                <el-tag
                  v-if="store.result.quality !== null"
                  size="small"
                  :type="
                    qualityStatus === 'exception' ? 'danger' : qualityStatus
                  "
                  >{{ qualityPercent }}%</el-tag
                >
              </div>
              <el-progress
                v-if="store.result.quality !== null"
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
                <span class="info-value">{{
                  store.result.contentLength?.toLocaleString()
                }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">格式</span>
                <span class="info-value">{{
                  store.result.format?.toUpperCase()
                }}</span>
              </div>
              <div v-if="store.result.metadata?.language" class="info-item">
                <span class="info-label">语言</span>
                <span class="info-value">{{
                  store.result.metadata.language
                }}</span>
              </div>
              <div v-if="store.result.recipeName" class="info-item">
                <span class="info-label">匹配配方</span>
                <el-tag size="small" effect="plain" type="primary">{{
                  store.result.recipeName
                }}</el-tag>
              </div>
              <div class="info-item">
                <span class="info-label">提取时间</span>
                <span class="info-value">{{
                  new Date(store.result.fetchedAt).toLocaleTimeString()
                }}</span>
              </div>
            </div>
          </InfoCard>

          <InfoCard v-if="store.result.warnings?.length">
            <template #header>
              <div class="section-title warning">提取警告</div>
            </template>
            <div class="warning-box">
              <div
                v-for="(w, i) in store.result.warnings"
                :key="i"
                class="warning-item"
              >
                {{ w }}
              </div>
            </div>
          </InfoCard>
        </template>

        <!-- 空状态提示 -->
        <InfoCard v-if="!store.result">
          <template #header>
            <div class="section-title">使用提示</div>
          </template>
          <div class="empty-hint">
            <p>在上方输入 URL 并选择提取模式：</p>
            <ul>
              <li v-for="engine in fetchEngineCatalog" :key="engine.id">
                <strong>{{ engine.name }}</strong
                >: {{ engine.description }}
              </li>
            </ul>
          </div>
        </InfoCard>
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

.text-input-panel {
  flex-shrink: 0;
  padding: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
}

.text-input-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--text-color);
}

.text-input-controls > span {
  flex: 1;
}

.text-format-select {
  width: 140px;
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

/* 右侧边栏 */
.side-panel {
  width: 260px;
  border-left: var(--border-width) solid var(--border-color);
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
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
}

.quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

/* Jina 模式专属 Badge（中性偏蓝主题色） */
.mode-badge-jina {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--el-color-primary);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  border: 1px solid
    rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 4px;
  padding: 0 5px;
  line-height: 1.6;
  vertical-align: middle;
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
