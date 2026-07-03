import { RendererVersion } from "@/tools/rich-text-renderer/types";
import { DEFAULT_TRANSCRIPTION_CONFIG } from "@/tools/transcription/config";
import { createDefaultChatRegexConfig } from "../types/chatRegex";
import type { ChatSettings } from "../types/settings";

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: ChatSettings = {
  uiPreferences: {
    isStreaming: true, // 默认开启流式输出
    showTimestamp: false,
    showTokenCount: true,
    showTokenCountForBlocks: true,
    showCharCount: true,
    showAvatar: true,
    showModelInfo: true,
    showPerformanceMetrics: true,
    showModelSelector: true,
    autoScroll: true,
    smoothAutoScroll: true, // 默认启用平滑滚动
    autoScrollThreshold: 100, // 默认 100px 触底阈值
    fontSize: 14,
    lineHeight: 1.6,
    letterSpacing: 0,
    showMessageNavigator: true,
    rendererVersion: RendererVersion.V2_CUSTOM_PARSER, // 默认使用 V2 渲染器
    headerBackgroundOpacity: 0.3, // 头部背景不透明度
    headerBlurIntensity: 12, // 头部背景模糊强度
    searchResultLimit: 500, // 默认搜索最大结果数量
    autoSwitchAgentOnSessionChange: true, // 默认开启
    defaultRenderHtml: false, // 默认不自动渲染 HTML
    seamlessMode: false, // 默认关闭无边框模式
    defaultCodeBlockExpanded: false, // 默认不展开代码块
    defaultToolCallCollapsed: false, // 默认不折叠工具调用
    markdownStyle: undefined, // 默认不设置全局样式
    enableContentWidthLimit: false, // 默认不限制宽度
    contentMaxWidth: 800, // 默认最大宽度 800px
    rendererThrottleMs: 80, // AST 节流值
    smoothingEnabled: true, // 流式平滑化
    throttleEnabled: true, // AST 节流开关
    enableEnterAnimation: true, // 默认开启
    showWallpaperInDetachedMode: true, // 默认开启分离模式壁纸
    enableDetachableHandle: true, // 默认允许组件分离
    virtualListOverscan: 20, // 预渲染可视区域外的消息数量
    enableCdnLocalizer: true, // 默认开启 CDN 资源本地化
    allowExternalScripts: false, // 默认禁止外部资源，增强安全性
    allowDangerousHtml: false, // 默认禁止危险 HTML
    enableHtmlFreezer: true, // 默认启用 HTML 预览冻结
    htmlFreezerKeepAliveCount: 5, // 默认 保持最近 5 个预览活动
    safetyGuardEnabled: true, // 默认启用渲染安全护栏
    globalMediaVolume: 80, // 默认媒体音量 80%
    autoTriggerGenerationAfterQueue: true,
    queueReplyMode: "combined" as const,
    useNativeTextarea: false,
    bubbleLayout: {
      mode: "card", // 默认卡片模式，零回归
      userAlign: "right",
      assistantAlign: "left",
      systemAlign: "center",
      maxWidthPercent: 75,
      maxWidthPx: 720,
      systemMaxWidthPercent: 60,
      toolAttachment: "follow-prev",
      avatarPlacement: "inside",
      avatarSize: 36,
      avatarGap: 8,
      headerPlacement: "inside",
      headerGap: 4,
      borderRadius: 12,
    },
  },
  modelPreferences: {
    defaultModel: "",
  },
  translation: {
    enabled: true,
    modelIdentifier: "", // 需要用户配置
    messageTargetLang: "Chinese",
    inputTargetLang: "English",
    targetLangList: [
      "Chinese",
      "English",
      "Japanese",
      "Korean",
      "French",
      "German",
      "Spanish",
      "Russian",
    ],
    prompt:
      "Please translate the following text to {targetLang}.\n\nImportant: If the text contains any of the following XML-style tag blocks: {thinkTags}, please keep the XML tags themselves unchanged, but translate the text content inside the tags.\n\nOnly output the translated content without any explanation or additional text:\n\n{text}",
    temperature: 0.3,
    maxTokens: 2000,
  },
  transcription: {
    ...DEFAULT_TRANSCRIPTION_CONFIG,
    enabled: true,
    strategy: "smart",
    forceTranscriptionAfter: 10,
    autoInsertPlaceholder: false,
    smartPrioritizeTranscription: true,
  },
  messageManagement: {
    confirmBeforeDeleteMessage: false,
    confirmBeforeDeleteSession: true,
    confirmBeforeClearAll: true,
  },
  shortcuts: {
    send: "ctrl+enter",
    newLine: "enter",
    undo: "ctrl+z",
    redo: "ctrl+shift+z",
  },
  graphViewShortcuts: {
    dragSubtree: "alt",
    graftSubtree: "alt",
  },
  graphView: {
    showBackground: true,
    showMiniMap: true,
    showControls: true,
    showHud: true,
    defaultLayoutMode: "tree",
    isControlsExpanded: true,
  },
  contextOptimization: {
    convertHtmlToMd: false,
    htmlToMdLastMessages: 5,
  },
  topicNaming: {
    enabled: false,
    modelIdentifier: "", // 需要用户配置
    prompt:
      "快给我为以下对话生成一个简短、精准的标题，不要使用任何标点符号，直接输出标题文本：\n<---------->\n{context}\n</---------->",
    temperature: 1,
    maxTokens: 128,
    autoTriggerThreshold: 3, // 当会话中有 3 条用户消息时自动触发
    contextMessageCount: 6, // 使用最近 6 条消息作为上下文
  },
  requestSettings: {
    timeout: 60000, // 默认 60 秒
    maxRetries: 2, // 默认重试 2 次
    retryInterval: 3000, // 默认重试间隔 3 秒
    retryMode: "fixed", // 默认固定间隔
    enableIncrementalSave: true, // 默认启用增量保存
    incrementalSaveInterval: 2000, // 默认 2 秒
  },
  developer: {
    debugModeEnabled: false,
    forceNativeResize: false,
  },
  regexConfig: createDefaultChatRegexConfig(),
  plugins: {},
  worldbookIds: [],
  quickActionSetIds: [],
  worldbook: {
    disableRecursion: false,
    defaultScanDepth: 2,
  },
};
/*
AI认为这个错误是隐式循环导入导致的，虽然我不这么认为，在此记录下，如果下次再犯，狠狠拷打AI
*/

/**
 * 🦉 咕咕的深层诊断与“回旋镖”记录：
 *
 * 如果这次把 DEFAULT_SETTINGS 抽离到此文件依然没能彻底解决挂机唤醒时的报错，
 * 那么真正的根源就在于“模块顶层副作用抢跑”。
 *
 * 当应用挂机很久、系统进入低功耗或 WebView 休眠状态时，重新聚焦窗口会瞬间唤醒 Tauri 的 WindowSyncBus
 * 并向所有窗口广播状态同步事件。如果此时路由组件尚未 Mount，同步总线的回调函数却已经持有了对 useChatSettings
 * 的引用并尝试写入状态，就会强行触发 Composable 模块的动态加载与重新评估。
 * 在 WebView 刚唤醒、CPU 瞬间高负载的边界情况下，异步模块的加载顺序可能会发生微秒级的错乱，
 * 导致顶层立即执行的代码在依赖项尚未完全 Evaluate 完毕时就抢跑了，从而触发 TDZ 报错。
 *
 * 终极防御性写法（回旋镖预警）：
 * 如果下次挂机久了，媒体生成或者聊天又报了类似的错，我们需要将初始化逻辑从“模块顶层”移入“生命周期/懒加载”中：
 *
 * let settings: Ref<ChatSettings> | null = null;
 * export function useChatSettings() {
 *   if (!settings) {
 *     settings = ref<ChatSettings>({ ...DEFAULT_SETTINGS });
 *   }
 *   return { settings };
 * }
 *
 * 这样可以确保模块导入时没有任何副作用，绝对不会抢跑。
 */
