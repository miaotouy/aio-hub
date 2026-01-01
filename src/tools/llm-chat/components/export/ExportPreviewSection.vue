<template>
  <div class="preview-section">
    <div class="preview-header">
      <div class="header-left">
        <h4>内容预览</h4>
        <span class="preview-stats">{{ previewStats }}</span>
      </div>
      <div class="header-actions">
        <el-button-group>
          <el-tooltip v-if="format === 'markdown'" content="切换视图" placement="top">
            <el-button
              size="small"
              :icon="viewMode === 'preview' ? Code : Book"
              @click="toggleViewMode"
            />
          </el-tooltip>
          <el-tooltip content="复制内容" placement="top">
            <el-button size="small" :icon="Copy" @click="handleCopy" />
          </el-tooltip>
        </el-button-group>
      </div>
    </div>
    <div class="preview-content">
      <RichTextRenderer
        v-if="format === 'markdown' && viewMode === 'preview'"
        :content="content"
        :version="RendererVersion.V2_CUSTOM_PARSER"
        :resolve-asset="resolveAsset"
        class="markdown-preview"
      />
      <RichCodeEditor
        v-else
        :model-value="content"
        :language="previewLanguage"
        :read-only="true"
        class="code-preview"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElButton, ElButtonGroup, ElTooltip } from "element-plus";
import { Copy, Book, Code } from "lucide-vue-next";
import { useClipboard } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";

interface Props {
  content: string;
  format: "markdown" | "json" | "raw";
  resolveAsset?: (content: string) => string;
}

const props = defineProps<Props>();

const viewMode = ref<"preview" | "source">("source");
const { copy } = useClipboard();

const previewLanguage = computed(() => {
  if (props.format === "json" || props.format === "raw") {
    return "json";
  }
  return "markdown";
});

const previewStats = computed(() => {
  const lines = props.content.split("\n").length;
  const chars = props.content.length;
  const formatLabel = props.format === "raw" ? "Raw JSON" : props.format.toUpperCase();
  return `${lines} 行 · ${chars} 字符 · ${formatLabel} 格式`;
});

const handleCopy = () => {
  copy(props.content);
  customMessage.success("已复制到剪贴板");
};

const toggleViewMode = () => {
  viewMode.value = viewMode.value === "preview" ? "source" : "preview";
};
</script>

<style scoped>
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 300px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--card-bg);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background-color: var(--container-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.preview-stats {
  font-size: 12px;
  color: var(--text-color-light);
}

.preview-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.markdown-preview {
  padding: 16px;
  overflow-y: auto;
  height: 100%;
}

.code-preview {
  height: 100%;
  border: none;
}
</style>
