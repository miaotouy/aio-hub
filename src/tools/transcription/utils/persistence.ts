import { createConfigManager } from "@/utils/configManager";
import type { TranscriptionTask, TranscriptionConfig } from "../types";
import { DEFAULT_TRANSCRIPTION_CONFIG } from "../config";
import { merge } from "lodash-es";

/**
 * 转写配置持久化管理器
 */
export const transcriptionConfigManager = createConfigManager<TranscriptionConfig>({
  moduleName: "transcription",
  fileName: "config.json",
  createDefault: () => ({ ...DEFAULT_TRANSCRIPTION_CONFIG }),
  mergeConfig: (defaultConfig, loadedConfig) => {
    // 使用 lodash 的 merge 进行深合并，确保嵌套结构的默认值得到保留
    return merge({}, defaultConfig, loadedConfig);
  },
});

/**
 * 转写任务持久化管理器
 */
export const transcriptionTasksManager = createConfigManager<{ list: TranscriptionTask[] }>({
  moduleName: "transcription",
  fileName: "tasks.json",
  createDefault: () => ({ list: [] }),
});