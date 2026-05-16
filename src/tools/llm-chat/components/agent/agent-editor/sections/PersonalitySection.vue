<script setup lang="ts">
import { inject, computed, ref, defineAsyncComponent, markRaw, h } from "vue";
import AgentPresetEditor from "@/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { parseModelCombo } from "@/utils/modelIdUtils";
import WorldbookSelector from "@/tools/llm-chat/components/worldbook/WorldbookSelector.vue";
import QuickActionSelector from "@/tools/llm-chat/components/quick-action/QuickActionSelector.vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { useUserProfileStore } from "@/tools/llm-chat/stores/userProfileStore";
import type { SettingItem } from "@/types/settings-renderer";
import { ElButton } from "element-plus";

const QuickActionManagerDialog = defineAsyncComponent(
  () => import("@/tools/llm-chat/components/quick-action/QuickActionManagerDialog.vue"),
);

const editForm = inject<any>("agent-edit-form");
const userProfileStore = useUserProfileStore();
const quickActionManagerVisible = ref(false);

// 初始化设置
if (!editForm.quickActionSetIds) {
  editForm.quickActionSetIds = [];
}
if (!editForm.worldbookIds) {
  editForm.worldbookIds = [];
}
if (!editForm.worldbookSettings) {
  editForm.worldbookSettings = {
    disableRecursion: false,
    defaultScanDepth: 3,
  };
}

// 通过 inject 获取父组件的状态控制
const userProfileDialogVisible = inject<any>("user-profile-dialog-visible");
const worldbookManagerVisible = inject<any>("worldbook-manager-visible");

const handleAction = (actionName: string) => {
  if (actionName === "manageUserProfile" && userProfileDialogVisible) {
    userProfileDialogVisible.value = true;
  } else if (actionName === "manageQuickAction") {
    quickActionManagerVisible.value = true;
  } else if (actionName === "manageWorldbook" && worldbookManagerVisible) {
    worldbookManagerVisible.value = true;
  }
};

const handleModelComboChange = (value: string) => {
  if (value) {
    const [profileId, modelId] = parseModelCombo(value);
    editForm.profileId = profileId;
    editForm.modelId = modelId;
    editForm.modelCombo = value;
  }
};

const handleSettingsUpdate = (newSettings: any) => {
  const oldModelCombo = editForm.modelCombo;
  Object.assign(editForm, newSettings);
  // modelCombo 变化时同步解析 profileId 和 modelId
  if (newSettings.modelCombo && newSettings.modelCombo !== oldModelCombo) {
    handleModelComboChange(newSettings.modelCombo);
  }
};

const personalitySettings = computed<SettingItem[]>(() => [
  {
    id: "model",
    label: "模型",
    component: markRaw(LlmModelSelector),
    modelPath: "modelCombo",
    hint: "智能体使用的核心对话模型",
    keywords: "model 模型",
    props: {
      capabilities: { embedding: false, rerank: false },
    },
  },
  {
    id: "userProfile",
    label: "关联用户档案",
    component: "ElSelect",
    modelPath: "userProfileId",
    hint: "如果设置，则覆盖全局默认的用户档案",
    keywords: "user profile 用户 档案",
    props: {
      placeholder: "选择用户档案（可选）",
      clearable: true,
      style: { width: "100%" },
    },
    options: () => [
      { label: "无（使用全局设置）", value: "" },
      ...userProfileStore.enabledProfiles.map((p) => ({
        label: p.name,
        value: p.id,
      })),
    ],
    slots: {
      append: () =>
        h(
          ElButton,
          {
            type: "primary",
            link: true,
            style: {
              fontSize: "12px",
              whiteSpace: "nowrap",
              width: "auto",
              height: "auto",
              padding: "4px 8px",
              minWidth: "unset",
            },
          },
          () => "管理用户档案",
        ),
    },
    action: "manageUserProfile",
  },
  {
    id: "quickActionSetIds",
    label: "快捷操作",
    component: markRaw(QuickActionSelector),
    modelPath: "quickActionSetIds",
    hint: "关联的快捷操作组将在此智能体激活时显示在输入框工具栏。",
    keywords: "quick action 快捷操作",
    slots: {
      append: () =>
        h(
          ElButton,
          {
            type: "primary",
            link: true,
            style: {
              fontSize: "12px",
              whiteSpace: "nowrap",
              width: "auto",
              height: "auto",
              padding: "4px 8px",
              minWidth: "unset",
            },
          },
          () => "管理快捷操作",
        ),
    },
    action: "manageQuickAction",
  },
  {
    id: "worldbook",
    label: "关联世界书",
    component: markRaw(WorldbookSelector),
    modelPath: "worldbookIds",
    hint: "关联世界书后，当对话中匹配到关键字时，将自动注入相关设定。",
    keywords: "worldbook 世界书",
    slots: {
      append: () =>
        h(
          ElButton,
          {
            type: "primary",
            link: true,
            style: {
              fontSize: "12px",
              whiteSpace: "nowrap",
              width: "auto",
              height: "auto",
              padding: "4px 8px",
              minWidth: "unset",
            },
          },
          () => "管理世界书",
        ),
    },
    action: "manageWorldbook",
  },
  {
    id: "wbDisableRecursion",
    label: "禁用递归扫描",
    layout: "inline",
    component: "ElSwitch",
    modelPath: "worldbookSettings.disableRecursion",
    hint: "开启后，世界书条目触发后不再扫描其内容中的关键词",
    keywords: "worldbook recursion 递归",
    groupCollapsible: {
      name: "worldbook-advanced",
      title: "世界书高级设置",
    },
  },
  {
    id: "wbScanDepth",
    label: "默认扫描深度",
    component: "SliderWithInput",
    modelPath: "worldbookSettings.defaultScanDepth",
    hint: "扫描深度决定了回溯多少条历史消息进行关键词匹配",
    keywords: "worldbook depth 深度",
    props: {
      min: 0,
      max: 100,
      step: 1,
      controlsPosition: "right",
    },
    groupCollapsible: {
      name: "worldbook-advanced",
      title: "世界书高级设置",
    },
  },
  {
    id: "displayPresetCount",
    label: "显示数量",
    component: "SliderWithInput",
    modelPath: "displayPresetCount",
    hint: "在聊天界面显示的预设消息数量（0 表示不显示）。这些消息会作为开场白显示在聊天列表顶部。",
    keywords: "preset count 数量",
    props: {
      min: 0,
      max: 16,
      step: 1,
      controlsPosition: "right",
    },
  },
  {
    id: "presetMessages",
    label: "预设消息",
    component: markRaw(AgentPresetEditor),
    modelPath: "presetMessages",
    hint: "智能体的预设开场白或示例对话",
    keywords: "preset messages 预设消息",
    props: {
      modelId: editForm.modelId,
      agentName: editForm.name,
      agent: editForm,
      height: "300px",
    },
  },
]);
</script>

<template>
  <div>
    <SettingListRenderer
      :items="personalitySettings"
      :settings="editForm"
      @update:settings="handleSettingsUpdate"
      @action="handleAction"
    />

    <QuickActionManagerDialog v-model:visible="quickActionManagerVisible" />
  </div>
</template>

<style scoped></style>
