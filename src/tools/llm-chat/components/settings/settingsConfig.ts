import { defineAsyncComponent } from "vue";
import {
  Settings2,
  Bot,
  MessageSquareMore,
  Keyboard,
  PenTool,
  TerminalSquare,
  Palette,
  Globe,
  Regex,
  Languages,
  FileText,
  Network,
} from "lucide-vue-next";
import type { SettingsSection } from "./settings-types";
import { availableVersions } from "@/tools/rich-text-renderer/store";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { DEFAULT_SETTINGS } from "../../composables/useChatSettings";

// 异步加载大型业务组件
const MarkdownStyleEditor = defineAsyncComponent(() =>
  import(
    "@/tools/rich-text-renderer/components/style-editor/MarkdownStyleEditor.vue"
  )
);
const ChatRegexEditor = defineAsyncComponent(() =>
  import("@/tools/llm-chat/components/common/ChatRegexEditor.vue")
);
const PipelineConfig = defineAsyncComponent(() =>
  import("./PipelineConfig.vue")
);

export const settingsConfig: SettingsSection[] = [
  {
    title: "模型设置",
    icon: Bot,
    items: [
      {
        id: "defaultModel",
        label: "默认模型",
        component: LlmModelSelector,
        modelPath: "modelPreferences.defaultModel",
        hint: "新建智能体或会话时默认使用的模型，作为兜底选项",
        keywords: "model default 默认 模型",
        defaultValue: "",
      },
    ],
  },
  {
    title: "界面偏好",
    icon: Settings2,
    items: [
      {
        id: "showModelSelector",
        label: "显示模型选择器",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.showModelSelector",
        hint: "在头部显示当前模型并允许切换",
        keywords: "ui model selector switch 模型 选择 切换",
      },
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
        id: "fontSize",
        label: "字体大小 ({{ localSettings.uiPreferences.fontSize }}px)",
        component: "ElSlider",
        props: {
          min: 12,
          max: 20,
          step: 1,
          "format-tooltip": (val: number) => `${val}px`,
        },
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
        id: "enableContentWidthLimit",
        label: "限制内容宽度",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.enableContentWidthLimit",
        hint: "启用后，消息内容将居中显示并限制最大宽度",
        keywords: "ui width limit 宽度 限制 居中",
      },
      {
        id: "contentMaxWidth",
        label:
          "内容最大宽度 ({{ localSettings.uiPreferences.contentMaxWidth }}px)",
        component: "ElSlider",
        props: {
          min: 300,
          max: 2600,
          step: 50,
          "format-tooltip": (val: number) => `${val}px`,
        },
        modelPath: "uiPreferences.contentMaxWidth",
        hint: "设置消息内容区域的最大宽度",
        keywords: "ui width max 宽度 最大",
        visible: (settings) => settings.uiPreferences.enableContentWidthLimit,
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
        id: "autoSwitchAgentOnSessionChange",
        label: "自动切换智能体",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.autoSwitchAgentOnSessionChange",
        hint: "切换会话时，自动切换到该会话使用的智能体",
        keywords: "ui agent switch session 智能体 切换 会话",
      },
      {
        id: "headerBackgroundOpacity",
        label:
          "头部背景不透明度 ({{ (localSettings.uiPreferences.headerBackgroundOpacity * 100).toFixed(0) }}%)",
        component: "ElSlider",
        props: { min: 0, max: 1, step: 0.05 },
        modelPath: "uiPreferences.headerBackgroundOpacity",
        hint: "控制聊天区域顶部的透明度，独立于全局设置",
        keywords: "ui header background opacity 透明度",
      },
      {
        id: "headerBlurIntensity",
        label:
          "头部背景模糊 ({{ localSettings.uiPreferences.headerBlurIntensity }}px)",
        component: "ElSlider",
        props: {
          min: 0,
          max: 50,
          step: 1,
          "format-tooltip": (val: number) => `${val}px`,
        },
        modelPath: "uiPreferences.headerBlurIntensity",
        hint: "控制聊天区域顶部的背景模糊强度，独立于全局设置",
        keywords: "ui header blur 模糊",
      },
      {
        id: "enableDetachableHandle",
        label: "允许组件分离",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.enableDetachableHandle",
        hint: "是否在组件（如输入框、对话区）上显示分离手柄。关闭后，非分离状态下将隐藏手柄。",
        keywords: "ui detach handle 分离 手柄",
      },
      {
        id: "showWallpaperInDetachedMode",
        label: "分离模式下显示壁纸",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.showWallpaperInDetachedMode",
        hint: "当聊天窗口分离时，在其内部显示全局壁纸",
        keywords: "ui wallpaper background detached 分离 壁纸 背景",
      },
      {
        id: "enableEnterAnimation",
        label: "节点进入动画",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.enableEnterAnimation",
        hint: "为渲染的消息节点（如代码块、列表）启用淡入动画",
        keywords: "ui animation effect 动画 特效",
      },
      {
        id: "defaultRenderHtml",
        label: "自动渲染 HTML",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.defaultRenderHtml",
        hint: "检测到 HTML 代码块时自动开启预览模式",
        keywords: "ui html render preview 预览 渲染",
      },
      {
        id: "seamlessMode",
        label: "HTML 预览无边框模式",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.seamlessMode",
        hint: "开启后，HTML 预览将移除外框和头部，直接嵌入消息流中",
        keywords: "ui html seamless preview 无缝 预览",
      },
      {
        id: "showPerformanceMetrics",
        label: "显示性能指标",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "uiPreferences.showPerformanceMetrics",
        hint: "显示生成速度(t/s)和首字延迟(TTFT)",
        keywords: "ui performance metrics speed latency 性能 速度 延迟",
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
        hint: "",
        keywords: "ui renderer markdown parser 渲染器 解析器",
      },
      {
        id: "rendererThrottleMs",
        label:
          "渲染节流 ({{ localSettings.uiPreferences.rendererThrottleMs }}ms)",
        component: "ElSlider",
        props: {
          min: 16,
          max: 512,
          step: 8,
          "format-tooltip": (val: number) => `${val}ms`,
        },
        modelPath: "uiPreferences.rendererThrottleMs",
        hint: "控制消息渲染的节流时间，数值越小越实时，但性能开销越大",
        keywords: "ui renderer throttle 节流 性能",
      },{
        id: "virtualListOverscan",
        label:
          "消息列表渲染 ({{ localSettings.uiPreferences.virtualListOverscan }}条)",
        component: "ElSlider",
        props: {
          min: 5,
          max: 100,
          step: 5,
          "format-tooltip": (val: number) => `${val}条`,
        },
        modelPath: "uiPreferences.virtualListOverscan",
        hint: "预渲染消息列表可视区域外的消息数量，数值越大滚动越平滑，但内存占用越高。如果遇到长消息导致滚动条抖动，可适当增大此值。",
        keywords: "ui virtual list overscan 虚拟 消息 列表 预渲染 滚动 性能",
      },
    ],
  },
  {
    title: "消息管理",
    icon: MessageSquareMore,
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
    icon: Keyboard,
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
      {
        id: "undo",
        label: "撤销操作",
        component: "ElRadioGroup",
        modelPath: "shortcuts.undo",
        options: [
          { label: "Ctrl/Cmd + Z", value: "ctrl+z" },
          { label: "Alt + Z", value: "alt+z" },
          { label: "Ctrl/Cmd + U", value: "ctrl+u" },
          { label: "Alt + Backspace", value: "alt+backspace" },
          { label: "无", value: "none" },
        ],
        hint: "在高级关系图中撤销上一步操作。",
        keywords: "shortcut keybinding graph undo aoe 快捷键 关系图 撤销",
      },
      {
        id: "redo",
        label: "重做操作",
        component: "ElRadioGroup",
        modelPath: "shortcuts.redo",
        options: [
          { label: "Ctrl/Cmd + Shift + Z", value: "ctrl+shift+z" },
          { label: "Ctrl/Cmd + Y", value: "ctrl+y" },
          { label: "Alt + Shift + Z", value: "alt+shift+z" },
          { label: "Ctrl/Cmd + Shift + Y", value: "ctrl+shift+y" },
          { label: "Alt + Shift + Backspace", value: "alt+shift+backspace" },
          { label: "无", value: "none" },
        ],
        hint: "在高级关系图中重做已撤销的操作。",
        keywords: "shortcut keybinding graph redo aoe 快捷键 关系图 重做",
      },
      {
        id: "dragSubtree",
        label: "拖拽子树修饰键",
        component: "ElRadioGroup",
        modelPath: "graphViewShortcuts.dragSubtree",
        options: [
          { label: "Alt", value: "alt" },
          { label: "Shift", value: "shift" },
          { label: "Ctrl/Cmd", value: "ctrl" },
          { label: "无", value: "none" },
        ],
        hint: "在高级关系图中，按住此键拖拽节点可移动整个子树。",
        keywords: "shortcut keybinding graph drag aoe 快捷键 关系图 拖拽 子树",
      },
      {
        id: "graftSubtree",
        label: "嫁接子树修饰键",
        component: "ElRadioGroup",
        modelPath: "graphViewShortcuts.graftSubtree",
        options: [
          { label: "Alt", value: "alt" },
          { label: "Shift", value: "shift" },
          { label: "Ctrl/Cmd", value: "ctrl" },
          { label: "无", value: "none" },
        ],
        hint: "在高级关系图中，按住此键进行连线可嫁接整个子树。",
        keywords: "shortcut keybinding graph graft aoe 快捷键 关系图 嫁接 子树",
      },
    ],
  },
  {
    title: "话题命名",
    icon: PenTool,
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
        defaultValue: "",
      },
      {
        id: "prompt",
        label: "命名提示词",
        component: "PromptEditor",
        props: {
          rows: 4,
          placeholder: "输入用于生成标题的提示词",
          defaultValue: DEFAULT_SETTINGS.topicNaming.prompt,
        },
        modelPath: "topicNaming.prompt",
        hint: "使用 <code>{context}</code> 占位符来指定对话内容的位置。<br />例如：<code>请为以下对话生成标题：\\n\\n{context}</code><br />如不使用占位符，对话内容将自动追加到提示词末尾。",
        keywords: "topic naming prompt 话题 命名 提示词",
        visible: (settings) => settings.topicNaming.enabled,
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
  {
    title: "翻译助手",
    icon: Languages,
    items: [
      {
        id: "translationEnabled",
        label: "启用翻译功能",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "translation.enabled",
        hint: "开启后，可在消息菜单和输入框中使用翻译功能",
        keywords: "translation enable 翻译 启用",
      },
      {
        id: "transModel",
        label: "翻译模型",
        component: LlmModelSelector,
        modelPath: "translation.modelIdentifier",
        hint: "用于执行翻译任务的 LLM 模型",
        keywords: "translation model 翻译 模型",
        visible: (settings) => settings.translation.enabled,
        defaultValue: "",
      },
      {
        id: "transTargetLangList",
        label: "常用语言列表",
        component: "ElSelect",
        props: {
          multiple: true,
          filterable: true,
          allowCreate: true,
          defaultFirstOption: true,
          placeholder: "输入语言并回车添加",
        },
        modelPath: "translation.targetLangList",
        hint: "设置常用的翻译目标语言列表",
        keywords: "translation languages list 翻译 语言列表",
        visible: (settings) => settings.translation.enabled,
      },
      {
        id: "transMessageTargetLang",
        label: "消息目标语言",
        component: "ElSelect",
        props: {
          placeholder: "选择消息默认目标语言",
        },
        modelPath: "translation.messageTargetLang",
        hint: "翻译接收到的消息时默认使用的目标语言（通常是母语）",
        keywords: "translation target language message 翻译 目标语言 消息",
        visible: (settings) => settings.translation.enabled,
        options: (settings) =>
          settings.translation.targetLangList.map((lang) => ({
            label: lang,
            value: lang,
          })),
      },
      {
        id: "transInputTargetLang",
        label: "输入目标语言",
        component: "ElSelect",
        props: {
          placeholder: "选择输入框默认目标语言",
        },
        modelPath: "translation.inputTargetLang",
        hint: "翻译输入框内容时默认使用的目标语言（通常是外语）",
        keywords: "translation target language input 翻译 目标语言 输入",
        visible: (settings) => settings.translation.enabled,
        options: (settings) =>
          settings.translation.targetLangList.map((lang) => ({
            label: lang,
            value: lang,
          })),
      },
      {
        id: "transPrompt",
        label: "翻译提示词",
        component: "PromptEditor",
        props: {
          rows: 4,
          placeholder: "输入翻译提示词",
          defaultValue: DEFAULT_SETTINGS.translation.prompt,
        },
        modelPath: "translation.prompt",
        hint: "使用 <code>{text}</code> 代表原文，<code>{targetLang}</code> 代表目标语言，<code>{thinkTags}</code> 代表需要保护的思考块标签（XML 标签本身保持不变，标签内的内容会被翻译）。<br />例如：<code>Translate to {targetLang}:\\n\\n{text}</code>",
        keywords: "translation prompt 翻译 提示词",
        visible: (settings) => settings.translation.enabled,
      },
      {
        id: "transTemperature",
        label: "温度 ({{ localSettings.translation.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1, "show-tooltip": true },
        modelPath: "translation.temperature",
        hint: "较低的温度会产生更确定性的翻译结果",
        keywords: "translation temperature 翻译 温度",
        visible: (settings) => settings.translation.enabled,
      },
      {
        id: "transMaxTokens",
        label: "输出上限",
        component: "SliderWithInput",
        props: { min: 0, max: 65536, step: 1024 },
        modelPath: "translation.maxTokens",
        hint: "翻译结果的最大 token 数",
        keywords: "translation max tokens 翻译 上限",
        visible: (settings) => settings.translation.enabled,
      },
    ],
  },
  {
    title: "附件转写",
    icon: FileText,
    items: [
      // 1. 全局开关与策略
      {
        id: "transEnabled",
        label: "启用转写功能",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "transcription.enabled",
        hint: "开启后，可对图片/音频/PDF附件进行转写，提取文本内容",
        keywords: "transcription enable 启用 转写 pdf",
      },
      {
        id: "transStrategy",
        label: "转写触发策略",
        component: "ElSelect",
        modelPath: "transcription.strategy",
        options: [
          {
            label: "智能判断 (Smart)",
            value: "smart",
            description:
              "根据当前模型能力判断：模型支持该附件类型则直接发送，不支持则自动转写",
          },
          {
            label: "总是转写 (Always)",
            value: "always",
            description: "无论模型是否支持，都强制转写所有支持的附件",
          },
        ],
        hint: "控制何时触发附件转写功能",
        keywords: "transcription strategy 策略 触发",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transForceAfter",
        label:
          "强制转写阈值 ({{ localSettings.transcription.forceTranscriptionAfter }}条)",
        component: "SliderWithInput",
        props: {
          min: 0,
          max: 50,
          step: 1,
          "format-tooltip": (val: number) => (val > 0 ? `倒数${val}条后` : "不启用"),
        },
        modelPath: "transcription.forceTranscriptionAfter",
        hint: "在智能模式下，强制转写早于最新 N 条消息的附件。0 表示不启用。",
        keywords: "transcription force smart 强制 智能",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.strategy === "smart",
      },
      {
        id: "transAutoStartOnImport",
        label: "导入时自动开始",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "transcription.autoStartOnImport",
        hint: "附件导入时，根据上述策略自动开始转写任务（利用编辑时间后台处理）",
        keywords: "transcription auto import 自动 导入",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transSendBehavior",
        label: "发送行为",
        component: "ElSelect",
        modelPath: "transcription.sendBehavior",
        options: [
          {
            label: "等待转写完成再发送",
            value: "wait_before_send",
            description:
              "点击发送后，等待所有转写任务完成后再构建消息发送（消息在转写期间不进入历史）",
          },
          {
            label: "先发送再等待 (推荐)",
            value: "send_and_wait",
            description:
              "点击发送后立即上屏，转写在后台进行，完成后自动更新消息并请求 AI 回复",
          },
        ],
        hint: "控制发送带有转写任务的消息时的交互行为",
        keywords: "transcription send behavior 发送 行为",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transMaxConcurrentTasks",
        label:
          "最大并发任务数 ({{ localSettings.transcription.maxConcurrentTasks }})",
        component: "ElSlider",
        props: {
          min: 1,
          max: 15,
          step: 1,
          "format-tooltip": (val: number) => `${val}个`,
        },
        modelPath: "transcription.maxConcurrentTasks",
        hint: "同时进行的转写任务数量，建议不要设置过高以免影响性能",
        keywords: "transcription concurrent task 并发 任务",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transExecutionDelay",
        label:
          "任务执行延迟 ({{ localSettings.transcription.executionDelay }}ms)",
        component: "ElSlider",
        props: {
          min: 0,
          max: 10000,
          step: 100,
          "format-tooltip": (val: number) => `${val}ms`,
        },
        modelPath: "transcription.executionDelay",
        hint: "每个任务开始前的等待时间，用于控制请求频率，避免触发 API 速率限制 (429 错误)",
        keywords: "transcription delay rate limit 延迟 速率",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transMaxRetries",
        label: "最大重试次数 ({{ localSettings.transcription.maxRetries }})",
        component: "ElSlider",
        props: {
          min: 0,
          max: 5,
          step: 1,
          "format-tooltip": (val: number) => `${val}次`,
        },
        modelPath: "transcription.maxRetries",
        hint: "转写失败时的自动重试次数",
        keywords: "transcription retry 重试",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transTimeout",
        label:
          "任务等待超时 ({{ (localSettings.transcription.timeout / 1000).toFixed(0) }}秒)",
        component: "ElSlider",
        props: {
          min: 30000,
          max: 600000,
          step: 1000,
          "format-tooltip": (val: number) => `${val / 1000}秒`,
        },
        modelPath: "transcription.timeout",
        hint: "转写任务的最大等待时间。在“等待发送”模式下，超时将直接发送原始附件；在“先发送”模式下，超时将停止后台等待并标记为超时。",
        keywords: "transcription timeout 超时",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transVideoEnableCompression",
        label: "启用视频压缩",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "transcription.video.enableCompression",
        hint: "开启后，当视频体积超过限制时，将尝试自动调整码率以满足体积要求（需配置 FFmpeg）。",
        keywords: "transcription video compression enable 启用 压缩",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transFFmpegPath",
        label: "FFmpeg 路径",
        component: "FileSelector",
        modelPath: "transcription.ffmpegPath",
        hint: "配置本地 FFmpeg 可执行文件路径以支持大视频压缩。未配置时将尝试直接上传原始视频。",
        keywords: "transcription ffmpeg path video 视频 路径",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.video.enableCompression,
        defaultValue: "",
        action: "selectFFmpegPath",
      },
      {
        id: "transVideoMaxDirectSize",
        label:
          "视频体积限制 ({{ localSettings.transcription.video.maxDirectSizeMB }}MB)",
        component: "SliderWithInput",
        props: {
          min: 1,
          max: 100,
          step: 1,
          "format-tooltip": (val: number) => `${val}MB`,
        },
        modelPath: "transcription.video.maxDirectSizeMB",
        hint: "视频的体积阈值。小于此大小直接上传；启用压缩后，超过此大小将尝试压缩至此体积以内。",
        keywords: "transcription video size limit 视频 大小 阈值 限制",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.video.enableCompression,
      },
      {
        id: "transVideoMaxFps",
        label:
          "视频帧率限制 ({{ localSettings.transcription.video.maxFps }} FPS)",
        component: "SliderWithInput",
        props: {
          min: 1,
          max: 60,
          step: 1,
          "format-tooltip": (val: number) => `${val} FPS`,
        },
        modelPath: "transcription.video.maxFps",
        hint: "限制视频的最大帧率。较低的帧率（如 5 FPS）可显著减小体积且通常不影响 AI 理解。",
        keywords: "transcription video fps frame rate 视频 帧率",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.video.enableCompression,
      },
      {
        id: "transVideoMaxResolution",
        label:
          "视频尺寸限制 ({{ localSettings.transcription.video.maxResolution }}p)",
        component: "SliderWithInput",
        props: {
          min: 360,
          max: 2160,
          step: 120,
          "format-tooltip": (val: number) => `${val}p`,
        },
        modelPath: "transcription.video.maxResolution",
        hint: "限制视频的最大短边尺寸（如 720p）。超过此尺寸的视频将被等比缩放。",
        keywords: "transcription video resolution size 视频 分辨率 尺寸",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.video.enableCompression,
      },
      {
        id: "transEnableTypeSpecific",
        label: "启用分类型配置",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "transcription.enableTypeSpecificConfig",
        hint: "开启后，可分别为图片和音频设置不同的模型和提示词",
        keywords: "transcription specific type 分类 配置",
        visible: (settings) => settings.transcription.enabled,
      },

      // 2. 通用配置 (当 transEnableTypeSpecific 为 false 时显示)
      {
        id: "transModel",
        label: "通用转写模型",
        component: LlmModelSelector,
        props: {
          capabilities: { vision: true },
        },
        modelPath: "transcription.modelIdentifier",
        hint: "用于执行转写任务的多模态模型（推荐使用 gemini-flash-latest 或 GPT-4o）",
        keywords: "transcription model 转写 模型",
        visible: (settings) =>
          settings.transcription.enabled &&
          !settings.transcription.enableTypeSpecificConfig,
        defaultValue: "",
      },
      {
        id: "transCustomPrompt",
        label: "通用 Prompt",
        component: "PromptEditor",
        props: {
          rows: 4,
          placeholder: "输入自定义转写提示词",
          defaultValue: DEFAULT_SETTINGS.transcription.customPrompt,
        },
        modelPath: "transcription.customPrompt",
        hint: "用于指导模型如何转写附件内容。",
        keywords: "transcription prompt 提示词",
        visible: (settings) =>
          settings.transcription.enabled &&
          !settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transTemperature",
        label: "温度 ({{ localSettings.transcription.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1, "show-tooltip": true },
        modelPath: "transcription.temperature",
        hint: "较低的温度会产生更确定性的转写结果",
        keywords: "transcription temperature 转写 温度",
        visible: (settings) =>
          settings.transcription.enabled &&
          !settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transMaxTokens",
        label: "输出上限",
        component: "SliderWithInput",
        props: { min: 0, max: 8192, step: 512 },
        modelPath: "transcription.maxTokens",
        hint: "转写结果的最大 token 数",
        keywords: "transcription max tokens 转写 上限",
        visible: (settings) =>
          settings.transcription.enabled &&
          !settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transEnableSlicer",
        label: "图片智能切图",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "transcription.enableImageSlicer",
        hint: "开启后，对于长图将自动检测空白区域进行切分，提高识别准确率",
        keywords: "transcription slicer 图片 切图 智能",
        visible: (settings) => settings.transcription.enabled,
      },
      {
        id: "transSlicerAspectRatio",
        label:
          "切图长宽比阈值 ({{ localSettings.transcription.imageSlicerConfig.aspectRatioThreshold }}:1)",
        component: "SliderWithInput",
        props: { min: 1, max: 10, step: 0.5 },
        modelPath: "transcription.imageSlicerConfig.aspectRatioThreshold",
        hint: "图片的长宽比超过此值时才会触发智能切图",
        keywords: "transcription slicer aspect ratio 长宽比",
        visible: (settings) =>
          settings.transcription.enabled &&
          !!settings.transcription.enableImageSlicer,
      },
      // 3. 图片配置 (当 transEnableTypeSpecific 为 true 时显示)
      {
        id: "transImageModel",
        label: "图片转写模型",
        component: LlmModelSelector,
        props: {
          capabilities: { vision: true },
        },
        modelPath: "transcription.image.modelIdentifier",
        hint: "专门用于图片转写的模型",
        keywords: "transcription image model 图片 转写 模型",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
        defaultValue: "",
      },
      {
        id: "transImagePrompt",
        label: "图片 Prompt",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入图片转写提示词",
          defaultValue: DEFAULT_SETTINGS.transcription.image.customPrompt,
        },
        modelPath: "transcription.image.customPrompt",
        hint: "用于指导模型如何转写图片内容。",
        keywords: "transcription image prompt 图片 提示词",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transImageTemperature",
        label: "图片温度 ({{ localSettings.transcription.image.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1, "show-tooltip": true },
        modelPath: "transcription.image.temperature",
        hint: "较低的温度会产生更确定性的转写结果",
        keywords: "transcription image temperature 图片 转写 温度",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transImageMaxTokens",
        label: "图片输出上限",
        component: "SliderWithInput",
        props: { min: 0, max: 8192, step: 512 },
        modelPath: "transcription.image.maxTokens",
        hint: "图片转写结果的最大 token 数",
        keywords: "transcription image max tokens 图片 转写 上限",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },
      // 4. 音频配置 (当 transEnableTypeSpecific 为 true 时显示)
      {
        id: "transAudioModel",
        label: "音频转写模型",
        component: LlmModelSelector,
        props: {
          capabilities: { audio: true },
        },
        modelPath: "transcription.audio.modelIdentifier",
        hint: "专门用于音频转写的模型",
        keywords: "transcription audio model 音频 转写 模型",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
        defaultValue: "",
      },
      {
        id: "transAudioPrompt",
        label: "音频 Prompt",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入音频转写提示词",
          defaultValue: DEFAULT_SETTINGS.transcription.audio.customPrompt,
        },
        modelPath: "transcription.audio.customPrompt",
        hint: "用于指导模型如何转写音频内容。",
        keywords: "transcription audio prompt 音频 提示词",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transAudioTemperature",
        label: "音频温度 ({{ localSettings.transcription.audio.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1, "show-tooltip": true },
        modelPath: "transcription.audio.temperature",
        hint: "较低的温度会产生更确定性的转写结果",
        keywords: "transcription audio temperature 音频 转写 温度",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transAudioMaxTokens",
        label: "音频输出上限",
        component: "SliderWithInput",
        props: { min: 0, max: 8192, step: 512 },
        modelPath: "transcription.audio.maxTokens",
        hint: "音频转写结果的最大 token 数",
        keywords: "transcription audio max tokens 音频 转写 上限",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },

      // 5. 视频配置 (当 transEnableTypeSpecific 为 true 时显示)
      {
        id: "transVideoModel",
        label: "视频转写模型",
        component: LlmModelSelector,
        props: {
          capabilities: { video: true },
        },
        modelPath: "transcription.video.modelIdentifier",
        hint: "专门用于视频转写的模型（建议使用支持视频理解的多模态模型，如 gemini-flash-latest）",
        keywords: "transcription video model 视频 转写 模型",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
        defaultValue: "",
      },
      {
        id: "transVideoPrompt",
        label: "视频 Prompt",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入视频转写提示词",
          defaultValue: DEFAULT_SETTINGS.transcription.video.customPrompt,
        },
        modelPath: "transcription.video.customPrompt",
        hint: "用于指导模型如何转写视频内容。",
        keywords: "transcription video prompt 视频 提示词",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transVideoTemperature",
        label: "视频温度 ({{ localSettings.transcription.video.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1, "show-tooltip": true },
        modelPath: "transcription.video.temperature",
        hint: "较低的温度会产生更确定性的转写结果",
        keywords: "transcription video temperature 视频 转写 温度",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },
      {
        id: "transVideoMaxTokens",
        label: "视频输出上限",
        component: "SliderWithInput",
        props: { min: 0, max: 8192, step: 512 },
        modelPath: "transcription.video.maxTokens",
        hint: "视频转写结果的最大 token 数",
        keywords: "transcription video max tokens 视频 转写 上限",
        visible: (settings) =>
          settings.transcription.enabled &&
          settings.transcription.enableTypeSpecificConfig,
      },
    ],
  },
  {
    title: "文本处理",
    icon: Regex,
    items: [
      {
        id: "regexBindingMode",
        label: "正则规则绑定模式",
        component: "ElRadioGroup",
        modelPath: "regexConfig.bindingMode",
        options: [
          { label: "跟随消息配置", value: "message" },
          { label: "使用当前会话配置", value: "session" },
        ],
        hint: "控制正则规则使用哪套配置：<br/>• <strong>跟随消息配置</strong>：每条消息使用其生成时的 Agent/User 配置（消息绑定）<br/>• <strong>使用当前会话配置</strong>：所有消息使用当前会话的 Agent/User 配置（会话绑定）",
        keywords: "regex binding mode 绑定 模式 消息 会话",
        layout: "block",
      },
      {
        id: "regexConfig",
        label: "全局文本替换",
        component: ChatRegexEditor,
        props: {
          "editor-height": "500px",
        },
        modelPath: "regexConfig",
        hint: "配置全局生效的文本替换规则（支持正则），可用于清洗消息内容或增强角色扮演体验。这些规则将应用于所有会话。",
        keywords: "regex replace rule pattern 正则 替换 规则",
        collapsible: {
          title: "点击展开编辑规则",
          name: "regexOptions",
          style: { minHeight: "400px" },
          defaultValue: [],
        },
      },
    ],
  },
  {
    title: "样式设置",
    icon: Palette,
    items: [
      {
        id: "markdownStyle",
        label: "全局消息样式",
        component: MarkdownStyleEditor,
        props: {
          "editor-height": "400px",
        },
        modelPath: "uiPreferences.markdownStyle",
        hint: "为所有消息设置一个基础 Markdown 样式，优先级低于智能体自身的样式设置。",
        keywords: "ui markdown style css 样式",
        collapsible: {
          title: "点击展开编辑样式",
          name: "styleOptions",
          style: { minHeight: "500px", height: "60vh" },
          defaultValue: {},
          useLoading: true,
        },
      },
    ],
  },
  {
    title: "上下文管道",
    icon: Network,
    items: [
      {
        id: "pipelineConfig",
        label: "上下文管道配置",
        component: PipelineConfig,
        modelPath: "", // This component manages its own state via Pinia
        hint: "管理用于构建请求上下文的处理器系列。",
        keywords: "context pipeline processor 上下文 管道 处理器",
        collapsible: {
          title: "点击展开配置上下文管道",
          name: "pipelineConfig",
          style: { minHeight: "300px" },
          useLoading: true,
        },
      },
    ],
  },
  {
    title: "请求设置",
    icon: Globe,
    items: [
      {
        id: "timeout",
        label:
          "请求超时 ({{ (localSettings.requestSettings.timeout / 1000).toFixed(0) }}秒)",
        component: "ElSlider",
        props: {
          min: 10000,
          max: 300000,
          step: 5000,
          "format-tooltip": (val: number) => `${(val / 1000).toFixed(0)}秒`,
        },
        modelPath: "requestSettings.timeout",
        hint: "LLM 请求的超时时间，超时后会自动重试（如果未达到最大重试次数）",
        keywords: "request timeout 请求 超时",
      },
      {
        id: "maxRetries",
        label:
          "最大重试次数 ({{ localSettings.requestSettings.maxRetries }}次)",
        component: "ElSlider",
        props: {
          min: 0,
          max: 10,
          step: 1,
          "format-tooltip": (val: number) => `${val}次`,
        },
        modelPath: "requestSettings.maxRetries",
        hint: "请求失败（超时或网络错误）时的最大重试次数，设为 0 表示不重试",
        keywords: "request retry 请求 重试",
      },
      {
        id: "retryInterval",
        label: "重试间隔 ({{ localSettings.requestSettings.retryInterval }}ms)",
        component: "ElSlider",
        props: {
          min: 500,
          max: 5000,
          step: 500,
          "format-tooltip": (val: number) => `${val}ms`,
        },
        modelPath: "requestSettings.retryInterval",
        hint: "请求失败重试之间的等待时间",
        keywords: "request retry interval 重试 间隔",
      },
      {
        id: "retryMode",
        label: "重试模式",
        component: "ElRadioGroup",
        modelPath: "requestSettings.retryMode",
        options: [
          { label: "固定间隔", value: "fixed" },
          { label: "指数退避", value: "exponential" },
        ],
        hint: "固定间隔：每次重试等待相同时间<br/>指数退避：每次重试等待时间翻倍（推荐）",
        keywords: "request retry mode strategy 重试 模式 策略",
      },
    ],
  },
  {
    title: "开发者选项",
    icon: TerminalSquare,
    items: [
      {
        id: "debugModeEnabled",
        label: "启用调试模式",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "developer.debugModeEnabled",
        hint: "启用后，将在高级关系图等区域显示用于调试的额外按钮和信息。",
        keywords: "developer debug 开发者 调试",
      },
    ],
  },
];
