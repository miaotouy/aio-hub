/**
 * 移动端轻量级日志工具
 * 保持与桌面端接口一致，优先输出到控制台
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
  stack?: string;
  collapsed?: boolean;
}

class Logger {
  private currentLevel: LogLevel = LogLevel.DEBUG;

  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 23);
  }

  private writeLog(entry: LogEntry) {
    const levelStr = LogLevel[entry.level];
    const prefix = `[${entry.timestamp}] [${levelStr}] [${entry.module}]`;

    if (entry.collapsed) {
      console.groupCollapsed(`${prefix} ${entry.message}`);
      if (entry.data) console.log('Data:', entry.data);
      if (entry.stack) console.log('Stack:', entry.stack);
      console.groupEnd();
    } else {
      const args = [`${prefix} ${entry.message}`];
      if (entry.data) args.push(entry.data);
      if (entry.stack) args.push(entry.stack);

      switch (entry.level) {
        case LogLevel.DEBUG: console.debug(...args); break;
        case LogLevel.INFO: console.info(...args); break;
        case LogLevel.WARN: console.warn(...args); break;
        case LogLevel.ERROR: console.error(...args); break;
      }
    }
  }

  private createEntry(level: LogLevel, module: string, message: string, data?: any, error?: Error, collapsed?: boolean): LogEntry {
    return {
      timestamp: this.formatTimestamp(),
      level,
      module,
      message,
      data,
      stack: error?.stack,
      collapsed,
    };
  }

  debug(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.DEBUG) {
      this.writeLog(this.createEntry(LogLevel.DEBUG, module, message, data, undefined, collapsed));
    }
  }

  info(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.INFO) {
      this.writeLog(this.createEntry(LogLevel.INFO, module, message, data, undefined, collapsed));
    }
  }

  warn(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.WARN) {
      this.writeLog(this.createEntry(LogLevel.WARN, module, message, data, undefined, collapsed));
    }
  }

  error(module: string, message: string, error?: Error | any, data?: any, collapsed?: boolean) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.writeLog(this.createEntry(LogLevel.ERROR, module, message, data, errorObj, collapsed));
  }
}

export const logger = new Logger();

export function createModuleLogger(moduleName: string) {
  return {
    debug: (message: string, data?: any, collapsed?: boolean) => logger.debug(moduleName, message, data, collapsed),
    info: (message: string, data?: any, collapsed?: boolean) => logger.info(moduleName, message, data, collapsed),
    warn: (message: string, data?: any, collapsed?: boolean) => logger.warn(moduleName, message, data, collapsed),
    error: (message: string, error?: Error | any, data?: any, collapsed?: boolean) => logger.error(moduleName, message, error, data, collapsed),
  };
}