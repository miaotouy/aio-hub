import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { createModuleLogger } from './logger';
import { createModuleErrorHandler } from './errorHandler';

const logger = createModuleLogger('utils/http-client');
const errorHandler = createModuleErrorHandler('utils/http-client');

export interface HttpClientOptions extends RequestInit {
  timeout?: number;
}

/**
 * 基于 Tauri Http 插件的 Fetch 封装
 * 用于绕过移动端 Webview 的 CORS 限制
 */
export async function httpClient(
  url: string,
  options: HttpClientOptions = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;

  // 处理超时
  const controller = new AbortController();
  const { signal } = controller;
  
  // 如果外部传入了 signal，则进行合并（简单处理：外部中止时中止内部）
  if (fetchOptions.signal) {
    fetchOptions.signal.addEventListener('abort', () => controller.abort());
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('请求超时', { url, timeout });
  }, timeout);

  try {
    const response = await tauriFetch(url, {
      ...fetchOptions,
      signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error('请求失败', new Error(`HTTP ${response.status} ${response.statusText}`), {
        url,
        status: response.status,
      });
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if ((error as any).name === 'AbortError') {
      logger.info('请求被中止', { url });
    } else {
      errorHandler.handle(error, {
        userMessage: '网络请求失败',
        showToUser: false,
        context: { url },
      });
    }
    
    throw error;
  }
}

/**
 * 获取流式响应
 */
export async function streamFetch(
  url: string,
  options: HttpClientOptions = {}
): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
  try {
    const response = await httpClient(url, {
      ...options,
      // 流式请求通常不需要默认的 30s 超时，或者设得更长
      timeout: options.timeout || 60000,
    });

    if (!response.ok || !response.body) {
      return null;
    }

    return response.body.getReader();
  } catch (error) {
    return null;
  }
}