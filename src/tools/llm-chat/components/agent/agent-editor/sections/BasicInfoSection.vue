<script setup lang="ts">
import { inject, computed, markRaw } from "vue";
import AvatarSelector from "@/components/common/AvatarSelector.vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { AgentCategoryLabels } from "../../../../types";
import type { IconUpdatePayload } from "@/components/common/AvatarSelector.vue";
import { useAgentStore } from "../../../../stores/agentStore";
import type { SettingItem } from "@/types/settings-renderer";

const editForm = inject<any>("agent-edit-form");
const agent = inject<any>("agent-instance");
const agentStore = useAgentStore();

// 从所有 agent 中提取的不重复标签列表
const allTags = computed(() => {
  const tagSet = new Set<string>();
  agentStore.agents.forEach((a: any) => {
    a.tags?.forEach((tag: string) => tagSet.add(tag));
  });
  return Array.from(tagSet);
});

const handleIconUpdate = (payload: IconUpdatePayload) => {
  editForm.icon = payload.value;
};

const handleHistoryUpdate = (newHistory: string[]) => {
  editForm.avatarHistory = newHistory;
};

const basicInfoSettings = computed<SettingItem[]>(() => [
  {
    id: "name",
    label: "ID/名称",
    component: "ElInput",
    modelPath: "name",
    hint: "此名称将作为宏替换的 ID（如 {{ char }}），请使用简洁的名称。",
    keywords: "name id 名称",
    props: {
      placeholder: "输入智能体名称（用作 ID 和宏替换）",
      required: true,
    },
  },
  {
    id: "displayName",
    label: "显示名称",
    component: "ElInput",
    modelPath: "displayName",
    hint: "在界面上显示的名称。如果不填，则显示上面的 ID/名称。",
    keywords: "display name 显示名称",
    props: {
      placeholder: "UI 显示名称（可选）",
    },
  },
  {
    id: "agentVersion",
    label: "配置版本",
    component: "ElInput",
    modelPath: "agentVersion",
    hint: "智能体配置的版本号，用于识别和升级对比。",
    keywords: "version 版本",
    props: {
      placeholder: "例如 1.0.0",
    },
  },
  {
    id: "icon",
    label: "图标",
    component: markRaw(AvatarSelector),
    modelPath: "icon",
    hint: "",
    keywords: "icon avatar 图标 头像",
    props: {
      avatarHistory: editForm.avatarHistory,
      entityId: agent?.id,
      profileType: "agent",
      nameForFallback: editForm.name,
      onUpdateIcon: handleIconUpdate,
      onUpdateAvatarHistory: handleHistoryUpdate,
    },
  },
  {
    id: "category",
    label: "分类",
    component: "ElSelect",
    modelPath: "category",
    hint: "用于在侧边栏对智能体进行分组。",
    keywords: "category 分类",
    props: {
      placeholder: "选择分类（可选）",
      clearable: true,
      style: { width: "100%" },
    },
    options: Object.entries(AgentCategoryLabels).map(([value, label]) => ({
      label,
      value,
    })),
  },
  {
    id: "tags",
    label: "标签",
    component: "ElSelect",
    modelPath: "tags",
    hint: "为智能体添加标签，便于筛选和搜索。按 Enter 键创建新标签。",
    keywords: "tags 标签",
    props: {
      multiple: true,
      filterable: true,
      allowCreate: true,
      defaultFirstOption: true,
      placeholder: "输入或选择标签",
      style: { width: "100%" },
      reserveKeyword: false,
    },
    options: allTags.value.map((tag) => ({ label: tag, value: tag })),
  },
  {
    id: "description",
    label: "描述",
    component: "ElInput",
    modelPath: "description",
    hint: "",
    keywords: "description 描述",
    props: {
      type: "textarea",
      rows: 4,
      placeholder: "智能体的简短描述...",
    },
  },
]);
</script>

<template>
  <div class="agent-section">
    <SettingListRenderer
      :items="basicInfoSettings"
      :settings="editForm"
      @update:settings="Object.assign(editForm, $event)"
    />
  </div>
</template>

<style scoped></style>
