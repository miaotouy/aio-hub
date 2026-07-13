// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 统一日志工具
 * 提供分级日志、错误追踪和日志持久化功能
 */

import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "./appPath";
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

const MAX_LOG_STRING_LENGTH = 4000;
const MAX_LOG_ARRAY_ITEMS = 50;
const MAX_LOG_OBJECT_KEYS = 200;
const MAX_LOG_DATA_DEPTH = 8;
// 字符串进入 sanitize 流程的硬上限
const MAX_LOG_STRING_SCAN_LENGTH = 64 * 1024;
const BASE64_FIELD_PATTERN =
  /^(?:dataUrl|base64|imageBase64|audioBase64|videoBase64|fileData|imageData|audioData|videoData|inlineData)$/i;
const BASE64ISH_VALUE_PATTERN = /^[A-Za-z0-9+/=_-]+$/;
const DATA_URL_PATTERN =
  /data:([\w.+/-]+)?(?:;[\w=.+-]+)*;base64,([A-Za-z0-9+/=_-]{128,})/g;

function estimateBase64Bytes(base64: string): number {
  const normalized = base64.replace(/[\r\n\s]/g, "");
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function formatPayloadSummary(
  kind: string,
  chars: number,
  estimatedBytes?: number
): string {
  const bytesPart =
    estimatedBytes === undefined ? "" : `, bytes≈${estimatedBytes}`;
  return `[${kind} omitted, chars=${chars}${bytesPart}]`;
}

function summarizeDataUrl(match: string, mimeType?: string, base64 = "") {
  const kind = mimeType ? `DataURL ${mimeType}` : "DataURL";
  return formatPayloadSummary(kind, match.length, estimateBase64Bytes(base64));
}

function isProbablyBase64Payload(value: string): boolean {
  if (value.length < 512 || !BASE64ISH_VALUE_PATTERN.test(value)) {
    return false;
  }

  return value.length % 4 === 0;
}

function sanitizeLogString(value: string, key?: string): string {
  if (value.length > MAX_LOG_STRING_SCAN_LENGTH) {
    const head = value.slice(0, 64);
    return `[String omitted, length=${value.length}, head=${head}]`;
  }
  const replacedDataUrls = value.replace(DATA_URL_PATTERN, summarizeDataUrl);
  const looksLikePayloadField = key ? BASE64_FIELD_PATTERN.test(key) : false;

  if (
    replacedDataUrls === value &&
    looksLikePayloadField &&
    isProbablyBase64Payload(value)
  ) {
    return formatPayloadSummary(
      "Base64 payload",
      value.length,
      estimateBase64Bytes(value)
    );
  }

  if (replacedDataUrls.length > MAX_LOG_STRING_LENGTH) {
    return `${replacedDataUrls.slice(0, MAX_LOG_STRING_LENGTH)}... [truncated, chars=${replacedDataUrls.length}]`;
  }

  return replacedDataUrls;
}

function sanitizeLogData(
  value: any,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
  key?: string
): any {
  if (typeof value === "string") {
    return sanitizeLogString(value, key);
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return String(value);
  }

  if (depth >= MAX_LOG_DATA_DEPTH) {
    return "[Object Max Depth Reached]";
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogString(value.message),
      stack: value.stack ? sanitizeLogString(value.stack) : undefined,
    };
  }

  if (ArrayBuffer.isView(value)) {
    return `[${value.constructor.name} omitted, bytes=${value.byteLength}]`;
  }

  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer omitted, bytes=${value.byteLength}]`;
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_LOG_ARRAY_ITEMS)
      .map((item) => sanitizeLogData(item, depth + 1, seen));
    if (value.length > MAX_LOG_ARRAY_ITEMS) {
      items.push(`[... ${value.length - MAX_LOG_ARRAY_ITEMS} more items]`);
    }
    return items;
  }

  const sanitized: Record<string, any> = {};
  const keys = Object.keys(value);

  for (const objectKey of keys.slice(0, MAX_LOG_OBJECT_KEYS)) {
    try {
      sanitized[objectKey] = sanitizeLogData(
        value[objectKey],
        depth + 1,
        seen,
        objectKey
      );
    } catch (error) {
      sanitized[objectKey] = "[Unreadable Property]";
    }
  }

  if (keys.length > MAX_LOG_OBJECT_KEYS) {
    sanitized._moreKeys = `[... ${keys.length - MAX_LOG_OBJECT_KEYS} more keys]`;
  }

  return sanitized;
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
      const appDir = await getAppConfigDir();
      this.logsDir = await join(appDir, "logs");

      const isDirExists = await invoke<boolean>("path_exists", {
        path: this.logsDir,
      });
      if (!isDirExists) {
        await invoke("create_dir_force", { path: this.logsDir });
      }

      // 使用应用时区生成文件名，避免时区导致日期偏差
      const date = formatDateTime(new Date(), "yyyy-MM-dd");

      this.logFilePath = await join(this.logsDir, `app-${date}.log`);

      // 获取当前文件大小
      const isFileExists = await invoke<boolean>("path_exists", {
        path: this.logFilePath,
      });
      if (isFileExists) {
        const fileInfo = await invoke<{ size: number }>("get_file_metadata", {
          path: this.logFilePath,
        });
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
      const isExists = await invoke<boolean>("path_exists", {
        path: this.logFilePath,
      });
      if (!isExists) {
        // 文件不存在，说明可能被删除了或刚被轮转，重置状态
        this.currentFileSize = 0;
        return;
      }

      const fileInfo = await invoke<{ size: number }>("get_file_metadata", {
        path: this.logFilePath,
      });
      const realSize = fileInfo.size;

      // 如果实际大小小于阈值，说明文件已经被其他实例轮转过了
      if (realSize < this.maxFileSize) {
        // 同步内存状态为真实大小
        this.currentFileSize = realSize;
        // console.debug("[Logger] 文件大小未达标(可能已被其他窗口轮转)，跳过轮转");
        return;
      }

      // 3. 执行轮转
      // 生成备份文件名: app-YYYY-MM-DD.HH-mm-ss.log (使用应用时区)
      const now = new Date();
      const dateStr = formatDateTime(now, "yyyy-MM-dd");
      const timeStr = formatDateTime(now, "HH-mm-ss");
      const backupName = `app-${dateStr}.${timeStr}.log`;
      const backupPath = await join(this.logsDir, backupName);

      // 重命名当前日志文件
      // 注意：这里暂时保留原有的 rename 调用，因为 fs_scope 已经扩展
      // 如果 rename 依然受限，后续可考虑增加 move_file_force 命令
      const { rename } = await import("@tauri-apps/plugin-fs");
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
        console.groupCollapsed("详细信息");

        if (entry.data) {
          try {
            console.log("数据:", entry.data);
          } catch (error) {
            console.log("数据: [无法序列化]");
          }
        }

        if (entry.stack) {
          console.log("堆栈:", entry.stack);
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

        // 使用 Rust 后端命令强制追加，绕过前端 Scope 限制
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(logLine);

        // 性能监控：记录大数据量的 IPC 调用
        const isLargeLog = uint8Array.length > 500000;
        const startTime = isLargeLog ? performance.now() : 0;

        await invoke("append_file_force", {
          path: this.logFilePath,
          // 关键优化：Tauri v2 支持直接传递 Uint8Array，
          // 使用 Array.from 会导致数据膨胀数倍且序列化极其缓慢
          content: uint8Array,
        });

        if (isLargeLog) {
          const duration = performance.now() - startTime;
          console.debug(
            `[Logger] 大日志 IPC 写入耗时: ${duration.toFixed(2)}ms, 大小: ${(uint8Array.length / 1024).toFixed(2)}KB`
          );
        }

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
    // 使用应用时区格式 YYYY-MM-DD HH:mm:ss.SSS
    const timestamp = formatDateTime(new Date(), "yyyy-MM-dd HH:mm:ss.SSS");

    return {
      timestamp,
      level,
      module,
      message,
      data: data === undefined ? undefined : sanitizeLogData(data),
      stack: error?.stack,
      collapsed,
    };
  }

  /**
   * Debug 日志
   */
  debug(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.DEBUG) {
      this.writeLog(
        this.createEntry(
          LogLevel.DEBUG,
          module,
          message,
          data,
          undefined,
          collapsed
        )
      );
    }
  }

  /**
   * Info 日志
   */
  info(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.INFO) {
      this.writeLog(
        this.createEntry(
          LogLevel.INFO,
          module,
          message,
          data,
          undefined,
          collapsed
        )
      );
    }
  }

  /**
   * Warning 日志
   */
  warn(module: string, message: string, data?: any, collapsed?: boolean) {
    if (this.currentLevel <= LogLevel.WARN) {
      this.writeLog(
        this.createEntry(
          LogLevel.WARN,
          module,
          message,
          data,
          undefined,
          collapsed
        )
      );
    }
  }

  /**
   * Error 日志
   */
  error(
    module: string,
    message: string,
    error?: Error | any,
    data?: any,
    collapsed?: boolean
  ) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.writeLog(
      this.createEntry(
        LogLevel.ERROR,
        module,
        message,
        data,
        errorObj,
        collapsed
      )
    );
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
      const logs = this.logBuffer
        .map((entry) => this.formatLogEntry(entry))
        .join("\n");
      // 导出日志也使用强制写入命令
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(logs);
      await invoke("write_file_force", {
        path: filePath,
        content: uint8Array,
      });
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
    error: (
      message: string,
      error?: Error | any,
      data?: any,
      collapsed?: boolean
    ) => logger.error(moduleName, message, error, data, collapsed),
  };
}
