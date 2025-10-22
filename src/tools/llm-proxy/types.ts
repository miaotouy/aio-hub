// LLM 代理相关类型定义

export interface ProxyConfig {
  port: number;
  target_url: string;
}

export interface ProxyStatus {
  is_running: boolean;
  port: number;
  target_url: string;
}

export interface RequestRecord {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  request_size: number;
}

export interface ResponseRecord {
  id: string;
  timestamp: number;
  status: number;
  headers: Record<string, string>;
  body?: string;
  response_size: number;
  duration_ms: number;
}

export interface CombinedRecord {
  id: string;
  request: RequestRecord;
  response?: ResponseRecord;
}

export interface StreamUpdate {
  id: string;
  chunk: string;
  is_complete: boolean;
}

export interface LlmProxySettings {
  config: ProxyConfig;
  searchQuery: string;
  filterStatus: string;
  maskApiKeys?: boolean;
  version?: string;
}

export interface StreamBuffer {
  [recordId: string]: string;
}

export interface ProxyServiceState {
  isRunning: boolean;
  port: number;
  targetUrl: string;
}

// 事件类型
export type ProxyEventType = 'proxy-request' | 'proxy-response' | 'proxy-stream-update';

export interface ProxyEvent<T = any> {
  type: ProxyEventType;
  payload: T;
}

// 过滤器选项
export interface FilterOptions {
  searchQuery: string;
  filterStatus: string;
}

// 复制选项
export interface CopyOptions {
  maskApiKeys: boolean;
}

// 视图模式
export type ViewMode = 'raw' | 'text';