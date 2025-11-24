<script setup lang="ts">
import { ref, computed } from "vue";
import { useAgentStore } from "../../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatUiState } from "../../composables/useLlmChatUiState";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import Avatar from "@/components/common/Avatar.vue";
import AgentPresetEditor from "../agent/AgentPresetEditor.vue";
import EditAgentDialog from "../agent/EditAgentDialog.vue";
import ModelParametersEditor from "../agent/ModelParametersEditor.vue";
import ConfigSection from "../common/ConfigSection.vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatMessageNode, LlmParameters } from "../../types";
import { Edit } from "@element-plus/icons-vue";

const agentStore = useAgentStore();
const { enabledProfiles } = useLlmProfiles();

// 获取当前智能体（从 store 读取）
const currentAgent = computed(() => {
  if (!agentStore.currentAgentId) return null;
  return agentStore.getAgentById(agentStore.currentAgentId);
});

// 获取当前选中的 profile
const currentProfile = computed(() => {
  if (!currentAgent.value) return null;
  return enabledProfiles.value.find((p) => p.id === currentAgent.value!.profileId);
});

// 获取当前渠道类型
const currentProviderType = computed(() => currentProfile.value?.type);

// 获取当前选中的模型
const currentModel = computed(() => {
  if (!currentProfile.value || !currentAgent.value) return null;
  return currentProfile.value.models.find((m) => m.id === currentAgent.value!.modelId);
});

// 获取模型的上下文窗口限制
const contextLengthLimit = computed(() => {
  const contextLength = currentModel.value?.tokenLimits?.contextLength;
  // 如果为 0 或 undefined，返回 undefined 表示不限制
  return contextLength && contextLength > 0 ? contextLength : undefined;
});

// 当前选中的模型组合值
const selectedModelCombo = computed({
  get: () => {
    const agent = currentAgent.value;
    if (!agent) return "";
    return `${agent.profileId}:${agent.modelId}`;
  },
  set: (value: string) => {
    if (!value || !currentAgent.value || !agentStore.currentAgentId) return;
    const [profileId, modelId] = value.split(":");
    // 直接更新 Agent 的模型配置
    agentStore.updateAgent(agentStore.currentAgentId, { profileId, modelId });
    customMessage.success("模型已更新");
  },
});

// 模型参数的双向绑定
const modelParameters = computed<LlmParameters>({
  get: () => {
    return currentAgent.value?.parameters ?? {
      temperature: 0.7,
      maxTokens: 4096,
    };
  },
  set: (value: LlmParameters) => {
    if (!currentAgent.value || !agentStore.currentAgentId) return;
    agentStore.updateAgent(agentStore.currentAgentId, {
      parameters: value,
    });
  },
});
// 折叠状态管理 - 使用 useLlmChatUiState
const { presetMessagesExpanded } = useLlmChatUiState();

// 预设消息的双向绑定
const presetMessages = computed<ChatMessageNode[]>({
  get: () => {
    return currentAgent.value?.presetMessages ?? [];
  },
  set: (value: ChatMessageNode[]) => {
    if (!currentAgent.value || !agentStore.currentAgentId) return;
    agentStore.updateAgent(agentStore.currentAgentId, {
      presetMessages: value,
    });
    customMessage.success("预设消息已更新");
  },
});

// 编辑智能体弹窗
const showEditDialog = ref(false);

// 打开编辑弹窗
const openEditDialog = () => {
  showEditDialog.value = true;
};

// 保存编辑的智能体
const handleSaveEdit = (data: {
  name: string;
  description: string;
  icon: string;
  iconMode: "path" | "builtin";
  profileId: string;
  modelId: string;
  userProfileId: string | null;
  presetMessages: ChatMessageNode[];
  displayPresetCount: number;
  parameters: {
    temperature: number;
    maxTokens: number;
  };
  llmThinkRules: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
}) => {
  if (!currentAgent.value || !agentStore.currentAgentId) return;
  agentStore.updateAgent(agentStore.currentAgentId, {
    name: data.name,
    description: data.description,
    icon: data.icon,
    iconMode: data.iconMode,
    profileId: data.profileId,
    modelId: data.modelId,
    userProfileId: data.userProfileId,
    presetMessages: data.presetMessages,
    displayPresetCount: data.displayPresetCount,
    parameters: data.parameters,
    llmThinkRules: data.llmThinkRules,
  });
  customMessage.success("智能体已更新");
};
</script>

<template>
  <div class="parameters-sidebar-content">
    <div class="section-header">
      <div v-if="currentAgent" class="agent-header">
        <Avatar
          :src="currentAgent.icon || ''"
          :alt="currentAgent.name"
          :size="48"
          shape="square"
          :radius="8"
          class="agent-icon"
        />
        <div class="agent-info">
          <h4>{{ currentAgent.name }}</h4>
          <p v-if="currentAgent.description" class="agent-description">
            {{ currentAgent.description }}
          </p>
        </div>
        <el-button
          type="primary"
          size="small"
          :icon="Edit"
          circle
          @click="openEditDialog"
          title="编辑智能体"
          class="edit-button"
        />
      </div>
      <h4 v-else>⚙️ 参数配置</h4>
    </div>

    <div class="scroll-container">
      <div v-if="!currentAgent" class="empty-state">
        <p>请先选择智能体</p>
      </div>

      <div v-else class="parameters-form">
        <!-- 模型选择 -->
        <div class="param-group">
          <label class="param-label">
            <span>模型</span>
          </label>
          <LlmModelSelector v-model="selectedModelCombo" />
        </div>

        <!-- 模型参数 - 使用独立组件 -->
        <ModelParametersEditor
          v-model="modelParameters"
          :provider-type="currentProviderType"
          :context-length-limit="contextLengthLimit"
        />

        <!-- 预设消息分组 -->
        <ConfigSection title="预设消息" :icon="'i-ep-chat-line-round'" v-model:expanded="presetMessagesExpanded">
          <div class="preset-messages-compact">
            <AgentPresetEditor
              v-model="presetMessages"
              :compact="true"
              :agent="currentAgent"
              height="400px"
            />
          </div>
        </ConfigSection>

        <!-- TODO: 会话临时调整功能 -->
        <!-- 未来将在输入框工具区添加一个图标入口，打开小弹窗用于临时调整模型和参数 -->
      </div>
    </div>

    <!-- 编辑智能体弹窗 -->
    <EditAgentDialog
      v-model:visible="showEditDialog"
      mode="edit"
      :agent="currentAgent"
      @save="handleSaveEdit"
    />
  </div>
</template>

<style scoped>
.parameters-sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--container-bg);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.section-header h4 {
  margin: 0;
  font-size: 16px;
  color: var(--text-color);
  font-weight: 600;
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.agent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-header h4 {
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-description {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-button {
  flex-shrink: 0;
}

.agent-icon {
  flex-shrink: 0;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-light);
}

.empty-state p {
  margin: 0;
}

.parameters-form {
  padding: 16px;
}

.param-group {
  margin-bottom: 24px;
}

.param-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.override-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: normal;
  background-color: var(--primary-color);
  color: white;
  border-radius: 3px;
}

.param-value {
  font-family: "Consolas", "Monaco", monospace;
  color: var(--primary-color);
}

.param-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  background: var(--container-bg);
  border: 1px solid var(--border-color);
}

.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
  transition: all 0.2s;
}

.param-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.param-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.param-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
}

.param-desc {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.4;
}

.param-textarea {
  width: 100%;
  padding: 10px;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--text-color);
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s;
}

.param-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.param-textarea::placeholder {
  color: var(--text-color-light);
}

.preset-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* 滚动条样式 */
.scroll-container::-webkit-scrollbar {
  width: 6px;
}

.scroll-container::-webkit-scrollbar-track {
  background: transparent;
}

.scroll-container::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.scroll-container::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}

/* 预设消息紧凑版容器 */
.preset-messages-compact {
  margin-top: 8px;
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  overflow: hidden;
  background: var(--container-bg);
  /* 高度由组件自身 height prop 控制，这里只需要容器样式 */
}
</style>
