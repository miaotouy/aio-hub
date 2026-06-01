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
export type InspectorEventType =
  | "inspector-request"
  | "inspector-response"
  | "inspector-stream-update";

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
export type ViewMode = "raw" | "text";

// ===================================================================
// 结构化消息解析（A2 新增，向后兼容追加）
// ===================================================================

/**
 * 解析后的消息块类型
 *
 * 用于把 OpenAI / Anthropic / Gemini 等不同格式的多模态/工具调用内容
 * 归一化为统一的块结构，便于 UI 渲染（StructuredMessagesView）。
 */
export type ParsedMessageBlockType =
  | "text"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "image"
  | "refusal"
  | "unknown";

export interface ParsedMessageBlock {
  type: ParsedMessageBlockType;
  /** text / thinking / refusal 的纯文本内容 */
  text?: string;
  /** tool_call / tool_result 的工具名 */
  toolName?: string;
  /** tool_call 的参数（已解析为对象，若解析失败则保留字符串） */
  toolArguments?: unknown;
  /** tool_result 的返回内容 */
  toolResult?: unknown;
  /** tool_call_id（OpenAI / Anthropic 关联工具调用） */
  toolCallId?: string;
  /** 图像 URL 或 base64 引用（暂不展开数据） */
  imageRef?: string;
  /** 原始数据引用（unknown 类型时保留以便调试） */
  raw?: unknown;
}

/**
 * 解析后的消息
 */
export interface ParsedMessage {
  /** 归一化的角色名（保留 model 给 Gemini，便于追溯） */
  role: "system" | "user" | "assistant" | "tool" | "model" | "unknown";
  /** 该消息包含的所有块 */
  blocks: ParsedMessageBlock[];
  /** 该消息的原始结构引用，便于复杂场景下做精确排查 */
  raw?: unknown;
}

/**
 * 请求消息解析结果
 */
export interface RequestParseResult {
  /** 检测到的 API 格式 */
  format: string;
  /** 全部消息（含 system，按请求体顺序） */
  messages: ParsedMessage[];
  /** 请求体声明的模型 ID（如有） */
  model?: string;
  /** 是否启用了流式响应（按请求体声明） */
  stream?: boolean;
  /** 解析过程中遇到的非致命错误描述 */
  errors: string[];
}

/**
 * 响应消息解析结果
 */
export interface ResponseParseResult {
  /** 检测到的 API 格式 */
  format: string;
  /** 响应中的助手消息（一般 1 条；Gemini multi-candidate 时可能多条） */
  messages: ParsedMessage[];
  /** 响应中声明的模型 ID（如有） */
  model?: string;
  /** 停止原因（如 stop / length / tool_use 等） */
  stopReason?: string;
  /** 解析过程中遇到的非致命错误描述 */
  errors: string[];
}
