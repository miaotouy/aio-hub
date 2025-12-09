/**
 * LLM Chat 设置管理
 * 管理聊天相关的用户偏好设置和配置
 * 注意：流式输出开关已在 MessageInput 工具栏，代码主题跟随全局，LLM 参数跟随智能体
 */

import { ref } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import {
  RendererVersion,
  type RichTextRendererStyleOptions,
} from "@/tools/rich-text-renderer/types";
import { createDefaultChatRegexConfig } from "../types";
import type { ChatRegexConfig, ContextCompressionConfig } from "../types";

const logger = createModuleLogger("useChatSettings");
const moduleErrorHandler = createModuleErrorHandler("useChatSettings");

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
  };
  /** 模型偏好设置 */
  modelPreferences: {
    /** 默认 LLM 模型（用于新建会话兜底） */
    defaultModel: string;
  };
  /** 翻译设置 */
  translation: TranslationConfig;
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
  };
  /** 开发者设置 */
  developer: {
    /** 是否启用调试模式 */
    debugModeEnabled: boolean;
  };
  /** 全局正则管道配置 */
  regexConfig: ChatRegexConfig;
  /** 上下文压缩配置 */
  contextCompression: ContextCompressionConfig;
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
    autoScroll: true,
    fontSize: 14,
    lineHeight: 1.6,
    showMessageNavigator: true,
    rendererVersion: RendererVersion.V2_CUSTOM_PARSER, // 默认使用 V2 渲染器
    headerBackgroundOpacity: 0.3, // 头部背景不透明度
    headerBlurIntensity: 12, // 头部背景模糊强度
    autoSwitchAgentOnSessionChange: true, // 默认开启
    defaultRenderHtml: false, // 默认不自动渲染 HTML
    markdownStyle: undefined, // 默认不设置全局样式
    enableContentWidthLimit: false, // 默认不限制宽度
    contentMaxWidth: 800, // 默认最大宽度 800px
    rendererThrottleMs: 80, // 默认 80ms
    enableEnterAnimation: true, // 默认开启
    showWallpaperInDetachedMode: true, // 默认开启分离模式壁纸
  },
  modelPreferences: {
    defaultModel: "",
  },
  translation: {
    enabled: true,
    modelIdentifier: "", // 需要用户配置
    messageTargetLang: "Chinese",
    inputTargetLang: "English",
    targetLangList: ["Chinese", "English", "Japanese", "Korean", "French", "German", "Spanish", "Russian"],
    prompt:
      "Please translate the following text to {targetLang}.\n\nImportant: If the text contains any of the following XML-style tag blocks: {thinkTags}, please keep the XML tags themselves unchanged, but translate the text content inside the tags.\n\nOnly output the translated content without any explanation or additional text:\n\n{text}",
    temperature: 0.3,
    maxTokens: 2000,
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
    maxRetries: 3, // 默认重试 3 次
    retryInterval: 1000, // 默认重试间隔 1 秒
    retryMode: "fixed", // 默认固定间隔
  },
  developer: {
    debugModeEnabled: false,
  },
  regexConfig: createDefaultChatRegexConfig(),
  contextCompression: {
    enabled: false,
    autoTrigger: true,
    triggerMode: "token",
    tokenThreshold: 80000,
    countThreshold: 50,
    protectRecentCount: 10,
    compressCount: 20,
    minHistoryCount: 15,
    summaryRole: "system",
    summaryPrompt:
      "请将以下对话历史压缩为一个简洁的摘要，保留核心信息和关键对话转折点：\n\n{context}\n\n摘要要求：\n1. 用中文输出\n2. 保持客观中立\n3. 不超过 300 字",
  },
};

/**
 * 创建聊天设置配置管理器
 */
const settingsManager = createConfigManager<ChatSettings>({
  moduleName: "llm-chat",
  fileName: "chat-settings.json",
  version: "1.0.0",
  createDefault: () => ({ ...DEFAULT_SETTINGS }),
  mergeConfig: (defaultConfig, loadedConfig) => {
    return {
      ...defaultConfig,
      ...loadedConfig,
      uiPreferences: {
        ...defaultConfig.uiPreferences,
        ...(loadedConfig.uiPreferences || {}),
      },
      modelPreferences: {
        ...defaultConfig.modelPreferences,
        ...(loadedConfig.modelPreferences || {}),
      },
      messageManagement: {
        ...defaultConfig.messageManagement,
        ...(loadedConfig.messageManagement || {}),
      },
      shortcuts: {
        ...defaultConfig.shortcuts,
        ...(loadedConfig.shortcuts || {}),
      },
      graphViewShortcuts: {
        ...defaultConfig.graphViewShortcuts,
        ...(loadedConfig.graphViewShortcuts || {}),
      },
      topicNaming: {
        ...defaultConfig.topicNaming,
        ...(loadedConfig.topicNaming || {}),
      },
      translation: {
        ...defaultConfig.translation,
        ...(loadedConfig.translation || {}),
      },
      requestSettings: {
        ...defaultConfig.requestSettings,
        ...(loadedConfig.requestSettings || {}),
      },
      developer: {
        ...defaultConfig.developer,
        ...(loadedConfig.developer || {}),
      },
      regexConfig: {
        ...defaultConfig.regexConfig,
        ...(loadedConfig.regexConfig || {}),
      },
      contextCompression: {
        ...defaultConfig.contextCompression,
        ...(loadedConfig.contextCompression || {}),
      },
    };
  },
});

// 全局设置状态
const settings = ref<ChatSettings>({ ...DEFAULT_SETTINGS });
const isLoaded = ref(false);
/**
 * 加载设置
 */
async function loadSettings(): Promise<void> {
  if (isLoaded.value) {
    logger.info("设置已加载，跳过重复加载");
    return;
  }

  try {
    settings.value = await settingsManager.load();
    isLoaded.value = true;
    logger.info("聊天设置加载成功", { settings: settings.value });
  } catch (error) {
    moduleErrorHandler.warn(error, "加载聊天设置失败，使用默认设置", {
      action: "loadSettings",
    });
    settings.value = { ...DEFAULT_SETTINGS };
    isLoaded.value = true;
  }
}

/**
 /**
  * 保存设置
  */
async function saveSettings(): Promise<void> {
  try {
    await settingsManager.save(settings.value);
    logger.info("聊天设置保存成功");
  } catch (error) {
    moduleErrorHandler.error(error, "保存聊天设置失败", {
      action: "saveSettings",
    });
    throw error;
  }
}
/**
 * 重置设置为默认值
 */
async function resetSettings(): Promise<void> {
  settings.value = { ...DEFAULT_SETTINGS };
  await saveSettings();
  logger.info("聊天设置已重置为默认值");
}

/**
 * 更新设置（部分更新）
 */
async function updateSettings(updates: Partial<ChatSettings>): Promise<void> {
  try {
    settings.value = {
      ...settings.value,
      ...updates,
      uiPreferences: {
        ...settings.value.uiPreferences,
        ...(updates.uiPreferences || {}),
      },
      modelPreferences: {
        ...settings.value.modelPreferences,
        ...(updates.modelPreferences || {}),
      },
      messageManagement: {
        ...settings.value.messageManagement,
        ...(updates.messageManagement || {}),
      },
      shortcuts: {
        ...settings.value.shortcuts,
        ...(updates.shortcuts || {}),
      },
      graphViewShortcuts: {
        ...settings.value.graphViewShortcuts,
        ...(updates.graphViewShortcuts || {}),
      },
      topicNaming: {
        ...settings.value.topicNaming,
        ...(updates.topicNaming || {}),
      },
      translation: {
        ...settings.value.translation,
        ...(updates.translation || {}),
      },
      requestSettings: {
        ...settings.value.requestSettings,
        ...(updates.requestSettings || {}),
      },
      developer: {
        ...settings.value.developer,
        ...(updates.developer || {}),
      },
      regexConfig: updates.regexConfig ?? settings.value.regexConfig,
      contextCompression: {
        ...settings.value.contextCompression,
        ...(updates.contextCompression || {}),
      },
    };
    await saveSettings();
    logger.info("聊天设置已更新", { updates });
  } catch (error) {
    moduleErrorHandler.error(error, "更新聊天设置失败", {
      action: "updateSettings",
      updates,
    });
    throw error;
  }
}

/**
 * 使用聊天设置
 */
export function useChatSettings() {
  return {
    settings,
    isLoaded,
    loadSettings,
    saveSettings,
    resetSettings,
    updateSettings,
  };
}
