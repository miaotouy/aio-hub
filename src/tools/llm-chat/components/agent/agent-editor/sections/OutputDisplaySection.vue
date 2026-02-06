<script setup lang="ts">
import { inject, defineAsyncComponent, computed, markRaw } from "vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import type { SettingItem } from "@/types/settings-renderer";

const ChatRegexEditor = defineAsyncComponent(() => import("../../../common/ChatRegexEditor.vue"));
const LlmThinkRulesEditor = defineAsyncComponent(
  () => import("@/tools/rich-text-renderer/components/LlmThinkRulesEditor.vue")
);
const MarkdownStyleEditor = defineAsyncComponent(
  () => import("@/tools/rich-text-renderer/components/style-editor/MarkdownStyleEditor.vue")
);

const editForm = inject<any>("agent-edit-form");

const outputSettings = computed<SettingItem[]>(() => [
  {
    id: "sendButtonCreateBranch",
    label: "分支发送模式",
    layout: "inline",
    component: "ElSwitch",
    modelPath: "interactionConfig.sendButtonCreateBranch",
    hint: "开启后，点击消息中由 LLM 生成的交互按钮（如 RPG 选项）时，将从<strong>该消息下方创建新分支</strong>，而不是追加到对话末尾。这允许你随时回到原处尝试不同的选项。",
    keywords: "branch rpg interaction 分支 交互",
  },
  {
    id: "defaultToolCallCollapsed",
    label: "工具调用折叠",
    layout: "inline",
    component: "ElSwitch",
    modelPath: "defaultToolCallCollapsed",
    hint: "开启后，消息中的工具调用组件将默认处于折叠状态。",
    keywords: "tool call collapse 工具调用 折叠",
  },
  {
    id: "defaultMediaVolume",
    label: "媒体音量 ({{ localSettings.interactionConfig.defaultMediaVolume ?? 100 }}%)",
    component: "ElSlider",
    modelPath: "interactionConfig.defaultMediaVolume",
    hint: "调节该智能体输出音频（如 BGM）的初始音量百分比。最终音量 = 原始内容音量 * 全局音量 * 智能体音量。",
    keywords: "volume media audio 音量 媒体 音频",
    props: {
      min: 0,
      max: 100,
      step: 1,
    },
  },
  {
    id: "regexConfig",
    label: "文本替换规则",
    component: markRaw(ChatRegexEditor),
    modelPath: "regexConfig",
    hint: "配置该智能体专属的文本替换规则。支持正则表达式，用于对回复内容进行动态清洗或格式转换。",
    keywords: "regex replace 文本替换 正则",
    collapsible: {
      title: "点击展开编辑规则",
      name: "regex-editor",
      style: { minHeight: "400px" } as Record<string, string>,
    },
  },
  {
    id: "llmThinkRules",
    label: "思考块规则配置",
    component: markRaw(LlmThinkRulesEditor),
    modelPath: "llmThinkRules",
    hint: "配置 LLM 输出中的自定义思考过程识别规则，用于在对话中折叠显示思考内容。",
    keywords: "think rules 思考块 规则",
    collapsible: {
      title: "点击展开编辑思考块规则",
      name: "think-rules-editor",
    },
  },
  {
    id: "richTextStyleOptions",
    label: "回复样式自定义",
    component: markRaw(MarkdownStyleEditor),
    modelPath: "richTextStyleOptions",
    hint: "自定义该智能体回复内容的 Markdown 渲染样式（如粗体颜色、发光效果等）。",
    keywords: "style markdown css 样式 渲染",
    collapsible: {
      title: "点击展开编辑样式",
      name: "style-editor",
      style: { height: "600px" } as Record<string, string>,
      useLoading: true,
    },
  },
]);
</script>

<template>
  <div class="agent-section">
    <SettingListRenderer
      :items="outputSettings"
      :settings="editForm"
      @update:settings="Object.assign(editForm, $event)"
    />
  </div>
</template>

<style scoped></style>
