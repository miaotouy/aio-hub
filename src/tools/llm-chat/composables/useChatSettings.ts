/**
 * LLM Chat 设置管理
 * 管理聊天相关的用户偏好设置和配置
 * 注意：流式输出开关已在 MessageInput 工具栏，代码主题跟随全局，LLM 参数跟随智能体
 */

import { ref } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { RendererVersion } from "@/tools/rich-text-renderer/types";

const logger = createModuleLogger("useChatSettings");
const moduleErrorHandler = createModuleErrorHandler("useChatSettings");

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
  };
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
    autoScroll: true,
    fontSize: 14,
    lineHeight: 1.6,
    showMessageNavigator: true,
    rendererVersion: RendererVersion.V2_CUSTOM_PARSER, // 默认使用 V2 渲染器
  },
  messageManagement: {
    confirmBeforeDeleteMessage: false,
    confirmBeforeDeleteSession: true,
    confirmBeforeClearAll: true,
  },
  shortcuts: {
    send: "ctrl+enter",
    newLine: "enter",
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
      messageManagement: {
        ...defaultConfig.messageManagement,
        ...(loadedConfig.messageManagement || {}),
      },
      shortcuts: {
        ...defaultConfig.shortcuts,
        ...(loadedConfig.shortcuts || {}),
      },
      topicNaming: {
        ...defaultConfig.topicNaming,
        ...(loadedConfig.topicNaming || {}),
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
      messageManagement: {
        ...settings.value.messageManagement,
        ...(updates.messageManagement || {}),
      },
      shortcuts: {
        ...settings.value.shortcuts,
        ...(updates.shortcuts || {}),
      },
      topicNaming: {
        ...settings.value.topicNaming,
        ...(updates.topicNaming || {}),
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
