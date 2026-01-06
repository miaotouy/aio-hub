/**
 * 移动端全局错误处理工具
 * 对接 Varlet UI
 */

import { Snackbar, Dialog } from '@varlet/ui';
import { createModuleLogger } from './logger';

const logger = createModuleLogger('ErrorHandler');

export enum ErrorLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface ErrorHandlerOptions {
  level?: ErrorLevel;
  showToUser?: boolean;
  userMessage?: string;
  context?: Record<string, any>;
  module?: string;
}

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

class GlobalErrorHandler {
  private standardizeError(error: any, options: ErrorHandlerOptions = {}): StandardError {
    const { level = ErrorLevel.ERROR, context = {}, module = 'Unknown' } = options;
    let message = '未知错误';
    let stack: string | undefined;
    let code: string | undefined;

    if (error instanceof Error) {
      message = error.message || '未知错误';
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

  handle(error: any, options: ErrorHandlerOptions = {}): StandardError {
    if (error instanceof Error && error.name === 'AbortError') {
      const standardError = this.standardizeError(error, { ...options, level: ErrorLevel.INFO });
      logger.info('操作已取消', { module: options.module || 'Unknown', context: options.context });
      return standardError;
    }

    const standardError = this.standardizeError(error, options);
    this.logError(standardError);

    if (options.showToUser !== false) {
      this.showToUser(standardError, options.userMessage);
    }

    return standardError;
  }

  private logError(error: StandardError): void {
    const logData = { module: error.module, context: error.context };
    const msg = `[${error.module}] ${error.message}`;

    switch (error.level) {
      case ErrorLevel.INFO: logger.info(msg, logData); break;
      case ErrorLevel.WARNING: logger.warn(msg, logData); break;
      case ErrorLevel.ERROR:
      case ErrorLevel.CRITICAL: logger.error(msg, error.originalError, logData); break;
    }
  }

  private showToUser(error: StandardError, userMessage?: string): void {
    const displayMsg = userMessage || error.message;
    
    if (error.level === ErrorLevel.CRITICAL) {
      Dialog({
        title: `严重错误 [${error.module}]`,
        message: displayMsg,
      });
    } else {
      const typeMap: Record<string, any> = {
        [ErrorLevel.INFO]: 'info',
        [ErrorLevel.WARNING]: 'warning',
        [ErrorLevel.ERROR]: 'error',
      };
      
      Snackbar({
        content: `[${error.module}] ${displayMsg}`,
        type: typeMap[error.level] || 'error',
      });
    }
  }

  async wrapAsync<T>(fn: () => Promise<T>, options: ErrorHandlerOptions = {}): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, options);
      return null;
    }
  }

  wrapSync<T>(fn: () => T, options: ErrorHandlerOptions = {}): T | null {
    try {
      return fn();
    } catch (error) {
      this.handle(error, options);
      return null;
    }
  }
}

export const errorHandler = new GlobalErrorHandler();

export function createModuleErrorHandler(moduleName: string) {
  return {
    handle: (error: any, options: Omit<ErrorHandlerOptions, 'module'> = {}) =>
      errorHandler.handle(error, { ...options, module: moduleName }),
    wrapAsync: <T>(fn: () => Promise<T>, options: Omit<ErrorHandlerOptions, 'module'> = {}) =>
      errorHandler.wrapAsync(fn, { ...options, module: moduleName }),
    wrapSync: <T>(fn: () => T, options: Omit<ErrorHandlerOptions, 'module'> = {}) =>
      errorHandler.wrapSync(fn, { ...options, module: moduleName }),
    info: (error: any, userMessage?: string, context?: Record<string, any>) =>
      errorHandler.handle(error, { module: moduleName, level: ErrorLevel.INFO, userMessage, context }),
    warn: (error: any, userMessage?: string, context?: Record<string, any>) =>
      errorHandler.handle(error, { module: moduleName, level: ErrorLevel.WARNING, userMessage, context }),
    error: (error: any, userMessage?: string, context?: Record<string, any>) =>
      errorHandler.handle(error, { module: moduleName, level: ErrorLevel.ERROR, userMessage, context }),
    critical: (error: any, userMessage?: string, context?: Record<string, any>) =>
      errorHandler.handle(error, { module: moduleName, level: ErrorLevel.CRITICAL, userMessage, context }),
  };
}