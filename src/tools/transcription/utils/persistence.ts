import { createConfigManager } from "@/utils/configManager";
import type { TranscriptionTask, TranscriptionConfig } from "../types";
import { DEFAULT_TRANSCRIPTION_CONFIG } from "../config";

/**
 * 转写配置持久化管理器
 */
export const transcriptionConfigManager = createConfigManager<TranscriptionConfig>({
  moduleName: "transcription",
  fileName: "config.json",
  createDefault: () => ({ ...DEFAULT_TRANSCRIPTION_CONFIG }),
});

/**
 * 转写任务持久化管理器
 */
export const transcriptionTasksManager = createConfigManager<{ list: TranscriptionTask[] }>({
  moduleName: "transcription",
  fileName: "tasks.json",
  createDefault: () => ({ list: [] }),
});