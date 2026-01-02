<script setup lang="ts">
import { reactive, watch, ref } from "vue";
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
}
interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", data: AgentEditData, options?: { silent?: boolean }): void;
}

const props = withDefaults(defineProps<Props>(), {
  agent: null,
  initialData: null,
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

// 编辑表单
const editForm = reactive(JSON.parse(JSON.stringify(defaultFormState)));

// 加载表单数据
const loadFormData = () => {
  // 1. 重置为默认值
  const defaults = JSON.parse(JSON.stringify(defaultFormState));
  Object.assign(editForm, defaults);

  // 确定数据源：编辑模式用 agent，创建模式用 initialData
  const sourceData = props.mode === "edit" && props.agent ? props.agent : props.initialData || {};

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
  if (props.mode === "edit" && props.agent?.id === targetAgent.id) {
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

  // 切换逻辑：
  // 由于 EditAgentDialog 的 agent 是由父组件通过 props 传入的，
  // 这里我们选择 selectAgent 来同步全局状态，父组件监听到 currentAgentId 变化后会更新 props.agent
  agentStore.selectAgent(targetAgent.id);
  agentListVisible.value = false;
};

// 监听对话框打开
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) loadFormData();
  },
  { immediate: true }
);

// 监听 agent 变化（用于在对话框打开状态下切换编辑对象）
watch(
  () => props.agent?.id,
  () => {
    if (props.visible) loadFormData();
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

  if (props.mode === "edit" && props.agent) {
    parameters = props.agent.parameters;
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
    options
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
    <AgentEditor v-model="editForm" :agent="agent" :mode="mode" @save="handleSave" />

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
                :currentAgentId="agent?.id"
                @switch="switchToAgent"
                @create="handleClose"
              />
            </el-popover>
            <div v-if="agent" class="current-editing-info">
              <Avatar
                :src="resolveAvatarPath(agent, 'agent') || ''"
                :name="agent.name"
                :size="24"
              />
              <span class="current-editing-label">
                正在编辑: <b>{{ agent.displayName || agent.name }}</b>
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
