import {
  Zap,
  Bell,
  LayoutDashboard,
} from "lucide-vue-next";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import type { SettingsSection } from "@/types/settings-renderer";
import type { MediaGeneratorSettings } from "./types";

/**
 * 默认媒体生成器全局设置
 */
export const DEFAULT_MEDIA_GENERATOR_SETTINGS: MediaGeneratorSettings = {
  autoCleanCompleted: false,
  autoOpenAsset: true,
  maxConcurrentTasks: 3,
  enableNotifications: true,
  topicModelCombo: "",
};

/**
 * 媒体生成器设置配置渲染规范
 */
export const mediaGeneratorSettingsConfig: SettingsSection<MediaGeneratorSettings>[] = [
  {
    title: "AI 模型配置",
    icon: LayoutDashboard,
    items: [
      {
        id: "topicModelCombo",
        label: "话题生成模型",
        component: LlmModelSelector,
        modelPath: "topicModelCombo",
        hint: "用于生成媒体话题、描述和优化提示词的语言模型",
        keywords: "topic model 话题 模型 llm",
      },
      {
        id: "autoOpenAsset",
        label: "生成后自动打开",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "autoOpenAsset",
        hint: "媒体生成成功后，自动在查看器中打开结果",
        keywords: "auto open 自动 打开",
      },
    ],
  },
  {
    title: "任务与并发",
    icon: Zap,
    items: [
      {
        id: "maxConcurrentTasks",
        label: "最大并发任务数 ({{ localSettings.maxConcurrentTasks }})",
        component: "SliderWithInput",
        props: { min: 1, max: 10, step: 1 },
        modelPath: "maxConcurrentTasks",
        hint: "同时进行的生成任务数量",
        keywords: "concurrent task 并发 任务",
      },
      {
        id: "autoCleanCompleted",
        label: "自动清理已完成任务",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "autoCleanCompleted",
        hint: "会话结束后或任务完成一段时间后自动从列表中移除",
        keywords: "auto clean 自动 清理",
      },
    ],
  },
  {
    title: "通知设置",
    icon: Bell,
    items: [
      {
        id: "enableNotifications",
        label: "启用任务通知",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "enableNotifications",
        hint: "当生成任务完成或出错时，发送系统通知",
        keywords: "notification 通知",
      },
    ],
  },
];