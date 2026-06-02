/**
 * LLM Inspector 内部监控钩子的事件契约
 *
 * 这是基础设施层（A1），定义钩子注册器与触发器之间的类型契约。
 * 设计原则：
 * - 所有事件携带统一的 `requestId`，便于跨 trigger 关联（一次 request → 一次 response/error，可能有多次 stream chunk）。
 * - 事件体本身尽量结构化，避免把整个 fetch Response 对象塞进来（响应体在外部转字符串后再传递）。
 * - 默认开关 OFF，`InspectorState.captureInternal` 为 false 时所有 trigger 应短路。
 */
import type { ApiFormat } from "../core/apiFormat";

/** 内部监控请求事件 */
export interface InspectorRequestEvent {
  /** 单次请求的唯一 ID，response/stream/error 都关联此 ID */
  requestId: string;
  /** 触发时间戳 (ms) */
  timestamp: number;
  /** HTTP 方法 */
  method: string;
  /** 请求 URL */
  url: string;
  /** 请求头（已经清理过敏感字段的副本由调用方负责，注册器不做加工） */
  headers: Record<string, string>;
  /** 请求体（已转字符串） */
  body?: string;
  /** 调用方上下文（如哪个工具发起、属于哪个 session 等） */
  metadata?: InspectorContextMetadata;
}

/** 内部监控响应事件 */
export interface InspectorResponseEvent {
  /** 关联到对应请求的 ID */
  requestId: string;
  /** 触发时间戳 (ms) */
  timestamp: number;
  /** 响应状态码 */
  status: number;
  /** 响应头副本 */
  headers: Record<string, string>;
  /** 响应体（已转字符串）；流式响应可能为 undefined，由 stream 事件累积 */
  body?: string;
  /** 总耗时 (ms)，从 request 触发到 response 触发 */
  durationMs: number;
  /** 调用方上下文 */
  metadata?: InspectorContextMetadata;
}

/** 内部监控流式 chunk 事件 */
export interface InspectorStreamEvent {
  /** 关联到对应请求的 ID */
  requestId: string;
  /** 触发时间戳 (ms) */
  timestamp: number;
  /** 当前 chunk 原始内容（通常是 SSE 一段） */
  chunk: string;
  /** 是否为流的最后一个 chunk */
  isComplete: boolean;
  /** 调用方上下文 */
  metadata?: InspectorContextMetadata;
}

/** 内部监控错误事件 */
export interface InspectorErrorEvent {
  /** 关联到对应请求的 ID */
  requestId: string;
  /** 触发时间戳 (ms) */
  timestamp: number;
  /** 错误名称（如 AbortError / TypeError 等） */
  errorName: string;
  /** 错误消息 */
  errorMessage: string;
  /** 调用方上下文 */
  metadata?: InspectorContextMetadata;
}

/**
 * 调用方上下文元数据
 *
 * 用于 Inspector UI 展示「这条记录来自哪个工具、哪次会话、用于什么目的」。
 * 字段对齐计划 §B1 中预留的 inspectorContext，附加 profileId/modelId 等运行时信息。
 */
export interface InspectorContextMetadata {
  /** LLM Profile ID */
  profileId?: string;
  /** 具体的 Model ID */
  modelId?: string;
  /** 工具名（如 "llm-chat" / "translator"） */
  toolName?: string;
  /** 业务 Session ID（聊天会话、翻译批次等） */
  sessionId?: string;
  /** 业务意图（如 "chat" / "translate" / "regen-title" / "system-probe"） */
  purpose?: string;
  /** 检测到的 API 格式（可选，注册器不做强制检测） */
  apiFormat?: ApiFormat;
  /** 其他附加信息 */
  [key: string]: unknown;
}

/**
 * 外部代理（Tauri Rust Proxy）的状态机
 *
 * 区别于「内部钩子」的瞬间切换，外部代理的启停涉及绑定端口、与后端 IPC 通信，
 * 需要明确的 starting / stopping 过渡态以驱动 UI loading。
 */
export type ProxyStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

/**
 * Inspector 全局状态机
 *
 * 由 [`useInspectorManager`](src/tools/llm-inspector/composables/useInspectorManager.ts:1) 持有；钩子注册器只关心 `captureInternal`。
 * 这里集中定义类型，便于 C3 任务一次性扩展。
 */
export interface InspectorState {
  /** 总开关：关闭时所有监控均不工作 */
  isGlobalEnabled: boolean;
  /** 是否监听本地内部 LLM 调用（A/B 组的 hook 路径） */
  monitorInternal: boolean;
  /** 是否监听外部 HTTP 代理转发的请求 */
  monitorExternal: boolean;
  /** 外部代理状态机 */
  externalProxyStatus: ProxyStatus;
}

/**
 * 钩子回调接口
 *
 * 同一窗口内的本地订阅者（如 useInternalMonitor）实现此接口；
 * 每个回调都是可选的，注册器在触发时按存在性调用。
 */
export interface InspectorHooks {
  onRequest?: (event: InspectorRequestEvent) => void;
  onResponse?: (event: InspectorResponseEvent) => void;
  onStream?: (event: InspectorStreamEvent) => void;
  onError?: (event: InspectorErrorEvent) => void;
}

/**
 * Tauri Event 通道名（跨窗口广播）
 *
 * 与 Rust 现有外部代理事件（`inspector-request` / `inspector-response` /
 * `inspector-stream-update`）做明确区分，加 `internal` 前缀避免误混。
 */
export const INSPECTOR_INTERNAL_EVENT = {
  REQUEST: "inspector:internal:request",
  RESPONSE: "inspector:internal:response",
  STREAM: "inspector:internal:stream",
  ERROR: "inspector:internal:error",
} as const;

export type InspectorInternalEventName =
  (typeof INSPECTOR_INTERNAL_EVENT)[keyof typeof INSPECTOR_INTERNAL_EVENT];
