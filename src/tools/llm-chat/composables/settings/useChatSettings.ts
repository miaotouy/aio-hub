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
  DEFAULT_SETTINGS,
  type ChatSettings,
} from "../../types/settings";

const logger = createModuleLogger("useChatSettings");
const moduleErrorHandler = createModuleErrorHandler("useChatSettings");

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
        document: {
          ...defaultConfig.transcription.document,
          ...(loadedConfig.transcription?.document || {}),
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
      worldbookIds: loadedConfig.worldbookIds || [],
      worldbook: {
        ...defaultConfig.worldbook,
        ...(loadedConfig.worldbook || {}),
      },
      knowledgeBase: {
        ...defaultConfig.knowledgeBase,
        ...(loadedConfig.knowledgeBase || {}),
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
      worldbookIds: updates.worldbookIds ?? settings.value.worldbookIds,
      worldbook: {
        ...settings.value.worldbook,
        ...(updates.worldbook || {}),
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
