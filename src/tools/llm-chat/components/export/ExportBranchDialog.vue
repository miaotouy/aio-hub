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
            <span class="summary-value">{{ branchMessageCount }} 条 <span v-if="isRangeActive" class="range-hint">(已选 {{ exportRange[1] - exportRange[0] + 1 }} 条)</span></span>
          </div>
          <div class="summary-item" v-if="presetCount > 0">
            <span class="summary-label">预设消息:</span>
            <span class="summary-value">{{ presetCount }} 条</span>
          </div>
        </div>

        <ExportOptionsPanel
          v-model:format="exportFormat"
          v-model:include-preset="includePreset"
          v-model:merge-preset-into-messages="mergePresetIntoMessages"
          v-model:include-user-profile="includeUserProfile"
          v-model:include-agent-info="includeAgentInfo"
          v-model:include-model-info="includeModelInfo"
          v-model:include-token-usage="includeTokenUsage"
          v-model:include-attachments="includeAttachments"
          v-model:include-errors="includeErrors"
          :preset-count="presetCount"
          v-model:range="exportRange"
          :max-range="branchMessageCount"
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
import { ref, computed, watch } from "vue";
import { ElButton } from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import ExportOptionsPanel from "./ExportOptionsPanel.vue";
import ExportPreviewSection from "./ExportPreviewSection.vue";
import Avatar from "@/components/common/Avatar.vue";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types/session";
import type { ChatMessageNode } from "../../types/message";
import { useExportManager } from "../../composables/features/useExportManager";
import { useAgentStore } from "../../stores/agentStore";
import { resolveAvatarPath } from "../../composables/ui/useResolvedAvatar";
import { processMessageAssetsSync } from "../../utils/agentAssetUtils";

interface Props {
  visible: boolean;
  presetCount?: number;
  session: ChatSessionDetail | null;
  sessionIndex?: ChatSessionIndex | null;
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
  range?: [number, number];
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

// 细粒度的导出选项
const includePreset = ref(false);
const mergePresetIntoMessages = ref(true);
const includeUserProfile = ref(true);
const includeAgentInfo = ref(true);
const includeModelInfo = ref(true);
const includeTokenUsage = ref(true);
const includeAttachments = ref(true);
const includeErrors = ref(true);

// 导出范围 [开始, 结束] (1-based)
const exportRange = ref<[number, number]>([1, 1]);

const exporting = ref(false);

const agentStore = useAgentStore();
const { exportBranchAsMarkdown, exportBranchAsJson } = useExportManager();

// 计算路径中的所有参与节点
const pathNodes = computed(() => {
  if (!props.session || !props.session.nodes || !props.messageId) return [];
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

// 是否设置了范围过滤
const isRangeActive = computed(() => {
  return exportRange.value[0] > 1 || exportRange.value[1] < branchMessageCount.value;
});

// 监听消息总数变化，重置范围
watch(
  branchMessageCount,
  (newCount) => {
    if (newCount > 0) {
      exportRange.value = [1, newCount];
    }
  },
  { immediate: true }
);

// 生成预览内容
// 生成预览内容
const previewContent = computed(() => {
  if (!props.session || !props.messageId || !props.sessionIndex) {
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
    range: [...exportRange.value] as [number, number],
  };

  if (exportFormat.value === "raw") {
    const branchNodes: Record<string, ChatMessageNode> = {};
    let currentId: string | null = props.messageId;
    const sessionNodes = props.session.nodes;

    while (currentId !== null && sessionNodes) {
      const node: ChatMessageNode | undefined = sessionNodes[currentId];
      if (node) {
        branchNodes[currentId] = node;
      }
      currentId = node ? node.parentId : null;
    }

    const rawBranchData = {
      index: props.sessionIndex,
      detail: {
        ...props.session,
        nodes: branchNodes,
      },
    };
    return JSON.stringify(rawBranchData, null, 2);
  } else if (exportFormat.value === "json") {
    const jsonData = exportBranchAsJson(
      props.sessionIndex,
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
      props.sessionIndex,
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
    range: [...exportRange.value] as [number, number],
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

.range-hint {
  font-size: 12px;
  color: var(--el-color-primary);
  font-weight: normal;
  margin-left: 4px;
}
</style>
