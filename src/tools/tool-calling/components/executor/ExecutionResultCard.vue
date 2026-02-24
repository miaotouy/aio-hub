<script setup lang="ts">
import { reactive } from "vue";
import { CheckCircle2, XCircle, Clock, Eye, Code, FileJson } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";

defineProps<{
  res: {
    requestId: string;
    status: "success" | "error";
    durationMs: number;
    result: any;
  };
}>();

// 结果查看模式管理
const viewMode = reactive({
  current: "markdown" as "markdown" | "json" | "raw",
});

/**
 * 格式化显示结果
 */
const formatDisplayResult = (result: any, mode: "markdown" | "json" | "raw") => {
  if (result === undefined || result === null) return "";

  if (mode === "json") {
    if (typeof result === "string") {
      try {
        // 尝试解析并重新美化，如果是 JSON 字符串的话
        return JSON.stringify(JSON.parse(result), null, 2);
      } catch (e) {
        return result;
      }
    }
    return JSON.stringify(result, null, 2);
  }

  if (typeof result !== "string") {
    return JSON.stringify(result, null, 2);
  }

  return result;
};
</script>

<template>
  <div class="res-card">
    <div class="res-head">
      <div class="res-status" :class="res.status">
        <component :is="res.status === 'success' ? CheckCircle2 : XCircle" :size="14" />
        <span>{{ res.status.toUpperCase() }}</span>
      </div>
      <div class="res-id">{{ res.requestId }}</div>
      <div class="res-meta">
        <span class="meta-item"><Clock :size="12" /> {{ res.durationMs }}ms</span>
        <span class="meta-item debug-tag" :title="res.result">Len: {{ res.result?.length || 0 }}</span>
      </div>
      <div class="res-view-switch">
        <el-radio-group v-model="viewMode.current" size="small">
          <el-radio-button value="markdown">
            <el-tooltip content="Markdown 预览"><Eye :size="12" /></el-tooltip>
          </el-radio-button>
          <el-radio-button value="json">
            <el-tooltip content="JSON 源码"><FileJson :size="12" /></el-tooltip>
          </el-radio-button>
          <el-radio-button value="raw">
            <el-tooltip content="原始文本"><Code :size="12" /></el-tooltip>
          </el-radio-button>
        </el-radio-group>
      </div>
    </div>
    <div class="res-body">
      <template v-if="viewMode.current === 'markdown'">
        <div class="markdown-viewer scrollbar-styled">
          <RichTextRenderer
            :content="typeof res.result === 'string' ? res.result : JSON.stringify(res.result, null, 2)"
            :version="RendererVersion.V2_CUSTOM_PARSER"
          />
        </div>
      </template>
      <template v-else-if="viewMode.current === 'json'">
        <RichCodeEditor :value="formatDisplayResult(res.result, 'json')" language="json" height="300px" readonly />
      </template>
      <div v-else class="raw-preview scrollbar-styled">
        <div class="raw-content">{{ formatDisplayResult(res.result, "raw") }}</div>
        <div v-if="!res.result" class="raw-empty">结果为空字符串</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.res-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  overflow: hidden;
}

.res-head {
  padding: 6px 12px;
  background-color: rgba(var(--text-color-rgb), 0.03);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

.res-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  font-size: 11px;
}

.res-status.success {
  color: var(--el-color-success);
}
.res-status.error {
  color: var(--el-color-danger);
}

.res-id {
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  color: var(--text-color-secondary);
  flex: 1;
}

.res-meta {
  font-size: 11px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.debug-tag {
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  padding: 0 4px;
  border-radius: 2px;
  font-family: var(--el-font-family-mono);
  cursor: help;
}

.res-body {
  padding: 8px;
  background-color: var(--vscode-editor-background);
}

.markdown-viewer {
  max-height: 400px;
  overflow-y: auto;
  padding: 12px;
  background-color: var(--card-bg);
  border-radius: 4px;
}

.raw-preview {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.raw-empty {
  color: var(--text-color-secondary);
  opacity: 0.5;
  text-align: center;
  padding: 20px;
  font-style: italic;
}

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}
</style>
