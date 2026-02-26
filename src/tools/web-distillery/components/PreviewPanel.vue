<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, Download, RotateCw, FileText, Code2, AlertTriangle, GlassWater } from "lucide-vue-next";
import type { FetchResult } from "../types";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("web-distillery/preview");

interface Props {
  result: FetchResult | null;
  loading?: boolean;
  error?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
});

const emit = defineEmits<{ refresh: [] }>();

type ViewMode = "preview" | "raw";
const viewMode = ref<ViewMode>("preview");

const qualityType = computed(() => {
  const q = props.result?.quality ?? 0;
  if (q >= 0.75) return "success";
  if (q >= 0.45) return "warning";
  return "danger";
});

/** 简易 Markdown → HTML 渲染（用于预览） */
const formattedContent = computed(() => {
  if (!props.result?.content) return "";
  let html = props.result.content
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^---$/gm, "<hr>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return `<div class="md-body"><p>${html}</p></div>`;
});

async function copyContent() {
  if (!props.result?.content) return;
  try {
    await navigator.clipboard.writeText(props.result.content);
    customMessage.success("已复制到剪贴板");
  } catch (err: any) {
    errorHandler.error(err, "复制失败");
  }
}

function downloadContent() {
  if (!props.result?.content) return;
  const title = (props.result.title || "distilled").replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
  const blob = new Blob([props.result.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.md`;
  a.click();
  URL.revokeObjectURL(url);
  customMessage.success("已下载 Markdown 文件");
}
</script>

<template>
  <div class="preview-panel">
    <!-- 加载中 -->
    <div v-if="loading && !result" class="panel-state">
      <el-icon :size="40" class="state-icon loading-icon">
        <i-ep-loading />
      </el-icon>
      <p class="state-text">正在蒸馏中…</p>
    </div>

    <!-- 错误 -->
    <div v-else-if="error && !result" class="panel-state">
      <AlertTriangle :size="40" class="state-icon error-icon" />
      <p class="state-text">{{ error }}</p>
      <el-button @click="emit('refresh')">重试</el-button>
    </div>

    <!-- 空态 -->
    <div v-else-if="!result" class="panel-state">
      <GlassWater :size="48" class="state-icon empty-icon" />
      <h3 class="state-title">等待蒸馏</h3>
      <p class="state-text">在上方输入 URL，选择层级，点击蒸馏</p>
    </div>

    <!-- 结果 -->
    <template v-else>
      <!-- 结果头部 -->
      <div class="result-header">
        <div class="header-left">
          <div class="result-title" :title="result.title">{{ result.title || "(无标题)" }}</div>
          <div class="meta-tags">
            <el-tag size="small">Level {{ result.level }}</el-tag>
            <el-tag :type="qualityType" size="small">
              {{ qualityType === "success" ? "高质量" : qualityType === "warning" ? "中等" : "低质量" }}
              {{ Math.round((result.quality ?? 0) * 100) }}%
            </el-tag>
            <el-tag type="info" size="small">{{ result.format?.toUpperCase() }}</el-tag>
            <el-tag v-if="result.contentLength" type="info" size="small">
              {{ (result.contentLength / 1000).toFixed(1) }}k 字
            </el-tag>
          </div>
        </div>
        <div class="header-right">
          <!-- 视图切换 -->
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="preview">
              <FileText :size="13" />
            </el-radio-button>
            <el-radio-button value="raw">
              <Code2 :size="13" />
            </el-radio-button>
          </el-radio-group>
          <!-- 操作按钮 -->
          <el-button-group>
            <el-button size="small" title="复制 Markdown" @click="copyContent">
              <Copy :size="13" />
            </el-button>
            <el-button size="small" title="下载 .md 文件" @click="downloadContent">
              <Download :size="13" />
            </el-button>
            <el-button size="small" title="重新蒸馏" :disabled="loading" @click="emit('refresh')">
              <RotateCw :size="13" :class="{ spin: loading }" />
            </el-button>
          </el-button-group>
        </div>
      </div>

      <!-- 警告条 -->
      <el-alert
        v-if="result.warnings?.length"
        :title="result.warnings.join(' · ')"
        type="warning"
        :closable="false"
        show-icon
        class="warnings-alert"
      />

      <!-- 内容区 -->
      <div class="content-area">
        <div v-if="viewMode === 'preview'" class="markdown-render" v-html="formattedContent" />
        <pre v-else class="raw-view">{{ result.content }}</pre>
      </div>

      <!-- 元数据 -->
      <details v-if="result.metadata" class="metadata-section">
        <summary>页面元数据</summary>
        <div class="metadata-grid">
          <template v-for="(val, key) in result.metadata" :key="key">
            <span class="meta-key">{{ key }}</span>
            <span class="meta-val">{{ val }}</span>
          </template>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg-color);
}

/* 状态占位 */
.panel-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-color-light);
}

.state-icon {
  opacity: 0.5;
}
.loading-icon {
  animation: spin 1s linear infinite;
  color: var(--primary-color);
  opacity: 1;
}
.error-icon {
  color: var(--error-color);
  opacity: 1;
}
.empty-icon {
  color: var(--text-color-light);
}

.state-title {
  margin: 0;
  font-size: 16px;
  color: var(--text-color);
}
.state-text {
  margin: 0;
  font-size: 13px;
  text-align: center;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.spin {
  animation: spin 0.8s linear infinite;
}

/* 结果头部 */
.result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
}

.header-left {
  flex: 1;
  min-width: 0;
}
.result-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 6px;
}
.meta-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 警告 */
.warnings-alert {
  flex-shrink: 0;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
}

/* 内容区 */
.content-area {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

/* Markdown 渲染 */
.markdown-render :deep(.md-body) {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-color);
  max-width: 100%;
  overflow-wrap: break-word;
}
.markdown-render :deep(h1) {
  font-size: 1.6em;
  margin: 1em 0 0.5em;
  font-weight: 700;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
  color: var(--text-color);
}
.markdown-render :deep(h2) {
  font-size: 1.35em;
  margin: 0.9em 0 0.4em;
  font-weight: 600;
  color: var(--text-color);
}
.markdown-render :deep(h3) {
  font-size: 1.15em;
  margin: 0.7em 0 0.3em;
  font-weight: 600;
  color: var(--text-color);
}
.markdown-render :deep(h4) {
  font-size: 1em;
  margin: 0.5em 0 0.25em;
  font-weight: 600;
  color: var(--text-color);
}
.markdown-render :deep(a) {
  color: var(--primary-color);
  text-decoration: none;
}
.markdown-render :deep(a:hover) {
  text-decoration: underline;
}
.markdown-render :deep(code) {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  padding: 2px 5px;
  border-radius: 3px;
  font-family: var(--el-font-family-mono, monospace);
  font-size: 0.88em;
  color: var(--primary-color);
}
.markdown-render :deep(strong) {
  font-weight: 700;
  color: var(--text-color);
}
.markdown-render :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 1.2em 0;
}
.markdown-render :deep(p) {
  margin: 0.7em 0;
}

/* 原始视图 */
.raw-view {
  font-family: var(--el-font-family-mono, "JetBrains Mono", monospace);
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

/* 元数据 */
.metadata-section {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
}
.metadata-section summary {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-color-light);
  cursor: pointer;
  user-select: none;
  list-style: none;
}
.metadata-section summary:hover {
  color: var(--text-color);
}
.metadata-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 16px;
  padding: 6px 16px 12px;
  font-size: 12px;
}
.meta-key {
  color: var(--text-color-light);
  font-weight: 500;
}
.meta-val {
  color: var(--text-color);
  word-break: break-all;
}
</style>
