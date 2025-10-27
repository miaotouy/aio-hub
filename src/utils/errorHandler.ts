/**
 * 全局错误处理工具
 * 提供统一的错误捕获、处理和用户提示
 */

import { ElNotification } from 'element-plus';
import { createModuleLogger } from './logger';
import { customMessage } from './customMessage';

const logger = createModuleLogger('ErrorHandler');

/**
 * 错误级别
 */
export enum ErrorLevel {
  /** 信息 - 不中断用户操作 */
  INFO = 'info',
  /** 警告 - 可能影响用户体验 */
  WARNING = 'warning',
  /** 错误 - 影响功能但不崩溃 */
  ERROR = 'error',
  /** 严重 - 可能导致应用崩溃 */
  CRITICAL = 'critical',
}

/**
 * 错误处理选项
 */
export interface ErrorHandlerOptions {
  /** 错误级别 */
  level?: ErrorLevel;
  /** 是否显示用户提示 */
  showToUser?: boolean;
  /** 自定义用户消息 */
  userMessage?: string;
  /** 错误上下文数据 */
  context?: Record<string, any>;
  /** 模块名称 */
  module?: string;
}

/**
 * 标准化错误对象
 */
export interface StandardError {
  message: string;
  code?: string;
  stack?: string;
  level: ErrorLevel;
  module: string;
  context?: Record<string, any>;
  timestamp: string;
  originalError?: any;
}

/**
 * 全局错误处理器类
 */
class GlobalErrorHandler {
  private errorQueue: StandardError[] = [];
  private maxQueueSize = 100;

  /**
   * 标准化错误
   */
  private standardizeError(
    error: any,
    options: ErrorHandlerOptions = {}
  ): StandardError {
    const {
      level = ErrorLevel.ERROR,
      context = {},
      module = 'Unknown',
    } = options;

    let message = '未知错误';
    let stack: string | undefined;
    let code: string | undefined;

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
      code = (error as any).code;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      message = error.message || JSON.stringify(error);
      code = error.code;
      stack = error.stack;
    }

    return {
      message,
      code,
      stack,
      level,
      module,
      context,
      timestamp: new Date().toISOString(),
      originalError: error,
    };
  }

  /**
   * 处理错误
   */
  handle(error: any, options: ErrorHandlerOptions = {}): StandardError {
    // 特殊处理：AbortError 是用户主动取消操作，不应该作为错误处理
    if (error instanceof Error && error.name === 'AbortError') {
      const standardError = this.standardizeError(error, {
        ...options,
        level: ErrorLevel.INFO,
      });
      
      // 只记录到日志，不显示给用户
      logger.info('操作已取消', {
        module: options.module || 'Unknown',
        context: options.context,
      });
      
      return standardError;
    }

    const standardError = this.standardizeError(error, options);

    // 添加到错误队列
    this.errorQueue.push(standardError);
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift();
    }

    // 记录到日志
    this.logError(standardError);

    // 显示给用户（如果需要）
    if (options.showToUser !== false) {
      this.showToUser(standardError, options.userMessage);
    }

    return standardError;
  }

  /**
   * 记录错误到日志系统
   */
  private logError(error: StandardError): void {
    const logData = {
      code: error.code,
      context: error.context,
      timestamp: error.timestamp,
    };

    switch (error.level) {
      case ErrorLevel.INFO:
        logger.info(error.message, logData);
        break;
      case ErrorLevel.WARNING:
        logger.warn(error.message, logData);
        break;
      case ErrorLevel.ERROR:
      case ErrorLevel.CRITICAL:
        logger.error(error.message, error.originalError, logData);
        break;
    }
  }

  /**
   * 显示错误给用户
   */
  private showToUser(error: StandardError, userMessage?: string): void {
    const message = userMessage || this.getUserFriendlyMessage(error);

    switch (error.level) {
      case ErrorLevel.INFO:
        customMessage.info(message);
        break;
      case ErrorLevel.WARNING:
        customMessage.warning(message);
        break;
      case ErrorLevel.ERROR:
        customMessage.error(message);
        break;
      case ErrorLevel.CRITICAL:
        ElNotification.error({
          title: '严重错误',
          message,
          duration: 0, // 不自动关闭
        });
        break;
    }
  }

  /**
   * 获取用户友好的错误消息
   */
  private getUserFriendlyMessage(error: StandardError): string {
    // 常见错误的用户友好翻译
    const friendlyMessages: Record<string, string> = {
      'Network request failed': '网络请求失败，请检查网络连接',
      'Failed to fetch': '无法连接到服务器，请检查网络',
      'Unauthorized': '未授权，请检查 API Key 配置',
      'Not Found': '请求的资源不存在',
      'Internal Server Error': '服务器内部错误',
    };

    // 检查是否有匹配的友好消息
    for (const [key, value] of Object.entries(friendlyMessages)) {
      if (error.message.includes(key)) {
        return value;
      }
    }

    // 默认返回原始错误消息
    return `${error.module}: ${error.message}`;
  }

  /**
   * 获取错误队列
   */
  getErrorQueue(): StandardError[] {
    return [...this.errorQueue];
  }

  /**
   * 清空错误队列
   */
  clearErrorQueue(): void {
    this.errorQueue = [];
  }

  /**
   * 异步函数错误包装器
   */
  async wrapAsync<T>(
    fn: () => Promise<T>,
    options: ErrorHandlerOptions = {}
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, options);
      return null;
    }
  }

  /**
   * 同步函数错误包装器
   */
  wrapSync<T>(
    fn: () => T,
    options: ErrorHandlerOptions = {}
  ): T | null {
    try {
      return fn();
    } catch (error) {
      this.handle(error, options);
      return null;
    }
  }
}

// 全局单例
export const errorHandler = new GlobalErrorHandler();

/**
 * 便捷的模块错误处理器创建函数
 */
export function createModuleErrorHandler(moduleName: string) {
  return {
    handle: (error: any, options: Omit<ErrorHandlerOptions, 'module'> = {}) =>
      errorHandler.handle(error, { ...options, module: moduleName }),

    wrapAsync: <T>(
      fn: () => Promise<T>,
      options: Omit<ErrorHandlerOptions, 'module'> = {}
    ) => errorHandler.wrapAsync(fn, { ...options, module: moduleName }),

    wrapSync: <T>(
      fn: () => T,
      options: Omit<ErrorHandlerOptions, 'module'> = {}
    ) => errorHandler.wrapSync(fn, { ...options, module: moduleName }),

    info: (error: any, userMessage?: string, context?: Record<string, any>) =>
      errorHandler.handle(error, {
        module: moduleName,
        level: ErrorLevel.INFO,
        userMessage,
        context,
      }),

    warn: (error: any, userMessage?: string, context?: Record<string, any>) =>
      errorHandler.handle(error, {
        module: moduleName,
        level: ErrorLevel.WARNING,
        userMessage,
        context,
      }),

    error: (error: any, userMessage?: string, context?: Record<string, any>) =>
      errorHandler.handle(error, {
        module: moduleName,
        level: ErrorLevel.ERROR,
        userMessage,
        context,
      }),

    critical: (error: any, userMessage?: string, context?: Record<string, any>) =>
      errorHandler.handle(error, {
        module: moduleName,
        level: ErrorLevel.CRITICAL,
        userMessage,
        context,
      }),
  };
}