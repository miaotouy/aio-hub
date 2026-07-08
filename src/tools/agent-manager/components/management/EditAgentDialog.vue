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
import { reactive, watch, ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import type {
  ChatAgent,
  AgentEditData,
  GreetingMessage,
} from "../../types/agent";
import type { ChatMessageNode } from "@/tools/llm-chat/types/message";
import type { PresetMessageGroup } from "../../types/agent";
import BaseDialog from "@/components/common/BaseDialog.vue";
import Avatar from "@/components/common/Avatar.vue";
import { Users } from "lucide-vue-next";
import { useChatSettings } from "@/tools/llm-chat/composables/settings/useChatSettings";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useAgentStore } from "../../stores/agentStore";
import { resolveAvatarPath } from "@/tools/llm-chat/composables/ui/useResolvedAvatar";
import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import { createDefaultChatRegexConfig } from "@/tools/llm-chat/types/chatRegex";
import { DEFAULT_TOOL_CALL_CONFIG, DEFAULT_KB_CONFIG } from "../../types/agent";
import AgentEditor from "../agent-editor/AgentEditor.vue";
import MiniAgentList from "./MiniAgentList.vue";
import type {
  LlmThinkRule,
  RichTextRendererStyleOptions,
} from "@/tools/rich-text-renderer/types";

interface Props {
  visible: boolean;
  mode: "create" | "edit";
  agent?: ChatAgent | null;
  initialData?: Partial<AgentEditData> | null;
  /**
   * 切换编辑对象时，是否同步切换当前聊天所选的智能体
   * @default false
   */
  syncToChat?: boolean;
  /**
   * 初始激活的标签页
   */
  initialTab?: string;
  /**
   * 初始定位的配置项 ID
   */
  initialSection?: string;
}
interface Emits {
  (e: "update:visible", value: boolean): void;
  (
    e: "save",
    data: AgentEditData,
    options?: { silent?: boolean; agentId?: string }
  ): void;
}

const props = withDefaults(defineProps<Props>(), {
  agent: null,
  initialData: null,
  syncToChat: false,
});

const emit = defineEmits<Emits>();

const { settings } = useChatSettings();
const { enabledProfiles } = useLlmProfiles();
const agentStore = useAgentStore();

// 定义表单默认值
const defaultFormState = {
  id: "",
  name: "",
  displayName: "",
  agentVersion: "",
  description: "",
  icon: "",
  avatarHistory: [] as string[],
  profileId: "",
  modelId: "",
  modelCombo: "", // 用于 LlmModelSelector 的组合值 (profileId:modelId)
  userProfileId: null as string | null, // 绑定的用户档案 ID
  presetMessages: [] as ChatMessageNode[],
  presetGroups: [] as PresetMessageGroup[],
  greetings: [] as GreetingMessage[],
  defaultGreetingId: "", // 默认选中的开局消息 ID
  displayPresetCount: 0, // 显示的预设消息数量
  llmThinkRules: [] as LlmThinkRule[], // LLM 思考块规则配置
  richTextStyleOptions: {} as RichTextRendererStyleOptions, // 富文本样式配置
  regexConfig: createDefaultChatRegexConfig(), // 正则管道配置
  tags: [] as string[],
  category: "",
  worldbookIds: [] as string[],
  worldbookSettings: {
    disableRecursion: false,
    defaultScanDepth: 2,
  },
  assets: [] as import("../../types/agent").AgentAsset[],
  assetGroups: [] as import("../../types/agent").AssetGroup[],
  virtualTimeConfig: null as {
    virtualBaseTime: string;
    realBaseTime: string;
    timeScale: number;
  } | null,
  interactionConfig: {
    sendButtonCreateBranch: false,
    defaultMediaVolume: 100,
  },
  toolCallConfig: JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG)),
  knowledgeBaseConfig: JSON.parse(JSON.stringify(DEFAULT_KB_CONFIG)),
  knowledgeSettings: undefined as any,
  extensionConfig: undefined as any,
  quickActionSetIds: [] as string[],
  variableConfig: undefined as any,
};

// 内部追踪当前正在编辑的智能体 ID (解耦全局选中)
const localAgentId = ref<string | null>(null);

// 当前正在编辑的智能体对象
const currentEditingAgent = computed(() => {
  if (props.mode === "create") return null;
  return agentStore.getAgentById(localAgentId.value || "");
});

// 编辑表单
const editForm = reactive(JSON.parse(JSON.stringify(defaultFormState)));
let loadFormRequestId = 0;

// 加载表单数据
const loadFormData = async () => {
  const requestId = ++loadFormRequestId;

  // 0. 初始化本地 ID (仅在编辑模式且 localAgentId 为空时，从 props 同步一次)
  if (props.mode === "edit" && !localAgentId.value && props.agent) {
    localAgentId.value = props.agent.id;
  }

  const editingAgentId =
    props.mode === "edit" ? localAgentId.value || props.agent?.id : null;

  // 确定数据源：编辑模式优先按需加载完整详情，创建模式用 initialData
  let sourceData: Partial<AgentEditData> | ChatAgent = props.initialData || {};

  if (props.mode === "edit" && editingAgentId) {
    const loadedAgent = await agentStore.ensureAgentLoaded(editingAgentId);
    if (
      requestId !== loadFormRequestId ||
      localAgentId.value !== editingAgentId
    ) {
      return;
    }
    sourceData =
      loadedAgent ||
      agentStore.getAgentById(editingAgentId) ||
      props.agent ||
      {};
  }

  // 1. 彻底重置为默认值（使用 JSON 深拷贝确保引用断开）
  const defaults = JSON.parse(JSON.stringify(defaultFormState));
  for (const key of Object.keys(editForm)) {
    (editForm as any)[key] = defaults[key as keyof typeof defaults];
  }

  // 2. 动态合并数据
  for (const key of Object.keys(editForm)) {
    // 如果源数据中有该键，则同步（包括 null/undefined）
    if (key in sourceData) {
      const val = (sourceData as any)[key];
      if (val !== undefined && val !== null) {
        if (typeof val === "object") {
          (editForm as any)[key] = JSON.parse(JSON.stringify(val));
        } else {
          (editForm as any)[key] = val;
        }
      } else {
        // 显式重置为默认值，防止残留
        (editForm as any)[key] = (defaults as any)[key];
      }
    }
    // 如果源数据中没有该键（比如 Agent 对象缺少某些可选字段），
    // 由于步骤 1 已经重置过了，这里不需要额外处理
  }

  // 3. 特殊字段处理
  if (props.mode === "create" && !editForm.modelId && !editForm.profileId) {
    const defaultModelId = settings.value.modelPreferences.defaultModel;
    if (defaultModelId) {
      for (const profile of enabledProfiles.value) {
        const model = profile.models.find((m) => m.id === defaultModelId);
        if (model) {
          editForm.profileId = profile.id;
          editForm.modelId = model.id;
          break;
        }
      }
    }
  }

  if (editForm.profileId && editForm.modelId) {
    editForm.modelCombo = `${editForm.profileId}:${editForm.modelId}`;
  }
};

const agentListVisible = ref(false);
const isSwitching = ref(false);
const activeTab = ref("basic");

// 切换编辑的智能体
const switchToAgent = async (targetAgent: ChatAgent) => {
  if (localAgentId.value === targetAgent.id) {
    agentListVisible.value = false;
    return;
  }

  // 校验当前表单（复用保存逻辑的校验）
  if (!editForm.name.trim()) {
    customMessage.warning("当前正在编辑的智能体名称不能为空，请先修正后再切换");
    return;
  }

  // 先尝试保存当前的修改（静默，显式指定保存到当前正在编辑的 ID）
  if (localAgentId.value) {
    handleSave({ silent: true, overrideAgentId: localAgentId.value });
  }

  // 标记正在切换，防止中间态的误保存
  isSwitching.value = true;

  // 切换逻辑
  try {
    if (props.syncToChat) {
      // 同步模式：切换全局选中的智能体，并立即加载完整详情
      const { currentAgentId } = useLlmChatUiState();
      currentAgentId.value = targetAgent.id;
      localAgentId.value = targetAgent.id;
      await loadFormData();
    } else {
      // 解耦模式：仅更新内部追踪的 ID 并重新加载数据
      localAgentId.value = targetAgent.id;
      await loadFormData();
    }
  } finally {
    isSwitching.value = false;
  }

  agentListVisible.value = false;
};

// 监听对话框打开
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      // 每次打开时，如果是编辑模式，尝试从 props 同步初始 ID
      if (props.mode === "edit" && props.agent) {
        localAgentId.value = props.agent.id;
      }
      void loadFormData();
    } else {
      // 关闭时重置本地 ID，确保下次打开时能重新同步
      loadFormRequestId++;
      localAgentId.value = null;
    }
  },
  { immediate: true }
);

// 监听 props.agent 变化
// 仅在 syncToChat 为 true 时，才响应外部传入的 agent 变化（因为此时外部是权威源）
watch(
  () => props.agent?.id,
  (newId) => {
    if (props.visible && props.syncToChat && newId) {
      localAgentId.value = newId;
      void loadFormData().finally(() => {
        // 加载完成后重置切换标志
        isSwitching.value = false;
      });
    }
  }
);

// 关闭对话框
const handleClose = () => {
  emit("update:visible", false);
};

// 保存智能体
const handleSave = (
  options: { silent?: boolean; overrideAgentId?: string } = {}
) => {
  // 如果正在切换中，且不是显式指定的 override 保存，则忽略
  if (isSwitching.value && !options.overrideAgentId) return;

  if (!editForm.name.trim()) {
    customMessage.warning("智能体名称不能为空");
    return;
  }

  if (!editForm.profileId || !editForm.modelId) {
    customMessage.warning("请选择模型");
    return;
  }

  let parameters: ChatAgent["parameters"] = { temperature: 1, maxTokens: 8192 };

  if (props.mode === "edit" && currentEditingAgent.value) {
    parameters = currentEditingAgent.value.parameters;
  } else if (props.mode === "create" && props.initialData?.parameters) {
    parameters = JSON.parse(JSON.stringify(props.initialData.parameters));
  }

  emit(
    "save",
    {
      name: editForm.name,
      displayName: editForm.displayName || undefined,
      agentVersion: editForm.agentVersion,
      description: editForm.description,
      icon: editForm.icon,
      avatarHistory: editForm.avatarHistory,
      profileId: editForm.profileId,
      modelId: editForm.modelId,
      userProfileId: editForm.userProfileId,
      presetMessages: editForm.presetMessages,
      presetGroups: editForm.presetGroups,
      greetings: editForm.greetings,
      defaultGreetingId: editForm.defaultGreetingId,
      displayPresetCount: editForm.displayPresetCount,
      parameters,
      llmThinkRules: editForm.llmThinkRules,
      richTextStyleOptions: editForm.richTextStyleOptions,
      tags: editForm.tags,
      category: editForm.category,
      virtualTimeConfig: editForm.virtualTimeConfig || undefined,
      regexConfig: editForm.regexConfig,
      interactionConfig: editForm.interactionConfig,
      worldbookIds: editForm.worldbookIds,
      worldbookSettings: editForm.worldbookSettings,
      assets: editForm.assets,
      assetGroups: editForm.assetGroups,
      toolCallConfig: editForm.toolCallConfig,
      knowledgeBaseConfig: editForm.knowledgeBaseConfig,
      knowledgeSettings: editForm.knowledgeSettings,
      extensionConfig: editForm.extensionConfig,
      quickActionSetIds: editForm.quickActionSetIds,
      variableConfig: editForm.variableConfig,
    },
    {
      ...options,
      agentId: options.overrideAgentId || localAgentId.value || undefined,
    }
  );

  if (!options.silent) {
    handleClose();
  }
};
</script>

<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="mode === 'edit' ? '编辑智能体' : '创建智能体'"
    width="90%"
    height="90vh"
  >
    <AgentEditor
      :modelValue="editForm"
      @update:modelValue="Object.assign(editForm, $event)"
      v-model:active-tab="activeTab"
      :initial-tab="initialTab"
      :initial-section="initialSection"
      :agent="currentEditingAgent"
      :mode="mode"
      :key="localAgentId || 'create'"
      @save="handleSave"
    />

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <template v-if="mode === 'edit'">
            <el-popover
              v-model:visible="agentListVisible"
              placement="top-start"
              :width="300"
              trigger="click"
              popper-class="mini-agent-list-popover"
            >
              <template #reference>
                <el-button :icon="Users" circle plain title="切换智能体" />
              </template>
              <MiniAgentList
                :currentAgentId="localAgentId"
                @switch="switchToAgent"
                @create="handleClose"
              />
            </el-popover>
            <div v-if="currentEditingAgent" class="current-editing-info">
              <Avatar
                :src="resolveAvatarPath(currentEditingAgent, 'agent') || ''"
                :name="currentEditingAgent.name"
                :size="24"
              />
              <span class="current-editing-label">
                正在编辑:
                <b>{{
                  currentEditingAgent.displayName || currentEditingAgent.name
                }}</b>
              </span>
            </div>
          </template>
        </div>
        <div class="footer-right">
          <el-button @click="handleClose">取消</el-button>
          <el-button type="primary" @click="handleSave()">
            {{ mode === "edit" ? "保存修改" : "立即创建" }}
          </el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.current-editing-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 4px;
}

.current-editing-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.current-editing-label b {
  color: var(--el-text-color-primary);
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>

<style>
.mini-agent-list-popover {
  padding: 0 !important;
}
.mini-agent-list-popover .el-popover__body {
  padding: 0;
}
</style>
