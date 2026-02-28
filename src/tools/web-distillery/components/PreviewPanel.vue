<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Copy, Download, RotateCw, FileText, Code2, Globe, AlertTriangle, GlassWater } from "lucide-vue-next";
import type { FetchResult } from "../types";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";

const errorHandler = createModuleErrorHandler("web-distillery/preview");
const logger = createModuleLogger("web-distillery/preview");

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

type ViewMode = "preview" | "raw" | "source";
const viewMode = ref<ViewMode>("preview");

/** 是否有 DOM 快照（Level 0/1 都支持） */
const hasDomSnapshot = computed(() => !!props.result?.domSnapshot);

/** 格式化后的 HTML 源码 */
const formattedHtml = ref<string>("");
const isFormattingHtml = ref(false);

async function formatHtml(raw: string): Promise<string> {
  try {
    // 懒加载 prettier standalone，避免影响初始包体积
    const [prettier, htmlPlugin] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/html"),
    ]);
    return await prettier.format(raw, {
      parser: "html",
      plugins: [htmlPlugin],
      printWidth: 120,
      tabWidth: 2,
      htmlWhitespaceSensitivity: "ignore",
    });
  } catch (err) {
    logger.warn("HTML 格式化失败，将显示原始内容", err instanceof Error ? err : new Error(String(err)));
    return raw;
  }
}

// 当切换到 source 模式或 domSnapshot 变化时，触发格式化
watch(
  [viewMode, () => props.result?.domSnapshot],
  async ([mode, snapshot]) => {
    if (mode === "source" && snapshot) {
      isFormattingHtml.value = true;
      formattedHtml.value = await formatHtml(snapshot);
      isFormattingHtml.value = false;
    }
  },
  { immediate: true },
);

// 当 DOM 快照不可用时，自动切换回预览模式
watch(hasDomSnapshot, (hasSnapshot) => {
  if (!hasSnapshot && viewMode.value === "source") {
    viewMode.value = "preview";
  }
});

const qualityType = computed(() => {
  const q = props.result?.quality ?? 0;
  if (q >= 0.75) return "success";
  if (q >= 0.45) return "warning";
  return "danger";
});

async function copyContent() {
  const text = viewMode.value === "source" ? formattedHtml.value || props.result?.domSnapshot : props.result?.content;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    customMessage.success("已复制到剪贴板");
  } catch (err: any) {
    errorHandler.error(err, "复制失败");
  }
}

function downloadContent() {
  const isSource = viewMode.value === "source";
  const text = isSource ? props.result?.domSnapshot : props.result?.content;
  if (!text) return;

  const title = (props.result!.title || "distilled").replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
  const ext = isSource ? "html" : "md";
  const mimeType = isSource ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8";
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  customMessage.success(isSource ? "已下载 HTML 源码" : "已下载 Markdown 文件");
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
            <el-tooltip content="预览" placement="top" :show-after="500">
              <el-radio-button value="preview">
                <FileText :size="13" />
              </el-radio-button>
            </el-tooltip>
            <el-tooltip content="Markdown 源码" placement="top" :show-after="500">
              <el-radio-button value="raw">
                <Code2 :size="13" />
              </el-radio-button>
            </el-tooltip>
            <el-tooltip content="页面源码" placement="top" :show-after="500">
              <el-radio-button value="source" :disabled="!hasDomSnapshot">
                <Globe :size="13" />
              </el-radio-button>
            </el-tooltip>
          </el-radio-group>
          <!-- 操作按钮 -->
          <el-button-group>
            <el-button size="small" title="复制内容" @click="copyContent">
              <Copy :size="13" />
            </el-button>
            <el-button size="small" title="下载文件" @click="downloadContent">
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
        <!-- Markdown 富文本预览 -->
        <RichTextRenderer
          v-if="viewMode === 'preview'"
          :content="result.content || ''"
          :version="RendererVersion.V2_CUSTOM_PARSER"
          :enable-enter-animation="false"
          class="markdown-preview"
        />
        <!-- Markdown 原始代码视图 -->
        <RichCodeEditor
          v-else-if="viewMode === 'raw'"
          :model-value="result.content || ''"
          language="markdown"
          :read-only="true"
          :line-numbers="false"
          editor-type="codemirror"
          class="code-view"
        />
        <!-- HTML 源码视图 -->
        <div v-else class="source-view-wrapper">
          <div v-if="isFormattingHtml" class="formatting-indicator">
            <el-icon class="formatting-spin"><i-ep-loading /></el-icon>
            <span>正在美化…</span>
          </div>
          <RichCodeEditor
            v-else
            :model-value="formattedHtml || result.domSnapshot || ''"
            language="html"
            :read-only="true"
            :line-numbers="true"
            editor-type="codemirror"
            class="code-view"
          />
        </div>
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Markdown 预览 */
.markdown-preview {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;
}

/* HTML 源码视图包装层 */
.source-view-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 格式化中提示 */
.formatting-indicator {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-light);
}

.formatting-spin {
  animation: spin 1s linear infinite;
  color: var(--el-color-primary);
}

/* 代码编辑器视图 */
.code-view {
  flex: 1;
  min-height: 0;
  border: none;
  border-radius: 0;
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
