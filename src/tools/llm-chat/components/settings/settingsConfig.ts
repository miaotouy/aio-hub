import { h } from "vue";
import { Setting, Delete, Tickets, ChatDotRound, RefreshLeft } from "@element-plus/icons-vue";
import { ElButton, ElIcon } from "element-plus";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import type { SettingsSection } from "./settings-types";
import { availableVersions } from "@/tools/rich-text-renderer/store";

export const settingsConfig: SettingsSection[] = [
  {
    title: "界面偏好",
    icon: Setting,
    items: [
      {
        id: "showTimestamp",
        label: "显示时间戳",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.showTimestamp",
        hint: "在消息中显示发送时间",
        keywords: "ui time date 消息 发送时间",
      },
      {
        id: "showTokenCount",
        label: "显示 Token 统计",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.showTokenCount",
        hint: "显示消息的 Token 使用情况",
        keywords: "ui token usage 统计",
      },
      {
        id: "showModelInfo",
        label: "显示模型信息",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.showModelInfo",
        hint: "在消息中显示使用的模型",
        keywords: "ui model name 模型",
      },
      {
        id: "autoScroll",
        label: "自动滚动",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.autoScroll",
        hint: "新消息出现时自动滚动到底部",
        keywords: "ui scroll 滚动",
      },
      {
        id: "showMessageNavigator",
        label: "显示消息导航器",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.showMessageNavigator",
        hint: "在聊天区域左侧显示消息导航器",
        keywords: "ui navigator 导航",
      },
      {
        id: "fontSize",
        label: "字体大小 ({{ localSettings.uiPreferences.fontSize }}px)",
        component: "ElSlider",
        props: { min: 12, max: 20, step: 1, "format-tooltip": (val: number) => `${val}px` },
        modelPath: "uiPreferences.fontSize",
        hint: "",
        keywords: "ui font size 字体",
      },
      {
        id: "lineHeight",
        label: "行高 ({{ localSettings.uiPreferences.lineHeight }})",
        component: "ElSlider",
        props: { min: 1.2, max: 2.0, step: 0.1 },
        modelPath: "uiPreferences.lineHeight",
        hint: "",
        keywords: "ui line height 行高",
      },
      {
        id: "rendererVersion",
        label: "消息渲染器",
        component: "ElSelect",
        props: {
          placeholder: "选择渲染器版本",
          style: { width: "100%" },
        },
        options: availableVersions
          .filter((v) => v.enabled)
          .map((v) => ({
            label: v.name,
            value: v.version,
            tags: v.tags,
            description: v.description,
          })),
        modelPath: "uiPreferences.rendererVersion",
        hint: "选择消息内容的渲染引擎。将鼠标悬停在选项上可查看详细说明。",
        keywords: "ui renderer markdown parser 渲染器 解析器",
      },
    ],
  },
  {
    title: "消息管理",
    icon: Delete,
    items: [
      {
        id: "confirmBeforeDeleteMessage",
        label: "删除消息确认",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "messageManagement.confirmBeforeDeleteMessage",
        hint: "删除单条消息前显示确认对话框",
        keywords: "delete message 删除 消息 确认",
      },
      {
        id: "confirmBeforeDeleteSession",
        label: "删除会话确认",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "messageManagement.confirmBeforeDeleteSession",
        hint: "删除整个会话前显示确认对话框",
        keywords: "delete session 删除 会话 确认",
      },
      {
        id: "confirmBeforeClearAll",
        label: "清空所有确认",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "messageManagement.confirmBeforeClearAll",
        hint: "清空所有会话前显示确认对话框",
        keywords: "clear all 清空 确认",
      },
    ],
  },
  {
    title: "快捷键",
    icon: Tickets,
    items: [
      {
        id: "send",
        label: "发送消息",
        component: "ElRadioGroup",
        modelPath: "shortcuts.send",
        options: [
          { label: "Ctrl/Cmd + Enter", value: "ctrl+enter" },
          { label: "Enter", value: "enter" },
        ],
        hint: "换行键将自动设置为 {{ localSettings.shortcuts.send === 'ctrl+enter' ? 'Enter' : 'Shift + Enter' }}",
        keywords: "shortcut keybinding 发送 快捷键",
      },
    ],
  },
  {
    title: "话题命名",
    icon: ChatDotRound,
    items: [
      {
        id: "enabled",
        label: "启用话题命名",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "topicNaming.enabled",
        hint: "自动或手动为会话生成标题",
        keywords: "topic naming title 话题 命名",
      },
      {
        id: "modelIdentifier",
        label: "命名模型",
        component: LlmModelSelector,
        modelPath: "topicNaming.modelIdentifier",
        hint: "用于生成会话标题的 LLM 模型",
        keywords: "topic naming model 话题 命名 模型",
        visible: (settings) => settings.topicNaming.enabled,
      },
      {
        id: "prompt",
        label: "命名提示词",
        component: "ElInput",
        props: { type: "textarea", rows: 4, placeholder: "输入用于生成标题的提示词" },
        modelPath: "topicNaming.prompt",
        hint: "使用 <code>{context}</code> 占位符来指定对话内容的位置。<br />例如：<code>请为以下对话生成标题：\\n\\n{context}</code><br />如不使用占位符，对话内容将自动追加到提示词末尾。",
        keywords: "topic naming prompt 话题 命名 提示词",
        visible: (settings) => settings.topicNaming.enabled,
        slots: {
          append: () =>
            h(
              ElButton,
              {
                // @ts-ignore - This will be handled in the main component via a custom event
                onClick: () => {},
                size: "small",
                class: "reset-prompt-btn",
                title: "重置为默认提示词",
              },
              () => [h(ElIcon, null, () => h(RefreshLeft)), "重置"]
            ),
        },
      },
      {
        id: "temperature",
        label: "温度 ({{ localSettings.topicNaming.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1, "show-tooltip": true },
        modelPath: "topicNaming.temperature",
        hint: "",
        keywords: "topic naming temperature 话题 命名 温度",
        visible: (settings) => settings.topicNaming.enabled,
      },
      {
        id: "maxTokens",
        label: "输出上限",
        component: "SliderWithInput",
        props: { min: 10, max: 200, step: 10 },
        modelPath: "topicNaming.maxTokens",
        hint: "生成标题的最大 token 数",
        keywords: "topic naming max tokens 话题 命名 token",
        visible: (settings) => settings.topicNaming.enabled,
      },
      {
        id: "autoTriggerThreshold",
        label: "自动触发阈值",
        component: "SliderWithInput",
        props: { min: 1, max: 10, step: 1 },
        modelPath: "topicNaming.autoTriggerThreshold",
        hint: "当会话中用户消息数量达到此值时，自动生成标题",
        keywords: "topic naming trigger threshold 话题 命名 自动",
        visible: (settings) => settings.topicNaming.enabled,
      },
      {
        id: "contextMessageCount",
        label: "上下文消息数",
        component: "SliderWithInput",
        props: { min: 2, max: 20, step: 2 },
        modelPath: "topicNaming.contextMessageCount",
        hint: "生成标题时引用的最近消息数量",
        keywords: "topic naming context message 话题 命名 上下文",
        visible: (settings) => settings.topicNaming.enabled,
      },
    ],
  },
];
