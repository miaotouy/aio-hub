// LLM 检查器相关类型定义

export interface HeaderOverrideRule {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export interface InspectorConfig {
  port: number;
  target_url: string;
  header_override_rules: HeaderOverrideRule[];
}

export interface InspectorStatus {
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

export interface LlmInspectorSettings {
  config: InspectorConfig;
  searchQuery: string;
  filterStatus: string;
  maskApiKeys?: boolean;
  targetUrlHistory?: string[]; // 目标地址历史记录
  version?: string;
}

export interface StreamBuffer {
  [recordId: string]: string;
}

export interface InspectorServiceState {
  isRunning: boolean;
  port: number;
  targetUrl: string;
}

// 事件类型
export type InspectorEventType = 'inspector-request' | 'inspector-response' | 'inspector-stream-update';

export interface InspectorEvent<T = any> {
  type: InspectorEventType;
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