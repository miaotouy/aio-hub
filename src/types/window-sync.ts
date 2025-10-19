import type { Operation } from "fast-json-patch";

/**
 * 窗口同步系统类型定义
 *
 * 本文件定义了窗口分离状态同步系统的核心类型
 * 遵循重构方案 v3.0 的架构设计
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 窗口类型
 */
export type WindowType = "main" | "detached-component" | "detached-tool";

/**
 * 消息类型
 */
export type WindowMessageType =
  | "handshake" // 握手消息（建立连接）
  | "state-sync" // 状态同步
  | "action-request" // 操作请求（分离窗口 → 主窗口）
  | "action-response" // 操作响应（主窗口 → 分离窗口）
  | "heartbeat" // 心跳检测
  | "request-initial-state" // 请求初始状态（通用）
  | "request-specific-state"; // 请求特定状态

/**
 * 状态键类型（用于标识不同的状态数据）
 *
 * 注意：这里使用 string 类型而不是具体的业务枚举，
 * 是为了保持基础设施层的业务无关性。
 * 具体的状态键应该由各个业务模块自行定义。
 */
export type StateKey = string;

// ============================================================================
// 窗口信息
// ============================================================================

/**
 * 窗口信息
 */
export interface WindowInfo {
  /** 窗口标签（Tauri window label） */
  label: string;
  /** 窗口类型 */
  type: WindowType;
  /** 组件 ID（仅对 detached-component 类型有效） */
  componentId?: string;
  /** 连接时间戳 */
  connectedAt: number;
  /** 最后心跳时间 */
  lastHeartbeat: number;
}

// ============================================================================
// 消息协议
// ============================================================================

/**
 * 基础消息结构
 */
export interface BaseMessage<T = any> {
  /** 消息类型 */
  type: WindowMessageType;
  /** 消息载荷 */
  payload: T;
  /** 消息时间戳 */
  timestamp: number;
  /** 发送方窗口标签 */
  from: string;
  /** 接收方窗口标签（可选，为空则广播） */
  to?: string;
}

/**
 * 握手消息载荷
 */
export interface HandshakePayload {
  /** 窗口类型 */
  windowType: WindowType;
  /** 组件 ID（可选） */
  componentId?: string;
}

/**
 * 状态同步消息载荷
 */
export interface StateSyncPayload<K extends StateKey = StateKey> {
  /** 状态类型 */
  stateType: K;
  /** 状态版本号 */
  version: number;
  /** 是否为全量数据 */
  isFull: boolean;
  /** 全量数据（isFull 为 true 时使用） */
  data?: any;
  /** 增量数据（isFull 为 false 时使用） */
  patches?: any[];
}

/**
 * 操作请求消息载荷
 */
export interface ActionRequestPayload {
  /** 操作名称 */
  action: string;
  /** 操作参数 */
  params: any;
  /** 请求 ID（用于匹配响应） */
  requestId: string;
  /** 幂等性键（可选） */
  idempotencyKey?: string;
}

/**
 * 操作响应消息载荷
 */
export interface ActionResponsePayload {
  /** 请求 ID */
  requestId: string;
  /** 是否成功 */
  success: boolean;
  /** 响应数据（成功时） */
  data?: any;
  /** 错误信息（失败时） */
  error?: string;
}

/**
 * 心跳消息载荷
 */
export interface HeartbeatPayload {
  /** 心跳序号 */
  sequence: number;
}

// ============================================================================
// 具体消息类型
// ============================================================================

export type HandshakeMessage = BaseMessage<HandshakePayload>;
export type StateSyncMessage = BaseMessage<StateSyncPayload>;
export type ActionRequestMessage = BaseMessage<ActionRequestPayload>;
export type ActionResponseMessage = BaseMessage<ActionResponsePayload>;
export type HeartbeatMessage = BaseMessage<HeartbeatPayload>;

export type WindowMessage =
  | HandshakeMessage
  | StateSyncMessage
  | ActionRequestMessage
  | ActionResponseMessage
  | HeartbeatMessage;

// ============================================================================
// 回调类型
// ============================================================================

/**
 * 消息处理器
 */
export type MessageHandler<T = any> = (payload: T, message: BaseMessage<T>) => void | Promise<void>;

/**
 * 取消监听函数
 */
export type UnlistenFn = () => void;

/**
 * 连接事件处理器
 */
export type ConnectionHandler = (windowLabel: string, windowInfo: WindowInfo) => void;

/**
 * 操作处理器（主窗口使用）
 */
export type ActionHandler = (action: string, params: any, requestId: string) => Promise<any>;

/**
 * 初始状态请求处理器（主窗口使用）
 */
export type InitialStateRequestHandler = (requesterLabel: string, stateKey?: StateKey) => void;

// ============================================================================
// 配置选项
// ============================================================================

/**
  * 状态同步引擎配置
  */
export interface StateSyncConfig<K extends StateKey = StateKey> {
  /** 状态类型标识 */
  stateKey: K;
  /** 是否自动推送状态变化 */
  autoPush?: boolean;
  /** 是否自动接收状态更新 */
  autoReceive?: boolean;
  /** 是否启用增量更新 */
  enableDelta?: boolean;
  /** 增量更新阈值（0-1，增量大小超过此比例则使用全量） */
  deltaThreshold?: number;
  /** 防抖延迟（毫秒） */
  debounce?: number;
  /** 是否在挂载时自动请求初始状态（仅分离窗口有效） */
  requestOnMount?: boolean;
}
/**
 * 操作代理配置
 */
export interface ActionProxyConfig {
  /** 操作超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟基数（毫秒） */
  retryDelay?: number;
}

/**
 * 窗口同步总线配置
 */
export interface WindowSyncBusConfig {
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
  /** 心跳超时时间（毫秒） */
  heartbeatTimeout?: number;
  /** 是否启用心跳 */
  enableHeartbeat?: boolean;
}

// ============================================================================
// 工具类型
// ============================================================================

/**
 * JSON Patch 操作（遵循 RFC 6902）
 *
 * 直接使用 `fast-json-patch` 库的 `Operation` 类型以确保兼容性
 */
export type JsonPatchOperation = Operation;

/**
 * 幂等性缓存项
 */
export interface IdempotencyCacheItem {
  /** 请求 ID */
  requestId: string;
  /** 响应数据 */
  response: any;
  /** 缓存时间 */
  timestamp: number;
}
