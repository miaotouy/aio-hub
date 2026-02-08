import {
  RendererVersion,
  type RichTextRendererStyleOptions,
} from "@/tools/rich-text-renderer/types";
import type { TranscriptionConfig as BaseTranscriptionConfig } from "@/tools/transcription/types";
import { DEFAULT_TRANSCRIPTION_CONFIG } from "@/tools/transcription/config";
import { createDefaultChatRegexConfig } from "./chatRegex";
import type { ChatRegexConfig } from "./chatRegex";

/**
 * 聊天场景下的转写配置
 */
export interface ChatTranscriptionConfig extends BaseTranscriptionConfig {
  /** 是否启用转写功能 */
  enabled: boolean;
  /** 转写触发策略 */
  strategy: "smart" | "always";
  /** 在智能模式下，超过N条历史消息后强制转写 */
  forceTranscriptionAfter: number;
}

/**
 * 翻译配置接口
 */
export interface TranslationConfig {
  /** 是否启用翻译功能 */
  enabled: boolean;
  /** 使用的模型标识符（格式: profileId:modelId） */
  modelIdentifier: string;
  /** 消息默认目标语言 */
  messageTargetLang: string;
  /** 输入框默认目标语言 */
  inputTargetLang: string;
  /** 常用目标语言列表 */
  targetLangList: string[];
  /** 翻译提示词 */
  prompt: string;
  /** 温度参数 */
  temperature: number;
  /** 输出上限（token） */
  maxTokens: number;
}

/**
 * 聊天设置接口
 */
export interface ChatSettings {
  /** UI 偏好设置 */
  uiPreferences: {
    /** 是否启用流式输出 */
    isStreaming: boolean;
    /** 是否显示消息时间戳 */
    showTimestamp: boolean;
    /** 是否显示 Token 统计 */
    showTokenCount: boolean;
    /** 是否显示模型信息 */
    showModelInfo: boolean;
    /** 是否显示性能指标 */
    showPerformanceMetrics: boolean;
    /** 是否显示模型选择器 */
    showModelSelector: boolean;
    /** 是否自动滚动到最新消息 */
    autoScroll: boolean;
    /** 消息字体大小 (px) */
    fontSize: number;
    /** 消息行高 */
    lineHeight: number;
    /** 是否显示消息导航器 */
    showMessageNavigator: boolean;
    /** 消息渲染器版本 */
    rendererVersion: RendererVersion;
    /** 头部背景不透明度 */
    headerBackgroundOpacity: number;
    /** 头部背景模糊强度 (px) */
    headerBlurIntensity: number;
    /** 切换会话时自动切换智能体 */
    autoSwitchAgentOnSessionChange: boolean;
    /** 是否默认渲染 HTML 代码块 */
    defaultRenderHtml: boolean;
    /** 是否开启 HTML 预览无边框模式 */
    seamlessMode: boolean;
    /** 代码块是否默认展开 */
    defaultCodeBlockExpanded: boolean;
    /** 工具调用是否默认折叠 */
    defaultToolCallCollapsed: boolean;
    /** 全局 Markdown 样式 */
    markdownStyle?: RichTextRendererStyleOptions;
    /** 是否启用内容宽度限制 */
    enableContentWidthLimit: boolean;
    /** 内容最大宽度 (px) */
    contentMaxWidth: number;
    /** 渲染器更新节流时间 (ms) */
    rendererThrottleMs: number;
    /** 是否启用节点进入动画 */
    enableEnterAnimation: boolean;
    /** 分离模式下是否显示壁纸 */
    showWallpaperInDetachedMode: boolean;
    /** 是否允许组件分离（显示分离手柄） */
    enableDetachableHandle: boolean;
    /** 虚拟列表预渲染数量 */
    virtualListOverscan: number;
    /** 是否启用 CDN 资源本地化 */
    enableCdnLocalizer: boolean;
    /** 是否允许加载外部资源（如 CDN 脚本、样式） */
    allowExternalScripts: boolean;
    /** 是否允许渲染危险的 HTML 标签（如 script, iframe 等） */
    allowDangerousHtml: boolean;
    /** 是否启用 HTML 预览冻结功能（冻结旧消息的 HTML 预览以节省性能） */
    enableHtmlFreezer: boolean;
    /** 保持 HTML 预览活跃的最近消息数量（基于消息深度） */
    htmlFreezerKeepAliveCount: number;
    /** 全局媒体音量 (0-100) */
    globalMediaVolume: number;
  };
  /** 模型偏好设置 */
  modelPreferences: {
    /** 默认 LLM 模型（用于新建会话兜底） */
    defaultModel: string;
  };
  /** 翻译设置 */
  translation: TranslationConfig;
  /** 转写设置 */
  transcription: ChatTranscriptionConfig;
  /** 消息管理设置 */
  messageManagement: {
    /** 是否在删除消息前确认 */
    confirmBeforeDeleteMessage: boolean;
    /** 是否在删除会话前确认 */
    confirmBeforeDeleteSession: boolean;
    /** 是否在清空所有会话前确认 */
    confirmBeforeClearAll: boolean;
  };
  /** 快捷键设置 */
  shortcuts: {
    /** 发送消息快捷键 */
    send: "ctrl+enter" | "enter";
    /** 换行快捷键（与发送互补） */
    newLine: "enter" | "shift+enter";
    /** 撤销操作 */
    undo: string;
    /** 重做操作 */
    redo: string;
  };
  /** 关系图快捷键设置 */
  graphViewShortcuts: {
    /** 拖拽整个子树的修饰键 */
    dragSubtree: "shift" | "alt" | "ctrl" | "none";
    /** 嫁接整个子树的修饰键 */
    graftSubtree: "shift" | "alt" | "ctrl" | "none";
  };
  /** 上下文优化设置 */
  contextOptimization: {
    /** 是否启用 HTML 转 Markdown */
    convertHtmlToMd: boolean;
    /** 倒数第几条消息开始转换 */
    htmlToMdLastMessages: number;
  };
  /** 话题命名设置 */
  topicNaming: {
    /** 是否启用话题命名 */
    enabled: boolean;
    /** 使用的模型标识符（格式: profileId:modelId） */
    modelIdentifier: string;
    /** 命名提示词 */
    prompt: string;
    /** 温度参数 */
    temperature: number;
    /** 输出上限（token） */
    maxTokens: number;
    /** 自动触发的消息数量阈值 */
    autoTriggerThreshold: number;
    /** 命名时携带的上下文消息数量 */
    contextMessageCount: number;
  };
  /** 请求设置 */
  requestSettings: {
    /** 请求超时时间（毫秒） */
    timeout: number;
    /** 最大重试次数 */
    maxRetries: number;
    /** 重试间隔（毫秒） */
    retryInterval: number;
    /** 重试模式：固定间隔或指数退避 */
    retryMode: "fixed" | "exponential";
    /** 是否启用生成中的增量保存（防止崩溃/刷新丢失） */
    enableIncrementalSave: boolean;
    /** 增量保存间隔（毫秒） */
    incrementalSaveInterval: number;
  };
  /** 开发者设置 */
  developer: {
    /** 是否启用调试模式 */
    debugModeEnabled: boolean;
  };
  /** 全局正则管道配置 */
  regexConfig: ChatRegexConfig;
  /** 插件配置存储 */
  plugins: Record<string, any>;
  /** 全局关联的世界书 ID 列表 */
  worldbookIds: string[];
  /** 全局关联的快捷操作组 ID 列表 */
  quickActionSetIds: string[];
  /** 世界书全局设置 */
  worldbook: {
    /** 是否禁用递归扫描 */
    disableRecursion: boolean;
    /** 默认扫描深度 */
    defaultScanDepth: number;
  };
  /** 知识库全局设置 */
  knowledgeBase: {
    /** Embedding 向量缓存最大条目数 */
    embeddingCacheMaxItems: number;
    /** 检索结果缓存最大条目数 */
    retrievalCacheMaxItems: number;
  };
}

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: ChatSettings = {
  uiPreferences: {
    isStreaming: true, // 默认开启流式输出
    showTimestamp: false,
    showTokenCount: true,
    showModelInfo: true,
    showPerformanceMetrics: true,
    showModelSelector: true,
    autoScroll: true,
    fontSize: 14,
    lineHeight: 1.6,
    showMessageNavigator: true,
    rendererVersion: RendererVersion.V2_CUSTOM_PARSER, // 默认使用 V2 渲染器
    headerBackgroundOpacity: 0.3, // 头部背景不透明度
    headerBlurIntensity: 12, // 头部背景模糊强度
    autoSwitchAgentOnSessionChange: true, // 默认开启
    defaultRenderHtml: false, // 默认不自动渲染 HTML
    seamlessMode: false, // 默认关闭无边框模式
    defaultCodeBlockExpanded: false, // 默认不展开代码块
    defaultToolCallCollapsed: false, // 默认不折叠工具调用
    markdownStyle: undefined, // 默认不设置全局样式
    enableContentWidthLimit: false, // 默认不限制宽度
    contentMaxWidth: 800, // 默认最大宽度 800px
    rendererThrottleMs: 80, // 默认 80ms
    enableEnterAnimation: true, // 默认开启
    showWallpaperInDetachedMode: true, // 默认开启分离模式壁纸
    enableDetachableHandle: true, // 默认允许组件分离
    virtualListOverscan: 20, // 预渲染可视区域外的消息数量
    enableCdnLocalizer: true, // 默认开启 CDN 资源本地化
    allowExternalScripts: false, // 默认禁止外部资源，增强安全性
    allowDangerousHtml: false, // 默认禁止危险 HTML
    enableHtmlFreezer: true, // 默认启用 HTML 预览冻结
    htmlFreezerKeepAliveCount: 5, // 默认保持最近 5 个预览活动
    globalMediaVolume: 80, // 默认媒体音量 80%
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
  contextOptimization: {
    convertHtmlToMd: false,
    htmlToMdLastMessages: 5,
  },
  topicNaming: {
    enabled: false,
    modelIdentifier: "", // 需要用户配置
    prompt:
      "快给我为以下对话生成一个简短、精准的标题，不要使用任何标点符号，直接输出标题文本：\n<---------->\n{context}\n</---------->",
    temperature: 0.7,
    maxTokens: 30,
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
  },
  regexConfig: createDefaultChatRegexConfig(),
  plugins: {},
  worldbookIds: [],
  quickActionSetIds: [],
  worldbook: {
    disableRecursion: false,
    defaultScanDepth: 2,
  },
  knowledgeBase: {
    embeddingCacheMaxItems: 200,
    retrievalCacheMaxItems: 30,
  },
};
