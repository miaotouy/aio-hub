<script setup lang="ts">
import { inject, computed, ref, defineAsyncComponent, onMounted, markRaw, h } from "vue";
import AgentPresetEditor from "@/tools/llm-chat/components/agent/AgentPresetEditor.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import WorldbookSelector from "@/tools/llm-chat/components/worldbook/WorldbookSelector.vue";
import QuickActionSelector from "@/tools/llm-chat/components/quick-action/QuickActionSelector.vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { useUserProfileStore } from "@/tools/llm-chat/stores/userProfileStore";
import { useKnowledgeBaseStore } from "@/tools/knowledge-base/stores/knowledgeBaseStore";
import type { SettingItem } from "@/types/settings-renderer";
import { ElButton } from "element-plus";

const QuickActionManagerDialog = defineAsyncComponent(
  () => import("@/tools/llm-chat/components/quick-action/QuickActionManagerDialog.vue")
);

const editForm = inject<any>("agent-edit-form");
const userProfileStore = useUserProfileStore();
const kbStore = useKnowledgeBaseStore();
const quickActionManagerVisible = ref(false);

// 初始化知识库设置
if (!editForm.knowledgeSettings) {
  editForm.knowledgeSettings = {
    defaultEngineId: "blender",
    defaultLimit: 5,
    maxRecallChars: 0,
    defaultMinScore: 0.3,
    embeddingModelId: "",
    resultTemplate: "---\n### 相关内容 (共 {count} 条)\n\n{items}\n---",
    emptyText: "（未检索到相关内容）",
    gateScanDepth: 3,
    aggregation: {
      contextWindow: 1,
      queryDecay: 0.8,
      enableCache: true,
      cacheSimilarityThreshold: 0.95,
      enableResultAggregation: true,
      resultDecay: 0.8,
      maxHistoryTurns: 3,
    },
  };
} else {
  // 补全缺失的深层配置
  if (!editForm.knowledgeSettings.aggregation) {
    editForm.knowledgeSettings.aggregation = {
      contextWindow: 1,
      queryDecay: 0.8,
      enableCache: true,
      cacheSimilarityThreshold: 0.95,
      enableResultAggregation: true,
      resultDecay: 0.8,
      maxHistoryTurns: 3,
    };
  }
  if (editForm.knowledgeSettings.gateScanDepth === undefined) {
    editForm.knowledgeSettings.gateScanDepth = 3;
  }
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
    const firstColonIndex = value.indexOf(":");
    const profileId = value.substring(0, firstColonIndex);
    const modelId = value.substring(firstColonIndex + 1);
    editForm.profileId = profileId;
    editForm.modelId = modelId;
    editForm.modelCombo = value;
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
      onUpdateModelValue: handleModelComboChange,
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
          { type: "primary", link: true, style: { fontSize: "12px" } },
          () => "管理用户档案"
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
          { type: "primary", link: true, style: { fontSize: "12px" } },
          () => "管理快捷操作"
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
          { type: "primary", link: true, style: { fontSize: "12px" } },
          () => "管理世界书"
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
    id: "kbDefaultEngine",
    label: "默认检索引擎",
    component: "ElSelect",
    modelPath: "knowledgeSettings.defaultEngineId",
    hint: "通过占位符引用知识库时使用的默认检索引擎",
    keywords: "knowledge engine 知识库 引擎",
    props: { style: { width: "100%" } },
    options: () =>
      kbStore.engines.map((e) => ({
        label: `${e.name} (${e.id})`,
        value: e.id,
        description: e.description,
      })),
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbDefaultLimit",
    label: "默认召回数量",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.defaultLimit",
    hint: "默认检索召回的知识片段数量",
    keywords: "knowledge limit 召回",
    props: {
      min: 1,
      max: 50,
      step: 1,
      controlsPosition: "right",
    },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbMaxRecallChars",
    label: "召回字数上限",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.maxRecallChars",
    hint: "检索结果的总字数上限，0 表示不限制。超出部分将被丢弃。",
    keywords: "knowledge char limit 字数",
    props: {
      min: 0,
      step: 100,
      controlsPosition: "right",
    },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbEmbeddingModel",
    label: "Embedding 模型",
    component: markRaw(LlmModelSelector),
    modelPath: "knowledgeSettings.embeddingModelId",
    hint: "用于向量检索的 Embedding 模型。如果不设置，将无法使用向量检索引擎。",
    keywords: "knowledge embedding model 向量 模型",
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbDefaultMinScore",
    label: "默认最低分数",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.defaultMinScore",
    hint: "低于此相关度分数的知识片段将被过滤",
    keywords: "knowledge score 分数",
    props: {
      min: 0,
      max: 1,
      step: 0.05,
      controlsPosition: "right",
    },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbResultTemplate",
    label: "结果模板",
    component: "ElInput",
    modelPath: "knowledgeSettings.resultTemplate",
    hint: "检索结果注入提示词的模板。支持变量: {kbName}, {content}, {key}, {score}",
    keywords: "knowledge template 模板",
    props: {
      type: "textarea",
      rows: 4,
      placeholder: "检索结果注入模板",
    },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbGateScanDepth",
    label: "门控扫描深度",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.gateScanDepth",
    hint: "标签门控 (gate) 模式下，扫描最近多少条消息以匹配关键词",
    keywords: "knowledge gate depth 深度",
    props: {
      min: 1,
      max: 20,
      step: 1,
      controlsPosition: "right",
    },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbContextWindow",
    label: "上下文窗口",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.aggregation.contextWindow",
    hint: "用于构建检索查询的最近用户消息数量",
    keywords: "knowledge context window 窗口",
    props: {
      min: 1,
      max: 10,
      step: 1,
      controlsPosition: "right",
    },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbEnableCache",
    label: "启用检索缓存",
    layout: "inline",
    component: "ElSwitch",
    modelPath: "knowledgeSettings.aggregation.enableCache",
    hint: "开启后，相似的查询将复用缓存结果",
    keywords: "knowledge cache 缓存",
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbCacheThreshold",
    label: "缓存相似度阈值",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.aggregation.cacheSimilarityThreshold",
    hint: "查询向量与缓存向量的余弦相似度高于此值时命中缓存",
    keywords: "knowledge cache threshold 阈值",
    props: { min: 0.8, max: 1, step: 0.01, controlsPosition: "right" },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbQueryDecay",
    label: "查询衰减因子",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.aggregation.queryDecay",
    hint: "多轮查询聚合时的权重衰减（1.0 表示不衰减）",
    keywords: "knowledge query decay 衰减",
    props: { min: 0.1, max: 1, step: 0.05, controlsPosition: "right" },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbEnableResultAggregation",
    label: "启用结果聚合",
    layout: "inline",
    component: "ElSwitch",
    modelPath: "knowledgeSettings.aggregation.enableResultAggregation",
    hint: "开启后，将聚合当前结果与历史轮次的结果",
    keywords: "knowledge aggregation 聚合",
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbResultDecay",
    label: "结果衰减因子",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.aggregation.resultDecay",
    hint: "历史检索结果在聚合时的分数衰减因子",
    keywords: "knowledge result decay 衰减",
    props: { min: 0.1, max: 1, step: 0.05, controlsPosition: "right" },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbMaxHistoryTurns",
    label: "最大聚合轮次",
    component: "SliderWithInput",
    modelPath: "knowledgeSettings.aggregation.maxHistoryTurns",
    hint: "结果聚合时保留的最大历史对话轮次",
    keywords: "knowledge history turns 轮次",
    props: {
      min: 1,
      max: 10,
      step: 1,
      controlsPosition: "right",
    },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
    },
  },
  {
    id: "kbEmptyText",
    label: "空结果提示",
    component: "ElInput",
    modelPath: "knowledgeSettings.emptyText",
    hint: "未检索到内容时的提示词",
    keywords: "knowledge empty 提示",
    props: {
      placeholder: "未检索到内容时的提示词",
    },
    groupCollapsible: {
      name: "knowledge-advanced",
      title: "知识库高级设置",
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
      modelId: computed(() => editForm.modelId),
      agentName: computed(() => editForm.name),
      agent: editForm,
      height: "300px",
    },
  },
]);

onMounted(() => {
  if (kbStore.engines.length === 0) {
    kbStore.loadEngines();
  }
});
</script>

<template>
  <div>
    <SettingListRenderer :items="personalitySettings" :settings="editForm" @action="handleAction" />

    <QuickActionManagerDialog v-model:visible="quickActionManagerVisible" />
  </div>
</template>

<style scoped></style>
