import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createModuleLogger } from '@utils/logger';
import { createModuleErrorHandler } from '@utils/errorHandler';
import type { ProxyConfig, ProxyStatus, RequestRecord, ResponseRecord, StreamUpdate } from './types';

const logger = createModuleLogger('LlmProxy/ProxyService');
const errorHandler = createModuleErrorHandler('LlmProxy/ProxyService');

// 事件监听器清理函数集合
const eventListeners: Set<() => void> = new Set();

/**
 * 启动代理服务
 */
export async function startProxyService(config: ProxyConfig): Promise<string> {
  try {
    logger.info('启动代理服务', { port: config.port, targetUrl: config.target_url });
    const result = await invoke('start_llm_proxy', { config });
    logger.info('代理服务启动成功', { result });
    return result as string;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '启动代理服务失败', context: { config }, showToUser: false });
    throw new Error(`启动代理失败: ${error}`);
  }
}

/**
 * 停止代理服务
 */
export async function stopProxyService(): Promise<string> {
  try {
    logger.info('停止代理服务');
    const result = await invoke('stop_llm_proxy');
    logger.info('代理服务停止成功', { result });
    
    // 清理所有事件监听器
    clearAllEventListeners();
    
    return result as string;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '停止代理服务失败', showToUser: false });
    throw new Error(`停止代理失败: ${error}`);
  }
}

/**
 * 获取代理状态
 */
export async function getProxyServiceStatus(): Promise<ProxyStatus> {
  try {
    const status = await invoke('get_proxy_status') as ProxyStatus;
    logger.debug('获取代理状态', { status });
    return status;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '获取代理状态失败', showToUser: false });
    throw new Error(`获取代理状态失败: ${error}`);
  }
}

/**
 * 更新代理目标地址
 */
export async function updateProxyTarget(targetUrl: string): Promise<string> {
  try {
    logger.info('更新代理目标地址', { targetUrl });
    const result = await invoke('update_proxy_target', { targetUrl });
    logger.info('代理目标地址更新成功', { result });
    return result as string;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '更新代理目标地址失败', context: { targetUrl }, showToUser: false });
    throw new Error(`更新目标地址失败: ${error}`);
  }
}

/**
 * 监听代理请求事件
 */
export async function onRequestEvent(callback: (request: RequestRecord) => void): Promise<() => void> {
  try {
    const unlisten = await listen('proxy-request', (event) => {
      const request = event.payload as RequestRecord;
      logger.debug('收到代理请求事件', { requestId: request.id, method: request.method, url: request.url });
      callback(request);
    });
    
    eventListeners.add(unlisten);
    logger.debug('代理请求事件监听器已设置');
    
    return () => {
      unlisten();
      eventListeners.delete(unlisten);
      logger.debug('代理请求事件监听器已清理');
    };
  } catch (error) {
    errorHandler.handle(error, { userMessage: '设置代理请求事件监听器失败', showToUser: false });
    throw new Error(`设置请求监听器失败: ${error}`);
  }
}

/**
 * 监听代理响应事件
 */
export async function onResponseEvent(callback: (response: ResponseRecord) => void): Promise<() => void> {
  try {
    const unlisten = await listen('proxy-response', (event) => {
      const response = event.payload as ResponseRecord;
      logger.debug('收到代理响应事件', { 
        requestId: response.id, 
        status: response.status, 
        duration: response.duration_ms 
      });
      callback(response);
    });
    
    eventListeners.add(unlisten);
    logger.debug('代理响应事件监听器已设置');
    
    return () => {
      unlisten();
      eventListeners.delete(unlisten);
      logger.debug('代理响应事件监听器已清理');
    };
  } catch (error) {
    errorHandler.handle(error, { userMessage: '设置代理响应事件监听器失败', showToUser: false });
    throw new Error(`设置响应监听器失败: ${error}`);
  }
}

/**
 * 监听流式更新事件
 */
export async function onStreamUpdateEvent(callback: (update: StreamUpdate) => void): Promise<() => void> {
  try {
    const unlisten = await listen('proxy-stream-update', (event) => {
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
 * 检查代理服务是否正在运行
 */
export async function isProxyRunning(): Promise<boolean> {
  try {
    const status = await getProxyServiceStatus();
    return status.is_running;
  } catch (error) {
    errorHandler.handle(error, { userMessage: '检查代理运行状态失败', showToUser: false });
    return false;
  }
}

/**
 * 等待代理服务启动
 */
export async function waitForProxyStart(timeout: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await getProxyServiceStatus();
      if (status.is_running) {
        logger.info('代理服务已启动', { port: status.port });
        return true;
      }
    } catch (error) {
      // 忽略错误，继续等待
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  logger.warn('等待代理服务启动超时', { timeout });
  return false;
}

/**
 * 等待代理服务停止
 */
export async function waitForProxyStop(timeout: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await getProxyServiceStatus();
      if (!status.is_running) {
        logger.info('代理服务已停止');
        return true;
      }
    } catch (error) {
      // 如果获取状态失败，可能已经停止了
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  logger.warn('等待代理服务停止超时', { timeout });
  return false;
}