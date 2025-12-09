/**
 * 日志配置管理 Composable
 * 负责同步应用设置与日志系统配置
 */

import { watch } from "vue";
import { logger, LogLevel } from "@/utils/logger";
import { loadAppSettings, type AppSettings } from "@/utils/appSettings";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const moduleLogger = createModuleLogger("useLogConfig");
const errorHandler = createModuleErrorHandler("useLogConfig");

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

      // 设置单个日志文件最大大小
      if (settings.maxFileSize !== undefined) {
        logger.setMaxFileSize(settings.maxFileSize);
      }

      moduleLogger.info("日志配置已应用", {
        level: settings.logLevel,
        logToFile: settings.logToFile,
        logToConsole: settings.logToConsole,
        bufferSize: settings.logBufferSize,
        maxFileSize: settings.maxFileSize,
      });
    } catch (error) {
      errorHandler.handle(error, { userMessage: "应用日志配置失败", showToUser: false });
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
      errorHandler.handle(error, { userMessage: "初始化日志配置失败", showToUser: false });
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
        () => settings.maxFileSize,
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