/**
 * 日志配置管理 Composable
 * 负责同步应用设置与日志系统配置
 */

import { watch } from "vue";
import { logger, LogLevel } from "@/utils/logger";
import { loadAppSettings, type AppSettings } from "@/utils/appSettings";
import { createModuleLogger } from "@utils/logger";

const moduleLogger = createModuleLogger("useLogConfig");

export function useLogConfig() {
  /**
   * 应用日志配置到日志系统
   */
  const applyLogConfig = (settings: AppSettings) => {
    try {
      // 设置日志级别
      if (settings.logLevel) {
        const level = LogLevel[settings.logLevel as keyof typeof LogLevel];
        logger.setLevel(level);
      }

      // 设置文件日志
      if (settings.logToFile !== undefined) {
        logger.setLogToFile(settings.logToFile);
      }

      // 设置控制台日志
      if (settings.logToConsole !== undefined) {
        logger.setLogToConsole(settings.logToConsole);
      }

      // 设置日志缓冲区大小
      if (settings.logBufferSize !== undefined) {
        logger.setLogBufferSize(settings.logBufferSize);
      }

      moduleLogger.info("日志配置已应用", {
        level: settings.logLevel,
        logToFile: settings.logToFile,
        logToConsole: settings.logToConsole,
        bufferSize: settings.logBufferSize,
      });
    } catch (error) {
      moduleLogger.error("应用日志配置失败", error);
    }
  };

  /**
   * 初始化日志配置
   */
  const initializeLogConfig = async () => {
    try {
      const settings = await loadAppSettings();
      applyLogConfig(settings);
    } catch (error) {
      moduleLogger.error("初始化日志配置失败", error);
    }
  };

  /**
   * 监听设置变化并自动应用
   */
  const watchLogConfig = (settings: AppSettings) => {
    watch(
      [
        () => settings.logLevel,
        () => settings.logToFile,
        () => settings.logToConsole,
        () => settings.logBufferSize,
      ],
      () => {
        applyLogConfig(settings);
      },
      { deep: true }
    );
  };

  return {
    applyLogConfig,
    initializeLogConfig,
    watchLogConfig,
  };
}