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
            <span class="summary-value">{{
              sessionIndex?.name || "未命名"
            }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">创建时间:</span>
            <span class="summary-value">{{
              formatDate(sessionIndex?.createdAt)
            }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">更新时间:</span>
            <span class="summary-value">{{
              formatDate(sessionIndex?.updatedAt)
            }}</span>
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
      <el-button type="primary" @click="handleExport" :loading="exporting">
        导出
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElButton } from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ExportOptionsPanel from "./ExportOptionsPanel.vue";
import ExportPreviewSection from "./ExportPreviewSection.vue";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types";
import { useExportManager } from "../../composables/features/useExportManager";
import { useAgentStore } from "../../stores/agentStore";
import { processMessageAssetsSync } from "../../utils/agentAssetUtils";
import { sanitizeFilename } from "@/utils/fileUtils";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getEffectiveMessageCount } from "../../utils/sessionMessageCount";
import { formatDateTime } from "@/utils/time";

interface Props {
  visible: boolean;
  sessionIndex: ChatSessionIndex | null;
  sessionDetail?: ChatSessionDetail | null;
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

// 计算有效消息数（排除根节点和未固化开场白）
const totalMessageCount = computed(() => {
  if (props.sessionDetail?.nodes) {
    return getEffectiveMessageCount(
      props.sessionDetail.nodes,
      props.sessionDetail.rootNodeId
    );
  }
  return props.sessionIndex?.messageCount || 0;
});

// 计算分支数（拥有多个子节点的节点数量）
const branchCount = computed(() => {
  if (!props.sessionDetail || !props.sessionDetail.nodes) return 0;
  let count = 0;
  Object.values(props.sessionDetail.nodes).forEach((node: any) => {
    if (node.childrenIds && node.childrenIds.length > 1) {
      count += node.childrenIds.length;
    }
  });
  return count;
});

// 生成预览内容
const previewContent = ref<string>("正在生成预览...");

const { exportSessionAsMarkdownTree } = useExportManager();

// 异步更新预览内容
watch(
  [
    () => props.sessionIndex,
    () => props.sessionDetail,
    exportFormat,
    includeUserProfile,
    includeAgentInfo,
    includeModelInfo,
    includeTokenUsage,
    includeAttachments,
    includeErrors,
  ],
  async () => {
    if (!props.sessionIndex) {
      previewContent.value = "暂无会话数据";
      return;
    }

    if (!props.sessionDetail) {
      previewContent.value = "正在加载会话详情...";
      return;
    }

    const options: any = {
      includeUserProfile: includeUserProfile.value,
      includeAgentInfo: includeAgentInfo.value,
      includeModelInfo: includeModelInfo.value,
      includeTokenUsage: includeTokenUsage.value,
      includeAttachments: includeAttachments.value,
      includeErrors: includeErrors.value,
    };

    try {
      if (exportFormat.value === "raw") {
        previewContent.value = JSON.stringify(
          {
            index: props.sessionIndex,
            detail: props.sessionDetail,
          },
          null,
          2
        );
      } else if (exportFormat.value === "json") {
        // 简化的 JSON 导出（包含完整节点树）
        const jsonData = {
          session: {
            id: props.sessionIndex.id,
            name: props.sessionIndex.name,
            createdAt: props.sessionIndex.createdAt,
            updatedAt: props.sessionIndex.updatedAt,
          },
          exportTime: new Date().toISOString(),
          totalNodes: totalMessageCount.value,
          branchCount: branchCount.value,
          nodes: props.sessionDetail.nodes || {},
        };
        previewContent.value = JSON.stringify(jsonData, null, 2);
      } else {
        previewContent.value = await exportSessionAsMarkdownTree(
          props.sessionIndex,
          props.sessionDetail,
          options
        );
      }
    } catch (err) {
      previewContent.value = "生成预览失败";
    }
  },
  { immediate: true, deep: true }
);
// 资产路径解析钩子
const resolveAsset = (content: string) => {
  if (!props.sessionDetail) return content;
  let processed = content;

  // 收集会话中涉及的所有智能体
  const agentIds = new Set<string>();
  if (props.sessionDetail.nodes) {
    Object.values(props.sessionDetail.nodes).forEach((node: any) => {
      if (node.role === "assistant" && node.metadata?.agentId) {
        agentIds.add(node.metadata.agentId);
      }
    });
  }

  agentIds.forEach((id) => {
    const agent = agentStore.getAgentById(id);
    if (agent) {
      processed = processMessageAssetsSync(processed, agent);
    }
  });

  return processed;
};

const handleExport = async () => {
  if (!props.sessionIndex || !props.sessionDetail) {
    customMessage.error("没有可导出的会话数据");
    return;
  }

  try {
    exporting.value = true;

    // 生成默认文件名 (使用本地时间)
    const timestamp = formatDateTime(new Date(), "yyyy-MM-dd");

    const isJson =
      exportFormat.value === "json" || exportFormat.value === "raw";
    const extension = isJson ? "json" : "md";

    // 对会话名称和时间戳分别清理并合并，确保万无一失
    const safeSessionName = sanitizeFilename(
      props.sessionIndex.name || "未命名会话"
    );
    const defaultFileName = `${safeSessionName}-${timestamp}.${extension}`;

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
  border: var(--border-width) solid var(--border-color);
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
