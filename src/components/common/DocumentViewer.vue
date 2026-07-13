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
import { defineAsyncComponent, ref, computed, watch, watchEffect } from "vue";
import { useDocumentViewer } from "@/composables/useDocumentViewer";
import { createModuleLogger } from "@/utils/logger";
import RichCodeEditor from "./RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import HtmlInteractiveViewer from "@/tools/rich-text-renderer/components/HtmlInteractiveViewer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import {
  ElSkeleton,
  ElAlert,
  ElButton,
  ElButtonGroup,
  ElTooltip,
  ElRadioGroup,
  ElRadioButton,
} from "element-plus";
import { useClipboard } from "@vueuse/core";
import { Copy, Download, Book, Code } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";

// --- 属性定义 ---
interface DocumentViewerProps {
  content?: string | Uint8Array;
  filePath?: string;
  fileName?: string;
  fileTypeHint?: string;
  editorType?: "codemirror" | "monaco";
  showEngineSwitch?: boolean;
}
const props = withDefaults(defineProps<DocumentViewerProps>(), {
  editorType: "codemirror",
  showEngineSwitch: false,
});

const logger = createModuleLogger("DocumentViewer");
const PdfViewer = defineAsyncComponent(() => import("./PdfViewer.vue"));

watchEffect(() => {
  logger.debug("Props received/updated:", {
    fileName: props.fileName,
    fileTypeHint: props.fileTypeHint,
    filePath: props.filePath,
    contentExists: !!props.content,
  });
});

// --- 核心逻辑 (使用 useDocumentViewer) ---
const {
  isLoading,
  error,
  rawContent,
  decodedContent,
  mimeType,
  language,
  isTextContent,
  isMarkdown,
  isHtml,
  isPdf,
  isDocx,
  isRenderableHtml,
} = useDocumentViewer(props);
// --- 视图逻辑 ---
const viewMode = ref<"source" | "preview">("preview");
const currentEditorType = ref(props.editorType);

// 提取 HTML 标题
const htmlTitle = computed(() => {
  if (!isHtml.value || !decodedContent.value) return null;
  const titleMatch = decodedContent.value.match(/<title[^>]*>(.*?)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : null;
});

// HTML 默认显示源码
watch(
  isHtml,
  (newIsHtml) => {
    if (newIsHtml) {
      viewMode.value = "source";
    }
  },
  { immediate: true }
);

watch(
  () => props.editorType,
  (newType) => {
    if (newType) {
      currentEditorType.value = newType;
    }
  }
);
const showToolbar = computed(
  () => !isLoading.value && !error.value && decodedContent.value && !isPdf.value
);

const canPreview = computed(
  () =>
    isMarkdown.value || isRenderableHtml.value || isPdf.value || isDocx.value
);

const editorLanguage = computed(() => {
  if (viewMode.value === "source") {
    if (isMarkdown.value) return "markdown";
    if (isHtml.value || isDocx.value) return "html";
  }
  return language.value || "plaintext";
});

// --- 工具栏逻辑 (来自 DocumentViewerToolbar.vue) ---
const { copy } = useClipboard();

function handleCopy() {
  if (!decodedContent.value) return;
  copy(decodedContent.value);
  customMessage.success("已复制到剪贴板");
}

function handleDownload() {
  try {
    if (!decodedContent.value) return;
    const blob = new Blob([decodedContent.value], {
      type: mimeType.value || "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = props.fileName || "下载文件.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("下载文件失败:", error);
    customMessage.error("下载文件失败");
  }
}

function toggleViewMode() {
  viewMode.value = viewMode.value === "preview" ? "source" : "preview";
}
</script>

<template>
  <div class="document-viewer">
    <!-- 工具栏模板 -->
    <div v-if="showToolbar" class="document-viewer-toolbar">
      <div class="actions-left">
        <span v-if="fileName" class="file-name">{{ fileName }}</span>
        <span v-if="htmlTitle" class="html-title">
          <span class="title-separator">|</span>
          <span class="title-text">{{ htmlTitle }}</span>
        </span>
      </div>
      <div class="actions-right">
        <el-radio-group
          v-if="props.showEngineSwitch"
          v-model="currentEditorType"
          size="small"
        >
          <el-tooltip content="CodeMirror 引擎 (兼容性好, 启动快)">
            <el-radio-button value="codemirror">CodeMirror</el-radio-button>
          </el-tooltip>
          <el-tooltip content="Monaco 引擎 (功能更强, 来自 VS Code)">
            <el-radio-button value="monaco">Monaco</el-radio-button>
          </el-tooltip>
        </el-radio-group>

        <el-button-group>
          <el-tooltip v-if="canPreview" content="切换视图">
            <el-button
              :icon="viewMode === 'preview' ? Code : Book"
              text
              @click="toggleViewMode"
            />
          </el-tooltip>
          <el-tooltip content="复制内容">
            <el-button :icon="Copy" text @click="handleCopy" />
          </el-tooltip>
          <el-tooltip content="下载文件">
            <el-button :icon="Download" text @click="handleDownload" />
          </el-tooltip>
        </el-button-group>
      </div>
    </div>

    <!-- 内容区域模板 -->
    <div class="content-area">
      <div v-if="isLoading" class="loading-state">
        <el-skeleton :rows="5" animated />
      </div>

      <el-alert
        v-else-if="error"
        :title="`加载文档失败: ${error}`"
        type="error"
        :closable="false"
        show-icon
      />

      <div
        v-else-if="!decodedContent && !isTextContent && !isPdf && !isDocx"
        class="binary-placeholder"
      >
        <el-alert
          title="不支持预览的二进制文件"
          :description="`MIME 类型: ${mimeType || '未知'}`"
          type="info"
          :closable="false"
          show-icon
        />
      </div>

      <RichTextRenderer
        v-else-if="isMarkdown && viewMode === 'preview'"
        :content="decodedContent || undefined"
        :version="RendererVersion.V2_CUSTOM_PARSER"
        class="markdown-preview"
      />

      <PdfViewer
        v-else-if="isPdf && viewMode === 'preview'"
        :content="rawContent || undefined"
        :file-name="fileName"
        class="pdf-preview-component"
      />

      <HtmlInteractiveViewer
        v-else-if="isRenderableHtml && viewMode === 'preview'"
        :content="decodedContent || ''"
        :show-toolbar="false"
        :bordered="false"
        :immediate="true"
        class="html-preview-component"
      />

      <div
        v-else-if="isDocx && viewMode === 'preview'"
        class="docx-preview-component"
        v-html="decodedContent"
      />

      <div
        v-else-if="isHtml && !isRenderableHtml && viewMode === 'preview'"
        class="unrenderable-html-placeholder"
      >
        <el-alert
          title="无法直接预览"
          description="此 HTML 文件可能是一个需要编译的组件模板 (例如 Vue 或 React 组件)，而不是一个独立的网页，因此无法直接预览。"
          type="info"
          :closable="false"
          show-icon
        />
      </div>

      <RichCodeEditor
        v-else-if="decodedContent"
        :model-value="decodedContent"
        :language="editorLanguage"
        :read-only="true"
        :editor-type="currentEditorType"
        class="code-viewer"
      />

      <div v-else class="empty-state">
        <p>没有可供预览的内容</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 主容器样式 */
.document-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--vscode-editor-background);
  box-sizing: border-box;
}

/* 工具栏样式 */
.document-viewer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  background-color: var(--card-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.actions-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-name {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  padding-left: 8px;
}

.html-title {
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-separator {
  color: var(--el-border-color);
}

.title-text {
  color: var(--el-text-color-regular);
  font-weight: 500;
}

/* 内容区域样式 */
.content-area {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 0;
  box-sizing: border-box;
}

.loading-state,
.binary-placeholder,
.empty-state,
.unrenderable-html-placeholder {
  padding: 16px;
}

.empty-state {
  color: var(--el-text-color-placeholder);
  text-align: center;
}

.code-viewer {
  height: 100%;
  box-sizing: border-box;
}

/* Markdown 预览样式 */
.markdown-preview {
  padding: 16px;
  box-sizing: border-box;
}
/* HTML 预览样式 */
.html-preview-component {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

/* PDF 预览样式 */
.pdf-preview-component {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.docx-preview-component {
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
  box-sizing: border-box;
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.8;
  background: var(--vscode-editor-background);

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.4;
  }

  :deep(p) {
    margin: 0.5em 0;
  }

  :deep(table) {
    width: 100%;
    margin: 1em 0;
    border-collapse: collapse;
  }

  :deep(td),
  :deep(th) {
    padding: 8px;
    border: var(--border-width) solid var(--border-color);
    vertical-align: top;
  }

  :deep(img) {
    max-width: 100%;
    height: auto;
    margin: 0.5em 0;
  }

  :deep(.docx-conversion-warnings) {
    margin-top: 24px;
    padding: 12px 16px;
    border: var(--border-width) solid var(--warning-color, #e6a23c);
    border-radius: 6px;
    color: var(--el-text-color-secondary);
  }
}
</style>
