import {
  Zap,
  Bell,
  LayoutDashboard,
  Wand2,
  PenTool,
} from "lucide-vue-next";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import type { SettingsSection } from "@/types/settings-renderer";
import type { MediaGeneratorSettings } from "./types";

/**
 * 预设提示词库
 */
export const SUGGESTED_PROMPTS = [
  "一个在霓虹灯下的赛博朋克城市",
  "唯美的二次元少女，樱花飘落",
  "壮阔的雪山日出，电影级光效",
  "深海中的亚特兰蒂斯遗迹，发光生物",
  "复古未来主义的太空站，土星环背景",
  "蒸汽朋克风格的空中飞艇，云层穿梭",
  "森林深处的精灵小屋，萤火虫点点",
  "极简主义的沙漠建筑，长长的投影",
  "浮世绘风格的巨浪与富士山",
  "赛博朋克风格的街头小吃摊",
  "梦幻的云端城堡，彩虹桥连接",
  "荒废的后启示录风格图书馆",
  "宏伟的中世纪大教堂，彩色玻璃窗",
  "极地冰原上的科研基地，极光闪耀",
  "维多利亚时代的实验室，充满齿轮与蒸汽",
  "充满生机的热带雨林，隐藏的瀑布",
  "月球表面的未来城市，地球升起",
  "古老的中国园林，烟雨朦胧",
  "机械心脏，精密齿轮与发光电线",
  "猫咪咖啡馆，阳光洒在午睡的猫身上",
];

/**
 * 默认媒体生成器全局设置
 */
export const DEFAULT_MEDIA_GENERATOR_SETTINGS: MediaGeneratorSettings = {
  autoCleanCompleted: false,
  autoOpenAsset: true,
  maxConcurrentTasks: 3,
  enableNotifications: true,
  topicNaming: {
    modelCombo: "",
    prompt: "请根据以下媒体生成任务的内容，生成一个简短的标题（不超过10个字）：\n\n{context}",
    temperature: 0.4,
    maxTokens: 20,
  },
  promptOptimization: {
    modelCombo: "",
    prompt: "你是一个专业的 AI 绘画提示词专家。请将用户输入的简单描述扩展并优化为高质量的提示词。\n\n要求：\n1. 保持用户原意，但增加细节、艺术风格、光效、构图等描述。\n2. 使用英文输出提示词。\n3. 只输出优化后的提示词，不要有任何解释。\n\n用户输入：\n{text}",
    temperature: 0.8,
    maxTokens: 800,
  },
};

/**
 * 媒体生成器设置配置渲染规范
 */
export const mediaGeneratorSettingsConfig: SettingsSection<MediaGeneratorSettings>[] = [
  {
    title: "界面与交互",
    icon: LayoutDashboard,
    items: [
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
    title: "话题命名",
    icon: PenTool,
    items: [
      {
        id: "topicModelCombo",
        label: "命名模型",
        component: LlmModelSelector,
        modelPath: "topicNaming.modelCombo",
        hint: "用于生成会话标题的语言模型",
        keywords: "topic model 话题 模型 llm",
      },
      {
        id: "topicPrompt",
        label: "命名提示词",
        component: "PromptEditor",
        props: {
          rows: 4,
          placeholder: "输入用于生成标题的提示词",
          defaultValue: DEFAULT_MEDIA_GENERATOR_SETTINGS.topicNaming.prompt,
        },
        modelPath: "topicNaming.prompt",
        hint: "使用 {context} 占位符指定内容位置",
        keywords: "topic prompt 提示词",
      },
      {
        id: "topicTemperature",
        label: "温度 ({{ localSettings.topicNaming.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1 },
        modelPath: "topicNaming.temperature",
        hint: "",
        keywords: "topic temperature 温度",
      },
    ],
  },
  {
    title: "提示词优化",
    icon: Wand2,
    items: [
      {
        id: "optModelCombo",
        label: "优化模型",
        component: LlmModelSelector,
        modelPath: "promptOptimization.modelCombo",
        hint: "用于对用户输入的提示词进行润色和扩充的语言模型",
        keywords: "prompt optimization model 提示词 优化 模型",
      },
      {
        id: "optPrompt",
        label: "优化提示词",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入用于优化提示词的系统提示词",
          defaultValue: DEFAULT_MEDIA_GENERATOR_SETTINGS.promptOptimization.prompt,
        },
        modelPath: "promptOptimization.prompt",
        hint: "使用 {text} 占位符代表用户输入的原始提示词",
        keywords: "prompt optimization prompt 提示词 优化",
      },
      {
        id: "optTemperature",
        label: "温度 ({{ localSettings.promptOptimization.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1 },
        modelPath: "promptOptimization.temperature",
        hint: "",
        keywords: "prompt optimization temperature 温度",
      },
      {
        id: "optMaxTokens",
        label: "输出上限",
        component: "SliderWithInput",
        props: { min: 50, max: 2000, step: 50 },
        modelPath: "promptOptimization.maxTokens",
        hint: "优化后提示词的最大 token 数",
        keywords: "prompt optimization max tokens 提示词 优化 上限",
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