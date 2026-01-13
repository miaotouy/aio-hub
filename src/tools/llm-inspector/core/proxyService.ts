import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createModuleLogger } from '@utils/logger';
import { createModuleErrorHandler } from '@utils/errorHandler';
import type { InspectorConfig, InspectorStatus, RequestRecord, ResponseRecord, StreamUpdate } from '../types';

const logger = createModuleLogger('LlmInspector/ProxyService');
const errorHandler = createModuleErrorHandler('LlmInspector/ProxyService');

// 事件监听器清理函数集合
const eventListeners: Set<() => void> = new Set();

/**
 * 启动检查器服务
 */
export async function startInspectorService(config: InspectorConfig): Promise<string> {
  try {
    logger.info('启动检查器服务', { port: config.port, targetUrl: config.target_url });
    const result = await invoke('start_llm_inspector', { config });
    logger.info('检查器服务启动成功', { result });
    return result as string;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '启动检查器服务失败', context: { config }, showToUser: false });
    throw new Error(`启动检查器失败: ${error}`);
  }
}

/**
 * 停止检查器服务
 */
export async function stopInspectorService(): Promise<string> {
  try {
    logger.info('停止检查器服务');
    const result = await invoke('stop_llm_inspector');
    logger.info('检查器服务停止成功', { result });

    // 清理所有事件监听器
    clearAllEventListeners();

    return result as string;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '停止检查器服务失败', showToUser: false });
    throw new Error(`停止检查器失败: ${error}`);
  }
}

/**
 * 获取检查器状态
 */
export async function getInspectorServiceStatus(): Promise<InspectorStatus> {
  try {
    const status = await invoke('get_inspector_status') as InspectorStatus;
    logger.debug('获取检查器状态', { status });
    return status;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '获取检查器状态失败', showToUser: false });
    throw new Error(`获取检查器状态失败: ${error}`);
  }
}

/**
 * 更新检查器目标地址
 */
export async function updateInspectorTarget(targetUrl: string): Promise<string> {
  try {
    logger.info('更新检查器目标地址', { targetUrl });
    const result = await invoke('update_inspector_target', { targetUrl });
    logger.info('检查器目标地址更新成功', { result });
    return result as string;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '更新检查器目标地址失败', context: { targetUrl }, showToUser: false });
    throw new Error(`更新目标地址失败: ${error}`);
  }
}

/**
 * 监听检查器请求事件
 */
export async function onRequestEvent(callback: (request: RequestRecord) => void): Promise<() => void> {
  try {
    const unlisten = await listen('inspector-request', (event) => {
      const request = event.payload as RequestRecord;
      logger.debug('收到检查器请求事件', { requestId: request.id, method: request.method, url: request.url });
      callback(request);
    });

    eventListeners.add(unlisten);
    logger.debug('检查器请求事件监听器已设置');

    return () => {
      unlisten();
      eventListeners.delete(unlisten);
      logger.debug('检查器请求事件监听器已清理');
    };
  } catch (error) {
    errorHandler.handle(error, { userMessage: '设置检查器请求事件监听器失败', showToUser: false });
    throw new Error(`设置请求监听器失败: ${error}`);
  }
}

/**
 * 监听检查器响应事件
 */
export async function onResponseEvent(callback: (response: ResponseRecord) => void): Promise<() => void> {
  try {
    const unlisten = await listen('inspector-response', (event) => {
      const response = event.payload as ResponseRecord;
      logger.debug('收到检查器响应事件', {
        requestId: response.id,
        status: response.status,
        duration: response.duration_ms
      });
      callback(response);
    });

    eventListeners.add(unlisten);
    logger.debug('检查器响应事件监听器已设置');

    return () => {
      unlisten();
      eventListeners.delete(unlisten);
      logger.debug('检查器响应事件监听器已清理');
    };
  } catch (error) {
    errorHandler.handle(error, { userMessage: '设置检查器响应事件监听器失败', showToUser: false });
    throw new Error(`设置响应监听器失败: ${error}`);
  }
}

/**
 * 监听流式更新事件
 */
export async function onStreamUpdateEvent(callback: (update: StreamUpdate) => void): Promise<() => void> {
  try {
    const unlisten = await listen('inspector-stream-update', (event) => {
      const update = event.payload as StreamUpdate;
      logger.debug('收到流式更新事件', {
        streamId: update.id,
        isComplete: update.is_complete,
        chunkLength: update.chunk?.length
      });
      callback(update);
    });

    eventListeners.add(unlisten);
    logger.debug('流式更新事件监听器已设置');

    return () => {
      unlisten();
      eventListeners.delete(unlisten);
      logger.debug('流式更新事件监听器已清理');
    };
  } catch (error) {
    errorHandler.handle(error, { userMessage: '设置流式更新事件监听器失败', showToUser: false });
    throw new Error(`设置流式监听器失败: ${error}`);
  }
}

/**
 * 清理所有事件监听器
 */
export function clearAllEventListeners(): void {
  logger.debug('清理所有事件监听器', { count: eventListeners.size });

  eventListeners.forEach(unlisten => {
    try {
      unlisten();
    } catch (error) {
      errorHandler.handle(error, { userMessage: '清理事件监听器失败', showToUser: false });
    }
  });

  eventListeners.clear();
  logger.debug('所有事件监听器已清理');
}

/**
 * 检查检查器服务是否正在运行
 */
export async function isInspectorRunning(): Promise<boolean> {
  try {
    const status = await getInspectorServiceStatus();
    return status.is_running;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '检查检查器运行状态失败', showToUser: false });
    return false;
  }
}

/**
 * 等待检查器服务启动
 */
export async function waitForInspectorStart(timeout: number = 5000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const status = await getInspectorServiceStatus();
      if (status.is_running) {
        logger.info('检查器服务已启动', { port: status.port });
        return true;
      }
    } catch (error) {
      // 忽略错误，继续等待
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  logger.warn('等待检查器服务启动超时', { timeout });
  return false;
}

/**
 * 等待检查器服务停止
 */
export async function waitForInspectorStop(timeout: number = 5000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const status = await getInspectorServiceStatus();
      if (!status.is_running) {
        logger.info('检查器服务已停止');
        return true;
      }
    } catch (error) {
      // 如果获取状态失败，可能已经停止了
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  logger.warn('等待检查器服务停止超时', { timeout });
  return false;
}