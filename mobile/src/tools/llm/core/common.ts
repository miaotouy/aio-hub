import { fetch, type ClientOptions } from '@tauri-apps/plugin-http';
import { useSettingsStore } from '@/stores/settings';

export * from '../types/common';

/**
 * 默认配置
 */
export const DEFAULT_TIMEOUT = 60000; // 60秒

/**
 * 获取当前代理配置，转换为 Tauri HTTP 插件的格式
 */
const getProxyConfig = (): ClientOptions['proxy'] | undefined => {
  // 注意：在非组件环境使用 store 需要在 pinia 激活后
  try {
    const settingsStore = useSettingsStore();
    const networkSettings = settingsStore.settings.network;
    
    if (!networkSettings) {
      return undefined;
    }
    
    switch (networkSettings.proxyMode) {
      case 'none':
        // 禁用代理：通过将 noProxy 设置为 '*' 来屏蔽所有主机，强制直连
        return { all: { url: 'http://localhost', noProxy: '*' } };
      case 'custom':
        if (networkSettings.proxyUrl) {
          return { all: networkSettings.proxyUrl };
        }
        return undefined;
      case 'system':
      default:
        // 系统代理：不传递 proxy 选项，让 Tauri 使用系统默认
        return undefined;
    }
  } catch (e) {
    // 如果 pinia 还没初始化，回退到默认
    return undefined;
  }
};

/**
 * 自定义超时错误
 */
export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * LLM API 错误
 */
export class LlmApiError extends Error {
  status: number;
  statusText: string;
  body?: string;

  constructor(message: string, status: number, statusText: string, body?: string) {
    super(message);
    this.name = 'LlmApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

/**
 * 确保响应成功，否则抛出 LlmApiError
 */
export const ensureResponseOk = async (response: Response): Promise<void> => {
  if (!response.ok) {
    let errorText = '';
    try {
      errorText = await response.text();
    } catch {
      // 忽略读取错误
    }
    throw new LlmApiError(
      `API 请求失败 (${response.status} ${response.statusText}): ${errorText}`,
      response.status,
      response.statusText,
      errorText
    );
  }
};

/**
 * 带超时控制的请求包装器
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout: number = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(`Request timed out after ${timeout}ms`));
  }, timeout);

  // 如果外部信号已经中止，立即抛出错误
  if (externalSignal?.aborted) {
    clearTimeout(timeoutId);
    throw externalSignal.reason || new DOMException('Aborted', 'AbortError');
  }

  // 监听外部中止信号
  const externalAbortHandler = () => {
    // 传递外部信号的原因
    controller.abort(externalSignal?.reason);
  };
  externalSignal?.addEventListener('abort', externalAbortHandler);

  try {
    const proxyConfig = getProxyConfig();
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      ...(proxyConfig && { proxy: proxyConfig }),
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', externalAbortHandler);
  }
};
