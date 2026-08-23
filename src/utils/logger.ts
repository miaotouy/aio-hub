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

export interface LoggerOptions {
  now?: () => Date;
}

interface AppLogAppendResult {
  path: string;
  rotatedFileName?: string | null;
}

const DEFAULT_MAX_FILE_SIZE = 512 * 1024;

export class Logger {
  private currentLevel: LogLevel = LogLevel.DEBUG;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private logFilePath: string | null = null;
  private logToFile = true;
  private logToConsole = true;
  private maxFileSize = DEFAULT_MAX_FILE_SIZE;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly now: () => Date;

  constructor(options: LoggerOptions = {}) {
    this.now = options.now ?? (() => new Date());
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
    while (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
  }

  /**
   * 设置单个日志文件最大大小 (字节)
   */
  setMaxFileSize(size: number) {
    if (Number.isFinite(size) && size > 0) {
      this.maxFileSize = size;
    }
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

  getLogFilePath(): string | null {
    return this.logFilePath;
  }

  /**
   * 等待所有已排队的文件写入完成。文件的日期切换和大小轮转由 Rust 命令在
   * 单一临界区内完成，确保多个 WebView 不会互相覆盖日志。
   */
  async flush(): Promise<void> {
    await this.writeQueue;
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
      } catch {
        log += `\n数据: [无法序列化]`;
      }
    }

    if (entry.stack) {
      log += `\n堆栈: ${entry.stack}`;
    }

    return log;
  }

  private getFileNameParts(entry: LogEntry): {
    date: string;
    archiveTime: string;
  } {
    const [date, time] = entry.timestamp.split(" ");
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") &&
      /^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(time ?? "")
    ) {
      return {
        date,
        archiveTime: time.replace(/:/g, "-").replace(".", "-"),
      };
    }

    const now = this.now();
    return {
      date: formatDateTime(now, "yyyy-MM-dd"),
      archiveTime: formatDateTime(now, "HH-mm-ss-SSS"),
    };
  }

  private enqueueFileWrite(entry: LogEntry) {
    const persistEntry = async () => {
      const logLine = `${this.formatLogEntry(entry)}\n`;
      const content = new TextEncoder().encode(logLine);
      const { date, archiveTime } = this.getFileNameParts(entry);
      const result = await invoke<AppLogAppendResult>("append_app_log", {
        date,
        archiveTime,
        content,
        maxFileSize: this.maxFileSize,
        syncData: entry.level === LogLevel.ERROR,
      });

      this.logFilePath = result.path;
      if (result.rotatedFileName) {
        console.info(`[Logger] 日志文件已轮转: ${result.rotatedFileName}`);
      }
    };

    // 不让单次写入失败污染后续队列；失败已在本次 task 中输出，下一条日志仍会尝试写入。
    const nextWrite = this.writeQueue.then(persistEntry, persistEntry);
    this.writeQueue = nextWrite.catch((error) => {
      console.error("写入日志文件失败:", error);
    });
  }

  /**
   * 写入日志
   */
  private writeLog(entry: LogEntry) {
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    if (this.logToConsole) {
      if (entry.collapsed) {
        const levelStr = LogLevel[entry.level];
        const groupTitle = `[${entry.timestamp}] [${levelStr}] [${entry.module}] ${entry.message}`;
        const consoleMethod = this.getConsoleMethod(entry.level);
        consoleMethod(groupTitle);
        console.groupCollapsed("详细信息");

        if (entry.data) {
          try {
            console.log("数据:", entry.data);
          } catch {
            console.log("数据: [无法序列化]");
          }
        }

        if (entry.stack) {
          console.log("堆栈:", entry.stack);
        }

        console.groupEnd();
      } else {
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

    // 在记录创建时决定是否落盘，确保之后用户关闭文件日志也不会丢弃已排队的记录。
    if (this.logToFile) {
      this.enqueueFileWrite(entry);
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
    const timestamp = formatDateTime(this.now(), "yyyy-MM-dd HH:mm:ss.SSS");

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
      await this.flush();
      const logs = this.logBuffer
        .map((entry) => this.formatLogEntry(entry))
        .join("\n");
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
