<script setup lang="ts">
import { reactive, watch } from "vue";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent, ChatMessageNode, AgentEditData } from "../../types";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useChatSettings } from "../../composables/useChatSettings";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createDefaultChatRegexConfig } from "../../types";
import AgentEditor from "./agent-editor/AgentEditor.vue";
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

// 监听对话框打开
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) loadFormData();
  },
  { immediate: true }
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
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave()">
        {{ mode === "edit" ? "保存修改" : "立即创建" }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 样式已移至 AgentEditor */
</style>
