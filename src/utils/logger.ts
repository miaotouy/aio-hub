/**
 * 统一日志工具
 * 提供分级日志、错误追踪和日志持久化功能
 */

import { writeTextFile, exists, mkdir, stat, rename } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { formatDateTime } from "./time";

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
  collapsed?: boolean; // 是否在控制台中折叠显示
}

class Logger {
  private currentLevel: LogLevel = LogLevel.DEBUG;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private logFilePath: string | null = null;
  private logsDir: string | null = null;
  private isInitialized = false;
  private logToFile = true;
  private logToConsole = true;
  private maxFileSize = 2 * 1024 * 1024; // 2MB
  private currentFileSize = 0;
  private isRotating = false;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化日志系统
   */
  private async initialize() {
    try {
      const appDir = await appDataDir();
      this.logsDir = await join(appDir, "logs");

      if (!(await exists(this.logsDir))) {
        await mkdir(this.logsDir, { recursive: true });
      }

      // 使用本地时间生成文件名，避免时区导致日期偏差
      const date = formatDateTime(new Date(), 'yyyy-MM-dd');

      this.logFilePath = await join(this.logsDir, `app-${date}.log`);

      // 获取当前文件大小
      if (await exists(this.logFilePath)) {
        const fileInfo = await stat(this.logFilePath);
        this.currentFileSize = fileInfo.size;
      } else {
        this.currentFileSize = 0;
      }

      this.isInitialized = true;
    } catch (error) {
      console.error("初始化日志系统失败:", error);
    }
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  /**
   * 设置是否写入文件日志
   */
  setLogToFile(enabled: boolean) {
    this.logToFile = enabled;
  }

  /**
   * 设置是否输出到控制台
   */
  setLogToConsole(enabled: boolean) {
    this.logToConsole = enabled;
  }

  /**
   * 设置日志缓冲区大小
   */
  setLogBufferSize(size: number) {
    this.maxBufferSize = size;
    // 如果当前缓冲区超过新的大小，截断最早的日志
    while (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
  }

  /**
   * 设置单个日志文件最大大小 (字节)
   */
  setMaxFileSize(size: number) {
    this.maxFileSize = size;
  }

  /**
   * 获取当前日志配置
   */
  getLogConfig() {
    return {
      level: LogLevel[this.currentLevel] as keyof typeof LogLevel,
      logToFile: this.logToFile,
      logToConsole: this.logToConsole,
      bufferSize: this.maxBufferSize,
      maxFileSize: this.maxFileSize,
    };
  }

  /**
   * 检查并轮转日志文件
   */
  private async checkAndRotate() {
    if (this.isRotating) return;

    // 必须有路径
    if (!this.logFilePath || !this.logsDir) {
      return;
    }

    // 1. 内存预判：如果内存计数器显示未超标，直接返回，避免频繁 IO
    if (this.currentFileSize < this.maxFileSize) {
      return;
    }

    this.isRotating = true;
    try {
      // 2. 真实性检查：多窗口环境下，内存状态可能滞后
      // 必须获取文件实际大小，确认是否真的需要轮转
      if (!(await exists(this.logFilePath))) {
        // 文件不存在，说明可能被删除了或刚被轮转，重置状态
        this.currentFileSize = 0;
        return;
      }

      const fileInfo = await stat(this.logFilePath);
      const realSize = fileInfo.size;

      // 如果实际大小小于阈值，说明文件已经被其他实例轮转过了
      if (realSize < this.maxFileSize) {
        // 同步内存状态为真实大小
        this.currentFileSize = realSize;
        // console.debug("[Logger] 文件大小未达标(可能已被其他窗口轮转)，跳过轮转");
        return;
      }

      // 3. 执行轮转
      // 生成备份文件名: app-YYYY-MM-DD.HH-mm-ss.log (使用本地时间)
      const now = new Date();
      const dateStr = formatDateTime(now, 'yyyy-MM-dd');
      const timeStr = formatDateTime(now, 'HH-mm-ss');
      const backupName = `app-${dateStr}.${timeStr}.log`;
      const backupPath = await join(this.logsDir, backupName);

      // 重命名当前日志文件
      await rename(this.logFilePath, backupPath);

      // 重置当前文件大小
      this.currentFileSize = 0;

      // 在控制台记录轮转信息（不写入文件以免死循环）
      console.log(`[Logger] 日志文件已轮转: ${backupName}`);
    } catch (error) {
      console.error("[Logger] 日志轮转失败:", error);
    } finally {
      this.isRotating = false;
    }
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

    // 输出到控制台（如果启用）
    if (this.logToConsole) {
      if (entry.collapsed) {
        // 使用折叠组显示
        const levelStr = LogLevel[entry.level];
        const groupTitle = `[${entry.timestamp}] [${levelStr}] [${entry.module}] ${entry.message}`;

        // 根据日志级别选择合适的控制台方法
        const consoleMethod = this.getConsoleMethod(entry.level);
        consoleMethod(groupTitle);
        console.groupCollapsed('详细信息');

        if (entry.data) {
          try {
            console.log('数据:', entry.data);
          } catch (error) {
            console.log('数据: [无法序列化]');
          }
        }

        if (entry.stack) {
          console.log('堆栈:', entry.stack);
        }

        console.groupEnd();
      } else {
        // 原有的非折叠逻辑
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
      }
    }

    // 写入文件（异步，不阻塞）
    if (this.logToFile && this.isInitialized && this.logFilePath) {
      try {
        const logLine = this.formatLogEntry(entry) + "\n";
        const lineSize = new TextEncoder().encode(logLine).length;

        // 检查是否需要轮转（加上新日志大小后是否超标）
        if (this.currentFileSize + lineSize > this.maxFileSize) {
          await this.checkAndRotate();
        }

        await writeTextFile(this.logFilePath, logLine, { append: true });
        this.currentFileSize += lineSize;
      } catch (error) {
        // 写入失败不影响主流程
        console.error("写入日志文件失败:", error);
      }
    }
  }

  /**
   * 根据日志级别获取对应的控制台方法
   */
  private getConsoleMethod(level: LogLevel): typeof console.log {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug.bind(console);
      case LogLevel.INFO:
        return console.info.bind(console);
      case LogLevel.WARN:
        return console.warn.bind(console);
      case LogLevel.ERROR:
        return console.error.bind(console);
      default:
        return console.log.bind(console);
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
    error?: Error,
    collapsed?: boolean
  ): LogEntry {
    // 使用本地时间格式 YYYY-MM-DD HH:mm:ss.SSS
    const timestamp = formatDateTime(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');

    return {
      timestamp,
      level,
      module,
      message,
      data,
      stack: error?.stack,
      collapsed,
    };
  }

  /**
   * Debug 日志
   */
  debug(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.DEBUG) {
      this.writeLog(this.createEntry(LogLevel.DEBUG, module, message, data, undefined, collapsed));
    }
  }

  /**
   * Info 日志
   */
  info(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.INFO) {
      this.writeLog(this.createEntry(LogLevel.INFO, module, message, data, undefined, collapsed));
    }
  }

  /**
   * Warning 日志
   */
  warn(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.WARN) {
      this.writeLog(this.createEntry(LogLevel.WARN, module, message, data, undefined, collapsed));
    }
  }

  /**
   * Error 日志
   */
  error(module: string, message: string, error?: Error | any, data?: any, collapsed?: boolean) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.writeLog(this.createEntry(LogLevel.ERROR, module, message, data, errorObj, collapsed));
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
      const logs = this.logBuffer.map((entry) => this.formatLogEntry(entry)).join("\n");
      await writeTextFile(filePath, logs);
    } catch (error) {
      console.error("导出日志失败:", error);
      throw error;
    }
  }
}

// 全局单例
export const logger = new Logger();

// 便捷的模块日志创建器
export function createModuleLogger(moduleName: string) {
  return {
    debug: (message: string, data?: any, collapsed?: boolean) =>
      logger.debug(moduleName, message, data, collapsed),
    info: (message: string, data?: any, collapsed?: boolean) =>
      logger.info(moduleName, message, data, collapsed),
    warn: (message: string, data?: any, collapsed?: boolean) =>
      logger.warn(moduleName, message, data, collapsed),
    error: (message: string, error?: Error | any, data?: any, collapsed?: boolean) =>
      logger.error(moduleName, message, error, data, collapsed),
  };
}
