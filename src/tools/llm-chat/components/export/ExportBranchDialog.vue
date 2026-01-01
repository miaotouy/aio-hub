<template>
  <BaseDialog
    v-model="localVisible"
    title="导出对话"
    width="1000px"
    height="80vh"
    :close-on-backdrop-click="true"
  >
    <template #content>
      <div class="export-container">
        <!-- 导出信息摘要 -->
        <div class="export-summary">
          <div class="summary-item summary-item-full">
            <span class="summary-label">参与智能体:</span>
            <div class="summary-value agents-list">
              <div
                v-for="agent in participatingAgents"
                :key="agent.id || agent.name"
                class="agent-item"
              >
                <Avatar
                  v-if="agent.icon"
                  :src="agent.avatarSrc || ''"
                  :alt="agent.name!"
                  :size="20"
                  shape="square"
                  :radius="4"
                  :border="false"
                />
                <span class="agent-name">{{ agent.name || "未知" }}</span>
              </div>
              <span v-if="participatingAgents.length === 0" class="agent-name">未知</span>
            </div>
          </div>
          <div class="summary-item" v-if="participatingModels.length > 0">
            <span class="summary-label">涉及模型:</span>
            <span class="summary-value">{{ participatingModels.join(", ") }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">对话消息:</span>
            <span class="summary-value">{{ branchMessageCount }} 条</span>
          </div>
          <div class="summary-item" v-if="presetCount > 0">
            <span class="summary-label">预设消息:</span>
            <span class="summary-value">{{ presetCount }} 条</span>
          </div>
        </div>

        <div class="export-options">
          <div class="options-section">
            <div class="section-title">导出格式</div>
            <el-radio-group v-model="exportFormat" class="format-group">
              <el-radio-button value="markdown">Markdown</el-radio-button>
              <el-radio-button value="json">JSON</el-radio-button>
              <el-radio-button value="raw">Raw (JSON)</el-radio-button>
            </el-radio-group>
          </div>

          <div class="options-section">
            <div class="section-title">包含内容</div>
            <div class="options-grid">
              <el-checkbox v-model="includePreset" class="option-checkbox">
                <span class="option-label">
                  智能体预设消息
                  <span v-if="presetCount > 0" class="option-hint">（{{ presetCount }} 条）</span>
                </span>
              </el-checkbox>

              <el-checkbox
                v-model="mergePresetIntoMessages"
                class="option-checkbox"
                :disabled="!includePreset"
              >
                <span class="option-label"> 合并预设到消息列表 </span>
              </el-checkbox>

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
            <div class="header-left">
              <h4>内容预览</h4>
              <span class="preview-stats">{{ previewStats }}</span>
            </div>
            <div class="header-actions">
              <el-button-group>
                <el-tooltip v-if="exportFormat === 'markdown'" content="切换视图" placement="top">
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
              v-if="exportFormat === 'markdown' && viewMode === 'preview'"
              :content="previewContent"
              :version="RendererVersion.V2_CUSTOM_PARSER"
              :resolve-asset="resolveAsset"
              class="markdown-preview"
            />
            <RichCodeEditor
              v-else
              :model-value="previewContent"
              :language="previewLanguage"
              :read-only="true"
              class="code-preview"
            />
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
import {
  ElCheckbox,
  ElButton,
  ElRadioGroup,
  ElRadioButton,
  ElButtonGroup,
  ElTooltip,
} from "element-plus";
import { Copy, Book, Code } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import Avatar from "@/components/common/Avatar.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import type { ChatSession, ChatMessageNode } from "../../types";
import { useExportManager } from "../../composables/useExportManager";
import { useAgentStore } from "../../agentStore";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";
import { processMessageAssetsSync } from "../../utils/agentAssetUtils";
import { customMessage } from "@/utils/customMessage";
import { useClipboard } from "@vueuse/core";

interface Props {
  visible: boolean;
  presetCount?: number;
  session: ChatSession | null;
  messageId: string;
  presetMessages?: ChatMessageNode[];
}

interface ExportOptions {
  format: "markdown" | "json" | "raw";
  includePreset: boolean;
  mergePresetIntoMessages: boolean;
  includeUserProfile: boolean;
  includeAgentInfo: boolean;
  includeModelInfo: boolean;
  includeTokenUsage: boolean;
  includeAttachments: boolean;
  includeErrors: boolean;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "export", options: ExportOptions): void;
}

const props = withDefaults(defineProps<Props>(), {
  presetCount: 0,
  presetMessages: () => [],
});

const emit = defineEmits<Emits>();

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

// 导出格式
const exportFormat = ref<"markdown" | "json" | "raw">("markdown");
const viewMode = ref<"preview" | "source">("preview");

// 细粒度的导出选项
const includePreset = ref(false);
const mergePresetIntoMessages = ref(true);
const includeUserProfile = ref(true);
const includeAgentInfo = ref(true);
const includeModelInfo = ref(true);
const includeTokenUsage = ref(true);
const includeAttachments = ref(true);
const includeErrors = ref(true);

const exporting = ref(false);

const agentStore = useAgentStore();
const { copy } = useClipboard();
const { exportBranchAsMarkdown, exportBranchAsJson } = useExportManager();

// 计算路径中的所有参与节点
const pathNodes = computed(() => {
  if (!props.session || !props.messageId) return [];
  const nodes: ChatMessageNode[] = [];
  let currentId: string | null = props.messageId;
  while (currentId !== null) {
    const node: ChatMessageNode | undefined = props.session.nodes[currentId];
    if (!node) break;
    if (node.id !== props.session.rootNodeId) {
      nodes.unshift(node);
    }
    currentId = node.parentId;
  }
  return nodes;
});

// 获取所有参与的智能体信息
const participatingAgents = computed(() => {
  const agentsMap = new Map<
    string,
    { id?: string; name: string; icon?: string; avatarSrc: string | null }
  >();

  pathNodes.value.forEach((node) => {
    if (node.role === "assistant" && node.metadata) {
      const agentName = node.metadata.agentName || "未知助手";
      const agentId = node.metadata.agentId;
      const key = agentId || agentName;

      if (!agentsMap.has(key)) {
        // 使用 resolveAvatarPath 纯函数解析头像路径
        const entity = agentId ? { id: agentId, icon: node.metadata.agentIcon } : null;
        const avatarSrc = entity ? resolveAvatarPath(entity, "agent") : null;

        agentsMap.set(key, {
          id: agentId,
          name: agentName,
          icon: node.metadata.agentIcon,
          avatarSrc,
        });
      }
    }
  });

  const result = Array.from(agentsMap.values());

  // 如果路径中没有智能体信息，回退到当前智能体（如果是正在进行的会话导出）
  if (result.length === 0 && agentStore.currentAgentId) {
    const current = agentStore.getAgentById(agentStore.currentAgentId);
    if (current) {
      const avatarSrc = resolveAvatarPath(current, "agent");
      return [
        {
          id: current.id,
          name: current.name || "未知",
          icon: current.icon,
          avatarSrc,
        },
      ];
    }
  }

  return result;
});

// 获取所有涉及的模型信息
const participatingModels = computed(() => {
  const models = new Set<string>();
  pathNodes.value.forEach((node) => {
    if (node.role === "assistant" && node.metadata) {
      if (node.metadata.modelName) {
        models.add(node.metadata.modelName);
      } else if (node.metadata.modelId) {
        models.add(node.metadata.modelId);
      }
    }
  });
  return Array.from(models);
});

// 计算分支路径中的消息数量
const branchMessageCount = computed(() => pathNodes.value.length);

// 生成预览内容
const previewContent = computed(() => {
  if (!props.session || !props.messageId) {
    return "暂无会话数据";
  }

  const options: ExportOptions = {
    format: exportFormat.value,
    includePreset: includePreset.value,
    mergePresetIntoMessages: mergePresetIntoMessages.value,
    includeUserProfile: includeUserProfile.value,
    includeAgentInfo: includeAgentInfo.value,
    includeModelInfo: includeModelInfo.value,
    includeTokenUsage: includeTokenUsage.value,
    includeAttachments: includeAttachments.value,
    includeErrors: includeErrors.value,
  };

  if (exportFormat.value === "raw") {
    const branchNodes: Record<string, ChatMessageNode> = {};
    let currentId: string | null = props.messageId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = props.session.nodes[currentId];
      if (node) {
        branchNodes[currentId] = node;
      }
      currentId = node ? node.parentId : null;
    }

    const rawBranchData = {
      ...props.session,
      nodes: branchNodes,
    };
    return JSON.stringify(rawBranchData, null, 2);
  } else if (exportFormat.value === "json") {
    const jsonData = exportBranchAsJson(
      props.session,
      props.messageId,
      includePreset.value,
      props.presetMessages,
      options
    );
    return JSON.stringify(jsonData, null, 2);
  } else {
    // Markdown 导出保持原始协议，不做字符串替换
    return exportBranchAsMarkdown(
      props.session,
      props.messageId,
      includePreset.value,
      props.presetMessages,
      options
    );
  }
});

// 资产路径解析钩子：在预览渲染时动态解析 agent-asset://
const resolveAsset = (content: string) => {
  let processed = content;
  // 遍历路径中的所有智能体进行解析
  participatingAgents.value.forEach((agentInfo) => {
    if (agentInfo.id) {
      const agent = agentStore.getAgentById(agentInfo.id);
      if (agent) {
        processed = processMessageAssetsSync(processed, agent);
      }
    }
  });
  return processed;
};

// 计算预览语言
const previewLanguage = computed(() => {
  if (exportFormat.value === "json" || exportFormat.value === "raw") {
    return "json";
  }
  return "markdown";
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
  return `${lines} 行 · ${chars} 字符 · ${exportFormat.value.toUpperCase()} 格式`;
});

const handleCopy = () => {
  copy(previewContent.value);
  customMessage.success("已复制到剪贴板");
};

const toggleViewMode = () => {
  viewMode.value = viewMode.value === "preview" ? "source" : "preview";
};

const handleExport = () => {
  const options: ExportOptions = {
    format: exportFormat.value,
    includePreset: includePreset.value,
    mergePresetIntoMessages: mergePresetIntoMessages.value,
    includeUserProfile: includeUserProfile.value,
    includeAgentInfo: includeAgentInfo.value,
    includeModelInfo: includeModelInfo.value,
    includeTokenUsage: includeTokenUsage.value,
    includeAttachments: includeAttachments.value,
    includeErrors: includeErrors.value,
  };
  emit("export", options);
  localVisible.value = false;
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
  flex-wrap: wrap;
}

.agents-list {
  gap: 12px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-name {
  font-weight: 500;
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

.option-hint {
  color: var(--text-color-light);
  font-size: 12px;
}

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
