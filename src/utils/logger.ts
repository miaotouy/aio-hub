/**
 * 统一日志工具
 * 提供分级日志、错误追踪和日志持久化功能
 */

import { writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

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
}

class Logger {
  private currentLevel: LogLevel = LogLevel.INFO;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private logFilePath: string | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化日志系统
   */
  private async initialize() {
    try {
      const appDir = await appDataDir();
      const logsDir = await join(appDir, 'logs');
      
      if (!await exists(logsDir)) {
        await mkdir(logsDir, { recursive: true });
      }
      
      const date = new Date().toISOString().split('T')[0];
      this.logFilePath = await join(logsDir, `app-${date}.log`);
      this.isInitialized = true;
    } catch (error) {
      console.error('初始化日志系统失败:', error);
    }
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  /**
   * 格式化日志条目
   */
  private formatLogEntry(entry: LogEntry): string {
    const levelStr = LogLevel[entry.level];
    let log = `[${entry.timestamp}] [${levelStr}] [${entry.module}] ${entry.message}`;
    
    if (entry.data) {
      try {
        log += `\n数据: ${JSON.stringify(entry.data, null, 2)}`;
      } catch (error) {
        log += `\n数据: [无法序列化]`;
      }
    }
    
    if (entry.stack) {
      log += `\n堆栈: ${entry.stack}`;
    }
    
    return log;
  }

  /**
   * 写入日志
   */
  private async writeLog(entry: LogEntry) {
    // 添加到缓冲区
    this.logBuffer.push(entry);
    
    // 保持缓冲区大小
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
    
    // 输出到控制台
    const consoleMsg = this.formatLogEntry(entry);
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(consoleMsg);
        break;
      case LogLevel.INFO:
        console.info(consoleMsg);
        break;
      case LogLevel.WARN:
        console.warn(consoleMsg);
        break;
      case LogLevel.ERROR:
        console.error(consoleMsg);
        break;
    }
    
    // 写入文件（异步，不阻塞）
    if (this.isInitialized && this.logFilePath) {
      try {
        const logLine = this.formatLogEntry(entry) + '\n';
        await writeTextFile(this.logFilePath, logLine, { append: true });
      } catch (error) {
        // 写入失败不影响主流程
        console.error('写入日志文件失败:', error);
      }
    }
  }

  /**
   * 创建日志条目
   */
  private createEntry(
    level: LogLevel,
    module: string,
    message: string,
    data?: any,
    error?: Error
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
      stack: error?.stack,
    };
  }

  /**
   * Debug 日志
   */
  debug(module: string, message: string, data?: any) {
    if (this.currentLevel <= LogLevel.DEBUG) {
      this.writeLog(this.createEntry(LogLevel.DEBUG, module, message, data));
    }
  }

  /**
   * Info 日志
   */
  info(module: string, message: string, data?: any) {
    if (this.currentLevel <= LogLevel.INFO) {
      this.writeLog(this.createEntry(LogLevel.INFO, module, message, data));
    }
  }

  /**
   * Warning 日志
   */
  warn(module: string, message: string, data?: any) {
    if (this.currentLevel <= LogLevel.WARN) {
      this.writeLog(this.createEntry(LogLevel.WARN, module, message, data));
    }
  }

  /**
   * Error 日志
   */
  error(module: string, message: string, error?: Error | any, data?: any) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.writeLog(this.createEntry(LogLevel.ERROR, module, message, data, errorObj));
  }

  /**
   * 获取日志缓冲区
   */
  getLogBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * 清空日志缓冲区
   */
  clearBuffer() {
    this.logBuffer = [];
  }

  /**
   * 导出日志到文件
   */
  async exportLogs(filePath: string): Promise<void> {
    try {
      const logs = this.logBuffer.map(entry => this.formatLogEntry(entry)).join('\n');
      await writeTextFile(filePath, logs);
    } catch (error) {
      console.error('导出日志失败:', error);
      throw error;
    }
  }
}

// 全局单例
export const logger = new Logger();

// 便捷的模块日志创建器
export function createModuleLogger(moduleName: string) {
  return {
    debug: (message: string, data?: any) => logger.debug(moduleName, message, data),
    info: (message: string, data?: any) => logger.info(moduleName, message, data),
    warn: (message: string, data?: any) => logger.warn(moduleName, message, data),
    error: (message: string, error?: Error | any, data?: any) => logger.error(moduleName, message, error, data),
  };
}