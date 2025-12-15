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
import type { ChatRegexConfig } from "../types";

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
 * 转写配置接口
 */
export interface TypeSpecificTranscriptionConfig {
  /** 模型标识符 */
  modelIdentifier: string;
  /** 自定义 Prompt */
  customPrompt: string;
  /** 温度参数 */
  temperature: number;
  /** 输出上限（token） */
  maxTokens: number;
}

export interface TranscriptionConfig {
  /** 是否启用转写功能 */
  enabled: boolean;
  /** 转写触发策略 */
  strategy: "smart" | "always";
  /** 在智能模式下，超过N条历史消息后强制转写 */
  forceTranscriptionAfter: number;
  /** 是否在附件导入时自动开始转写 (基于策略) */
  autoStartOnImport: boolean;
  /** 发送行为 */
  sendBehavior: "wait_before_send" | "send_and_wait";
  /** 转写使用的模型 ID (指向 LlmModelSelector) - 通用/默认 */
  modelIdentifier: string;
  /** 自定义转写 Prompt (可选) - 通用/默认 */
  customPrompt: string;
  /** 温度参数 - 通用/默认 */
  temperature: number;
  /** 输出上限（token） - 通用/默认 */
  maxTokens: number;
  /** 最大并发任务数 */
  maxConcurrentTasks: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 转写等待超时时间 (ms) */
  timeout: number;
  /** 是否启用分类型精细配置 */
  enableTypeSpecificConfig: boolean;
  /** 图片特定配置 */
  image: TypeSpecificTranscriptionConfig;
  /** 音频特定配置 */
  audio: TypeSpecificTranscriptionConfig;
  /** FFmpeg 路径 */
  ffmpegPath?: string;
  /** 视频特定配置 */
  video: TypeSpecificTranscriptionConfig & {
    maxDirectSizeMB: number;
    /** 是否启用视频压缩 */
    enableCompression: boolean;
    maxFps: number;
    /** 最大分辨率（短边像素，压缩时保持比例缩放） */
    maxResolution: number;
  };
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
  /** 转写设置 */
  transcription: TranscriptionConfig;
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
  /** 插件配置存储 */
  plugins: Record<string, any>;
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
  transcription: {
    enabled: true,
    strategy: "smart",
    forceTranscriptionAfter: 10,
    autoStartOnImport: true, // 默认开启，体验更好
    sendBehavior: "send_and_wait",
    modelIdentifier: "",
    customPrompt: `你是一个高精度多模态内容分析器。请对输入的媒体内容进行全面、准确的文本化转录。

## 核心原则
1. **忠实还原**：优先还原内容的原始意图，而非机械式转录
2. **智能纠错**：对明显的口误、谐音错误进行合理修正，但保留原意
3. **结构清晰**：输出采用层次分明的 Markdown 格式

## 输出要求
- 使用中文输出（除非内容本身是其他语言）
- 对于文字内容，保持原文准确性
- 对于非文字内容，提供客观描述`,
    temperature: 0.2,
    maxTokens: 4096,
    maxConcurrentTasks: 2,
    maxRetries: 2,
    timeout: 120000, // 默认 120 秒
    enableTypeSpecificConfig: false,
    ffmpegPath: "",
    video: {
      maxDirectSizeMB: 10,
      enableCompression: true,
      maxFps: 12,
      maxResolution: 720,
      modelIdentifier: "",
      customPrompt: `你是一个专业的视频内容分析器，具备对动态视觉内容和音频信息的综合理解能力。

## 分析框架
请按以下结构对视频进行全面分析：

### 1. 视频概览
- **主题与类型**：视频的主要内容类型（如新闻、教程、Vlog、监控画面等）
- **核心事件**：视频中发生的主要事件或行为

### 2. 关键视觉信息
- **场景变化**：描述主要的场景切换和环境细节
- **人物与动作**：识别主要人物及其关键动作
- **文字与标识**：提取视频中出现的关键文字（字幕、标题、招牌等）

### 3. 音频内容（如适用）
- **语音摘要**：概括主要的对话或旁白内容
- **关键声效**：显著的背景音乐或环境音效

### 4. 时间线摘要
- [MM:SS] 关键节点1
- [MM:SS] 关键节点2

## 输出格式
使用清晰的 Markdown 结构。`,
      temperature: 0.2,
      maxTokens: 4096,
    },
    image: {
      modelIdentifier: "",
      customPrompt: `你是一个专业的图像内容分析器，具备高精度视觉识别和 OCR 能力。

## 分析框架
请按以下结构对图像进行全面分析：

### 1. 场景概览
- 图像类型（照片/截图/插图/图表等）
- 整体场景描述（环境、氛围、主题）

### 2. 核心元素
- **主体识别**：画面中的主要对象、人物、物品
- **空间关系**：各元素的位置布局和相互关系
- **视觉特征**：色彩、光影、构图等显著特点

### 3. 文字内容（OCR）
- **精确转录**：逐字提取图中所有可见文本
- **布局保持**：尽量还原文字的原始排版结构
- **标注来源**：说明文字出现的位置（如标题、按钮、水印等）

### 4. 深层信息（如适用）
- 图表数据解读
- UI 界面元素识别
- 品牌/标识识别

## 输出格式
使用清晰的 Markdown 结构，必要时使用表格、列表等元素增强可读性。`,
      temperature: 0.2,
      maxTokens: 4096,
    },
    audio: {
      modelIdentifier: "",
      customPrompt: `你是一个专业的音频内容转录器，具备语音识别和声学场景分析能力。

## 核心准则
1. **意图优先**：转录应忠于说话者的真实意图，而非死板的音标还原
2. **智能纠错**：自动修正口误、重复、语气词过多等问题，保持语义流畅
3. **多声道整合**：区分不同说话者，标注对话角色

## 分析框架

### 1. 语音内容
- **完整转录**：准确记录所有语音内容
- **说话者标注**：如有多人，用 [说话者A]、[说话者B] 等标注
- **时间标记**：对于较长音频，适当添加时间节点 [MM:SS]
- **语气还原**：保留重要的语气、情感表达（如强调、疑问、感叹）

### 2. 非语音元素
- **背景音乐**：描述音乐风格、情绪、节奏变化
- **音效/环境音**：记录显著的声音事件
- **静音/停顿**：标注有意义的沉默段落

### 3. 特殊内容处理
- **歌词**：保留原语言，可附加翻译
- **专业术语**：尽量准确，不确定处标注 [?]
- **模糊音段**：标注为 [听不清] 或 [音质不佳]

## 输出格式
使用清晰的 Markdown 结构，对话使用引用块，时间标记使用行内代码。`,
      temperature: 0.2,
      maxTokens: 4096,
    },
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
  plugins: {},
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
      transcription: {
        ...defaultConfig.transcription,
        ...(loadedConfig.transcription || {}),
        // 深度合并嵌套对象，防止旧配置覆盖新字段
        image: {
          ...defaultConfig.transcription.image,
          ...(loadedConfig.transcription?.image || {}),
        },
        audio: {
          ...defaultConfig.transcription.audio,
          ...(loadedConfig.transcription?.audio || {}),
        },
        video: {
          ...defaultConfig.transcription.video,
          ...(loadedConfig.transcription?.video || {}),
        },
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
      plugins: {
        ...defaultConfig.plugins,
        ...(loadedConfig.plugins || {}),
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
      transcription: {
        ...settings.value.transcription,
        ...(updates.transcription || {}),
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
      plugins: {
        ...settings.value.plugins,
        ...(updates.plugins || {}),
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
