<template>
  <BaseDialog
    v-model="localVisible"
    title="导出会话"
    width="1000px"
    height="80vh"
    :close-on-backdrop-click="true"
  >
    <template #content>
      <div class="export-container">
        <!-- 导出信息摘要 -->
        <div class="export-summary">
          <div class="summary-item summary-item-full">
            <span class="summary-label">会话名称:</span>
            <span class="summary-value">{{ session?.name || "未命名" }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">创建时间:</span>
            <span class="summary-value">{{ formatDate(session?.createdAt) }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">更新时间:</span>
            <span class="summary-value">{{ formatDate(session?.updatedAt) }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">总消息数:</span>
            <span class="summary-value">{{ totalMessageCount }} 条</span>
          </div>
          <div class="summary-item" v-if="branchCount > 1">
            <span class="summary-label">分支数:</span>
            <span class="summary-value">{{ branchCount }} 个</span>
          </div>
        </div>

        <div class="export-options">
          <div class="options-section">
            <div class="section-title">导出格式</div>
            <el-radio-group v-model="exportFormat" class="format-group">
              <el-radio-button value="markdown">Markdown (树状)</el-radio-button>
              <el-radio-button value="json">JSON</el-radio-button>
              <el-radio-button value="raw">Raw (JSON)</el-radio-button>
            </el-radio-group>
          </div>

          <div class="options-section">
            <div class="section-title">包含内容</div>
            <div class="options-grid">
              <el-checkbox v-model="includeUserProfile" class="option-checkbox">
                <span class="option-label">用户档案信息</span>
              </el-checkbox>

              <el-checkbox v-model="includeAgentInfo" class="option-checkbox">
                <span class="option-label">智能体信息</span>
              </el-checkbox>

              <el-checkbox v-model="includeModelInfo" class="option-checkbox">
                <span class="option-label">模型信息</span>
              </el-checkbox>

              <el-checkbox v-model="includeTokenUsage" class="option-checkbox">
                <span class="option-label">Token 用量</span>
              </el-checkbox>

              <el-checkbox v-model="includeAttachments" class="option-checkbox">
                <span class="option-label">附件信息</span>
              </el-checkbox>

              <el-checkbox v-model="includeErrors" class="option-checkbox">
                <span class="option-label">错误信息</span>
              </el-checkbox>
            </div>
          </div>
        </div>

        <div class="preview-section">
          <div class="preview-header">
            <h4>内容预览</h4>
            <span class="preview-stats">{{ previewStats }}</span>
          </div>
          <div class="preview-content">
            <pre>{{ previewContent }}</pre>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="localVisible = false">取消</el-button>
      <el-button type="primary" @click="handleExport" :loading="exporting"> 导出 </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElCheckbox, ElButton, ElRadioGroup, ElRadioButton } from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { ChatSession } from "../../types";
import { useExportManager } from "../../composables/useExportManager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { customMessage } from "@/utils/customMessage";

interface Props {
  visible: boolean;
  session: ChatSession | null;
}

interface ExportOptions {
  format: "markdown" | "json" | "raw";
  includeUserProfile: boolean;
  includeAgentInfo: boolean;
  includeModelInfo: boolean;
  includeTokenUsage: boolean;
  includeAttachments: boolean;
  includeErrors: boolean;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

// 导出格式
const exportFormat = ref<"markdown" | "json" | "raw">("markdown");

// 细粒度的导出选项
const includeUserProfile = ref(true);
const includeAgentInfo = ref(true);
const includeModelInfo = ref(true);
const includeTokenUsage = ref(true);
const includeAttachments = ref(true);
const includeErrors = ref(true);

const exporting = ref(false);

// 格式化日期
const formatDate = (timestamp?: string) => {
  if (!timestamp) return "未知";
  return new Date(timestamp).toLocaleString("zh-CN");
};

// 计算总消息数（排除根节点）
const totalMessageCount = computed(() => {
  if (!props.session) return 0;
  return Object.keys(props.session.nodes).length - 1;
});

// 计算分支数（拥有多个子节点的节点数量）
const branchCount = computed(() => {
  if (!props.session) return 0;
  let count = 0;
  Object.values(props.session.nodes).forEach((node) => {
    if (node.childrenIds.length > 1) {
      count += node.childrenIds.length;
    }
  });
  return count;
});

// 生成预览内容
const previewContent = computed(() => {
  if (!props.session) {
    return "暂无会话数据";
  }

  const { exportSessionAsMarkdownTree } = useExportManager();
  const options: Partial<ExportOptions> = {
    includeUserProfile: includeUserProfile.value,
    includeAgentInfo: includeAgentInfo.value,
    includeModelInfo: includeModelInfo.value,
    includeTokenUsage: includeTokenUsage.value,
    includeAttachments: includeAttachments.value,
    includeErrors: includeErrors.value,
  };

  if (exportFormat.value === "raw") {
    return JSON.stringify(props.session, null, 2);
  } else if (exportFormat.value === "json") {
    // 简化的 JSON 导出（包含完整节点树）
    const jsonData = {
      session: {
        id: props.session.id,
        name: props.session.name,
        createdAt: props.session.createdAt,
        updatedAt: props.session.updatedAt,
      },
      exportTime: new Date().toISOString(),
      totalNodes: totalMessageCount.value,
      branchCount: branchCount.value,
      nodes: props.session.nodes,
    };
    return JSON.stringify(jsonData, null, 2);
  } else {
    return exportSessionAsMarkdownTree(props.session, options);
  }
});

// 计算预览统计信息
const previewStats = computed(() => {
  const lines = previewContent.value.split("\n").length;
  const chars = previewContent.value.length;
  if (exportFormat.value === "raw") {
    return `${lines} 行 · ${chars} 字符 · Raw JSON 格式`;
  } else if (exportFormat.value === "json") {
    return `${lines} 行 · ${chars} 字符 · JSON 格式`;
  }
  return `${lines} 行 · ${chars} 字符 · Markdown 格式`;
});

const handleExport = async () => {
  if (!props.session) {
    customMessage.error("没有可导出的会话");
    return;
  }

  try {
    exporting.value = true;

    // 生成默认文件名 (使用本地时间)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const timestamp = `${year}-${month}-${day}`;
    
    const isJson = exportFormat.value === "json" || exportFormat.value === "raw";
    const extension = isJson ? "json" : "md";
    const defaultFileName = `${props.session.name}-${timestamp}.${extension}`;

    // 打开保存对话框
    const filePath = await save({
      defaultPath: defaultFileName,
      filters: [
        {
          name: isJson ? "JSON 文件" : "Markdown 文件",
          extensions: [extension],
        },
      ],
    });

    if (!filePath) {
      exporting.value = false;
      return;
    }

    // 写入文件
    await writeTextFile(filePath, previewContent.value);

    customMessage.success("会话导出成功");
    localVisible.value = false;
  } catch (error) {
    customMessage.error(`导出失败: ${error}`);
  } finally {
    exporting.value = false;
  }
};
</script>

<style scoped>
.export-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  height: 100%;
  min-height: 0;
}

.export-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background-color: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.summary-item-full {
  width: 100%;
}

.summary-label {
  color: var(--text-color-light);
  font-weight: 500;
  min-width: 70px;
}

.summary-value {
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-options {
  flex-shrink: 0;
  padding: 12px;
  background-color: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.options-header {
  margin-bottom: 12px;
}

.options-header h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.options-section {
  margin-bottom: 16px;
}

.options-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 8px;
}

.format-group {
  display: flex;
  gap: 8px;
}

.format-group :deep(.el-radio-button) {
  .el-radio-button__inner {
    border: 1px solid var(--border-color);
    border-radius: 4px !important;
    padding: 5px 15px;
  }

  &:not(:last-child) .el-radio-button__inner {
    border-right: 1px solid var(--border-color);
  }

  &.is-active .el-radio-button__inner {
    border-color: var(--el-color-primary);
    background-color: var(--el-color-primary);
    color: var(--el-color-white);
  }

  &:hover .el-radio-button__inner {
    border-color: var(--el-color-primary);
  }
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.option-checkbox {
  display: flex;
  align-items: flex-start;
}

.option-label {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 13px;
}

.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--container-bg);
  border-bottom: 1px solid var(--border-color);
}

.preview-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.preview-stats {
  font-size: 12px;
  color: var(--text-color-light);
}

.preview-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
  background-color: var(--bg-color);
}

.preview-content pre {
  margin: 0;
  font-family: "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
