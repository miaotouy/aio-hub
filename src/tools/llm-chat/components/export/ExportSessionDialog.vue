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

        <ExportOptionsPanel
          v-model:format="exportFormat"
          v-model:include-user-profile="includeUserProfile"
          v-model:include-agent-info="includeAgentInfo"
          v-model:include-model-info="includeModelInfo"
          v-model:include-token-usage="includeTokenUsage"
          v-model:include-attachments="includeAttachments"
          v-model:include-errors="includeErrors"
          is-session
        />

        <ExportPreviewSection
          :content="previewContent"
          :format="exportFormat"
          :resolve-asset="resolveAsset"
        />
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
import { ElButton } from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ExportOptionsPanel from "./ExportOptionsPanel.vue";
import ExportPreviewSection from "./ExportPreviewSection.vue";
import type { ChatSession } from "../../types";
import { useExportManager } from "../../composables/useExportManager";
import { useAgentStore } from "../../agentStore";
import { processMessageAssetsSync } from "../../utils/agentAssetUtils";
import { sanitizeFilename } from "@/utils/fileUtils";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { formatDateTime } from "@/utils/time";

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
const errorHandler = createModuleErrorHandler("LlmChat/ExportSessionDialog");
const agentStore = useAgentStore();

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

// 资产路径解析钩子
const resolveAsset = (content: string) => {
  if (!props.session) return content;
  let processed = content;

  // 收集会话中涉及的所有智能体
  const agentIds = new Set<string>();
  Object.values(props.session.nodes).forEach((node) => {
    if (node.role === "assistant" && node.metadata?.agentId) {
      agentIds.add(node.metadata.agentId);
    }
  });

  agentIds.forEach((id) => {
    const agent = agentStore.getAgentById(id);
    if (agent) {
      processed = processMessageAssetsSync(processed, agent);
    }
  });

  return processed;
};

const handleExport = async () => {
  if (!props.session) {
    customMessage.error("没有可导出的会话");
    return;
  }

  try {
    exporting.value = true;

    // 生成默认文件名 (使用本地时间)
    const timestamp = formatDateTime(new Date(), "yyyy-MM-dd");

    const isJson = exportFormat.value === "json" || exportFormat.value === "raw";
    const extension = isJson ? "json" : "md";
    const sessionName = props.session.name || "未命名会话";
    // 对整个文件名主体进行清理，确保万无一失
    const safeFileNameBody = sanitizeFilename(`${sessionName}-${timestamp}`);
    const defaultFileName = `${safeFileNameBody}.${extension}`;

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
    errorHandler.error(error, "导出失败");
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
</style>
