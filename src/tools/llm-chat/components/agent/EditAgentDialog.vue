<script setup lang="ts">
import { reactive, watch, ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent, ChatMessageNode, AgentEditData } from "../../types";
import BaseDialog from "@/components/common/BaseDialog.vue";
import Avatar from "@/components/common/Avatar.vue";
import { Users } from "lucide-vue-next";
import { useChatSettings } from "../../composables/useChatSettings";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useAgentStore } from "../../agentStore";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";
import { createDefaultChatRegexConfig } from "../../types";
import AgentEditor from "./agent-editor/AgentEditor.vue";
import MiniAgentList from "./MiniAgentList.vue";
import type { LlmThinkRule, RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";

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
}
interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", data: AgentEditData, options?: { silent?: boolean; agentId?: string }): void;
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
  name: "",
  displayName: "",
  description: "",
  icon: "",
  profileId: "",
  modelId: "",
  modelCombo: "", // 用于 LlmModelSelector 的组合值 (profileId:modelId)
  userProfileId: null as string | null, // 绑定的用户档案 ID
  presetMessages: [] as ChatMessageNode[],
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
  assets: [] as import("../../types").AgentAsset[],
  assetGroups: [] as import("../../types").AssetGroup[],
  virtualTimeConfig: {
    virtualBaseTime: new Date().toISOString(),
    realBaseTime: new Date().toISOString(),
    timeScale: 1.0,
  },
  interactionConfig: {
    sendButtonCreateBranch: false,
  },
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

// 加载表单数据
const loadFormData = () => {
  // 0. 初始化本地 ID (仅在编辑模式且 localAgentId 为空时，从 props 同步一次)
  if (props.mode === "edit" && !localAgentId.value && props.agent) {
    localAgentId.value = props.agent.id;
  }

  // 1. 重置为默认值
  const defaults = JSON.parse(JSON.stringify(defaultFormState));
  Object.assign(editForm, defaults);

  // 确定数据源：编辑模式用当前编辑的对象，创建模式用 initialData
  const sourceData =
    props.mode === "edit" && currentEditingAgent.value
      ? currentEditingAgent.value
      : props.initialData || {};

  // 2. 动态合并数据
  for (const key of Object.keys(editForm)) {
    if (key in sourceData) {
      const val = (sourceData as any)[key];
      if (val !== undefined && val !== null) {
        if (typeof val === "object") {
          (editForm as any)[key] = JSON.parse(JSON.stringify(val));
        } else {
          (editForm as any)[key] = val;
        }
      }
    }
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

  // 虚拟时间
  if (!("virtualTimeConfig" in sourceData) || !sourceData.virtualTimeConfig) {
    editForm.virtualTimeConfig = {
      virtualBaseTime: new Date().toISOString(),
      realBaseTime: new Date().toISOString(),
      timeScale: 1.0,
    };
  }
};

const agentListVisible = ref(false);

// 切换编辑的智能体
const switchToAgent = (targetAgent: ChatAgent) => {
  if (localAgentId.value === targetAgent.id) {
    agentListVisible.value = false;
    return;
  }

  // 校验当前表单（复用保存逻辑的校验）
  if (!editForm.name.trim()) {
    customMessage.warning("当前正在编辑的智能体名称不能为空，请先修正后再切换");
    return;
  }

  // 先尝试保存当前的修改（静默）
  handleSave({ silent: true });

  // 切换逻辑
  if (props.syncToChat) {
    // 同步模式：直接切换全局选中的智能体
    agentStore.selectAgent(targetAgent.id);
  } else {
    // 解耦模式：仅更新内部追踪的 ID 并重新加载数据
    localAgentId.value = targetAgent.id;
    loadFormData();
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
      loadFormData();
    } else {
      // 关闭时重置本地 ID，确保下次打开时能重新同步
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
      loadFormData();
    }
  }
);

// 关闭对话框
const handleClose = () => {
  emit("update:visible", false);
};

// 保存智能体
const handleSave = (options: { silent?: boolean } = {}) => {
  if (!editForm.name.trim()) {
    customMessage.warning("智能体名称不能为空");
    return;
  }

  if (!editForm.profileId || !editForm.modelId) {
    customMessage.warning("请选择模型");
    return;
  }

  let parameters: ChatAgent["parameters"] = { temperature: 0.7, maxTokens: 8192 };

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
      description: editForm.description,
      icon: editForm.icon,
      profileId: editForm.profileId,
      modelId: editForm.modelId,
      userProfileId: editForm.userProfileId,
      presetMessages: editForm.presetMessages,
      displayPresetCount: editForm.displayPresetCount,
      parameters,
      llmThinkRules: editForm.llmThinkRules,
      richTextStyleOptions: editForm.richTextStyleOptions,
      tags: editForm.tags,
      category: editForm.category,
      virtualTimeConfig: editForm.virtualTimeConfig,
      regexConfig: editForm.regexConfig,
      interactionConfig: editForm.interactionConfig,
      worldbookIds: editForm.worldbookIds,
      worldbookSettings: editForm.worldbookSettings,
      assets: editForm.assets,
      assetGroups: editForm.assetGroups,
    },
    {
      ...options,
      agentId: localAgentId.value || undefined,
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
      v-model="editForm"
      :agent="currentEditingAgent"
      :mode="mode"
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
                正在编辑: <b>{{ currentEditingAgent.displayName || currentEditingAgent.name }}</b>
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
