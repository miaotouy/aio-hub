import { createModuleLogger, logger as globalLogger, LogLevel } from "./logger";
import { createModuleErrorHandler } from "./errorHandler";
import { type AppSettings } from "./appSettings";

const logger = createModuleLogger("LogConfig");
const moduleErrorHandler = createModuleErrorHandler("LogConfig");

/**
 * 应用日志配置到 logger 实例
 * 必须在应用初始化早期调用，确保所有日志都使用正确的级别
 */
export const applyLogConfig = (settings: AppSettings) => {
  try {
    // 应用日志级别
    if (settings.logLevel) {
      const levelMap: Record<string, LogLevel> = {
        DEBUG: LogLevel.DEBUG,
        INFO: LogLevel.INFO,
        WARN: LogLevel.WARN,
        ERROR: LogLevel.ERROR,
      };
      globalLogger.setLevel(levelMap[settings.logLevel] ?? LogLevel.INFO);
    }

    // 应用日志输出配置
    globalLogger.setLogToFile(settings.logToFile ?? true);
    globalLogger.setLogToConsole(settings.logToConsole ?? true);

    // 应用日志缓冲区大小
    if (settings.logBufferSize) {
      globalLogger.setLogBufferSize(settings.logBufferSize);
    }

    logger.info("日志配置已应用", {
      level: settings.logLevel,
      logToFile: settings.logToFile,
      logToConsole: settings.logToConsole,
      bufferSize: settings.logBufferSize,
    });
  } catch (error) {
    moduleErrorHandler.handle(error, { userMessage: "应用日志配置失败", showToUser: false });
  }
};
