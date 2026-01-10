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
  id: string;
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
  stack?: string;
  collapsed?: boolean;
}

export type LogListener = (entry: LogEntry) => void;

class Logger {
  private currentLevel: LogLevel = LogLevel.DEBUG;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private listeners: Set<LogListener> = new Set();

  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  setMaxLogs(max: number) {
    this.maxLogs = max;
    this.trimLogs();
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 23);
  }

  private trimLogs() {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(this.logs.length - this.maxLogs);
    }
  }

  private writeLog(entry: LogEntry) {
    // 存入内存缓冲区
    this.logs.push(entry);
    this.trimLogs();

    // 通知监听者
    this.listeners.forEach(listener => listener(entry));

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
      id: Math.random().toString(36).substring(2, 11),
      timestamp: this.formatTimestamp(),
      level,
      module,
      message,
      data,
      stack: error?.stack,
      collapsed,
    };
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  subscribe(listener: LogListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  exportLogs(): string {
    return this.logs.map(entry => {
      const levelStr = LogLevel[entry.level];
      let line = `[${entry.timestamp}] [${levelStr}] [${entry.module}] ${entry.message}`;
      if (entry.data) {
        line += `\nData: ${JSON.stringify(entry.data, null, 2)}`;
      }
      if (entry.stack) {
        line += `\nStack: ${entry.stack}`;
      }
      return line;
    }).join('\n' + '-'.repeat(40) + '\n');
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