/**
 * 窗口同步总线
 *
 * 核心通信层组件，负责窗口间消息传递、连接管理和心跳检测
 * 使用单例模式确保全局唯一性
 */

import { ref, computed } from "vue";
import { listen, emit as tauriEmit, type UnlistenFn as TauriUnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { getOrCreateInstance } from "@/utils/singleton";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { execute, type ToolCall } from "@/services/executor";
import type {
  WindowType,
  WindowMessageType,
  WindowInfo,
  BaseMessage,
  HandshakePayload,
  StateSyncPayload,
  ActionRequestPayload,
  ActionResponsePayload,
  HeartbeatPayload,
  MessageHandler,
  UnlistenFn,
  ConnectionHandler,
  ActionHandler,
  WindowSyncBusConfig,
  InitialStateRequestHandler,
  StateKey,
} from "@/types/window-sync";

const logger = createModuleLogger("WindowSyncBus");
const errorHandler = createModuleErrorHandler("WindowSyncBus");

/**
 * 窗口同步总线类
 */
class WindowSyncBus {
  // 基础信息
  private readonly windowLabel: string;
  private readonly windowType: WindowType;

  // 连接管理
  private connectedWindows = ref(new Map<string, WindowInfo>());
  private messageHandlers = new Map<WindowMessageType, Set<MessageHandler<any>>>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private disconnectionHandlers = new Set<ConnectionHandler>();
  private reconnectionHandlers = new Set<() => void>();
  private actionHandlers = new Map<string, ActionHandler>();
  private defaultActionHandler: ActionHandler | null = null;
  private initialStateRequestHandlers = new Set<InitialStateRequestHandler>();

  // 心跳管理
  private heartbeatInterval: number | null = null;
  private heartbeatSequence = 0;
  private config: Required<WindowSyncBusConfig>;

  // 重连防抖
  private lastReconnectTime = 0;
  private readonly reconnectDebounceMs = 5000; // 5秒内不重复触发重连

  // Tauri 事件监听器
  private eventUnlisteners: TauriUnlistenFn[] = [];

  // 初始化状态
  private initialized = false;

  constructor(config?: WindowSyncBusConfig) {
    // 获取当前窗口信息
    const currentWindow = getCurrentWebviewWindow();
    this.windowLabel = currentWindow.label;

    // 判断窗口类型 - 基于路由路径而不是窗口标签
    if (this.windowLabel === "main") {
      this.windowType = "main";
    } else {
      // 对于分离窗口，检查当前路由路径
      const currentPath = window.location.pathname;
      if (currentPath.startsWith("/detached-component/")) {
        this.windowType = "detached-component";
      } else if (currentPath.startsWith("/detached-window/")) {
        this.windowType = "detached-tool";
      } else {
        // 默认为分离工具（向后兼容旧标签格式）
        this.windowType = "detached-tool";
      }
    }

    // 配置
    this.config = {
      heartbeatInterval: config?.heartbeatInterval ?? 30000,
      heartbeatTimeout: config?.heartbeatTimeout ?? 60000,
      enableHeartbeat: config?.enableHeartbeat ?? true,
    };

    logger.info("WindowSyncBus 实例创建", {
      windowLabel: this.windowLabel,
      windowType: this.windowType,
      config: this.config,
    });
  }

  /**
   * 初始化总线
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn("WindowSyncBus 已初始化，跳过重复初始化");
      return;
    }

    try {
      // 监听所有类型的消息
      const unlisten = await listen<BaseMessage>("window-sync-message", (event) => {
        this.handleMessage(event.payload);
      });
      this.eventUnlisteners.push(unlisten);

      // 启动心跳检测
      if (this.config.enableHeartbeat) {
        this.startHeartbeat();
      }

      // 监听窗口焦点变化以实现重连
      const currentWindow = getCurrentWebviewWindow();
      const unlistenFocus = await currentWindow.onFocusChanged(({ payload: focused }: { payload: boolean }) => {
        if (focused) {
          this.handleReconnect();
        }
      });
      this.eventUnlisteners.push(unlistenFocus);

      this.initialized = true;
      logger.info("WindowSyncBus 核心监听器初始化完成");
    } catch (error) {
      errorHandler.error(error, "WindowSyncBus 初始化失败");
      throw error;
    }
  }

  /**
   * 发送握手消息
   */
  async sendHandshake(): Promise<void> {
    const payload: HandshakePayload = {
      windowType: this.windowType,
      componentId: this.windowType === "detached-component" ? this.windowLabel.replace("component-", "") : undefined,
    };

    await this.sendMessage("handshake", payload);
    logger.info("发送握手消息", { payload });
  }

  /**
   * 发送消息
   */
  private async sendMessage<T>(type: WindowMessageType, payload: T, target?: string): Promise<void> {
    const message: BaseMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
      from: this.windowLabel,
      to: target,
    };

    try {
      if (target) {
        // 发送到特定窗口
        const windows = await getAllWebviewWindows();
        const targetWindow = windows.find((w) => w.label === target);
        if (targetWindow) {
          await targetWindow.emit("window-sync-message", message);
        } else {
          logger.warn("目标窗口不存在", { target });
        }
      } else {
        // 广播到所有窗口
        await tauriEmit("window-sync-message", message);
      }
    } catch (error) {
      errorHandler.error(error, "发送消息失败", { context: { type, target } });
    }
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: BaseMessage): void {
    // 忽略自己发送的消息
    if (message.from === this.windowLabel) {
      return;
    }

    // 如果消息指定了目标窗口，且不是当前窗口，则忽略
    if (message.to && message.to !== this.windowLabel) {
      return;
    }

    logger.info("收到消息", {
      type: message.type,
      from: message.from,
      to: message.to,
    });

    // 根据消息类型处理
    switch (message.type) {
      case "handshake":
        this.handleHandshake(message as BaseMessage<HandshakePayload>);
        break;
      case "state-sync":
        this.handleStateSync(message as BaseMessage<StateSyncPayload>);
        break;
      case "action-request":
        this.handleActionRequest(message as BaseMessage<ActionRequestPayload>).catch((err) => {
          errorHandler.error(err, "handleActionRequest 未捕获异常", { context: { from: message.from } });
        });
        break;
      case "action-response":
        this.handleActionResponse(message as BaseMessage<ActionResponsePayload>);
        break;
      case "heartbeat":
        this.handleHeartbeat(message as BaseMessage<HeartbeatPayload>);
        break;
      case "request-initial-state":
        this.handleInitialStateRequest(message.from);
        break;
    }

    // 调用注册的消息处理器
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message.payload, message);
        } catch (error) {
          errorHandler.error(error, "消息处理器执行失败", { context: { type: message.type } });
        }
      }
    }
  }

  /**
   * 处理握手消息
   */
  private handleHandshake(message: BaseMessage<HandshakePayload>): void {
    const windowInfo: WindowInfo = {
      label: message.from,
      type: message.payload.windowType,
      componentId: message.payload.componentId,
      connectedAt: message.timestamp,
      lastHeartbeat: message.timestamp,
    };

    this.connectedWindows.value.set(message.from, windowInfo);

    logger.info("窗口已连接", { windowInfo });

    // 通知连接处理器
    for (const handler of this.connectionHandlers) {
      try {
        handler(message.from, windowInfo);
      } catch (error) {
        errorHandler.error(error, "连接处理器执行失败");
      }
    }

    // 如果是主窗口接收到握手，回应握手
    if (this.windowType === "main") {
      this.sendHandshake();
    }
  }

  /**
   * 处理状态同步消息
   */
  private handleStateSync(message: BaseMessage<StateSyncPayload>): void {
    // 状态同步由 StateSyncEngine 处理，这里只做日志记录
    logger.info("收到状态同步", {
      stateType: message.payload.stateType,
      version: message.payload.version,
      isFull: message.payload.isFull,
    });
  }

  /**
   * 处理操作请求
   */
  private async handleActionRequest(message: BaseMessage<ActionRequestPayload>): Promise<void> {
    const { action, params, requestId } = message.payload;
    let handler: ActionHandler | undefined;
    let actionName = action;

    logger.info("[诊断] handleActionRequest 进入", {
      action,
      requestId,
      registeredNamespaces: Array.from(this.actionHandlers.keys()),
      hasDefaultHandler: !!this.defaultActionHandler,
    });

    // 解析命名空间 (例如 "chat:sendMessage")
    const colonIndex = action.indexOf(":");
    if (colonIndex !== -1) {
      const namespace = action.substring(0, colonIndex);
      handler = this.actionHandlers.get(namespace);
      if (handler) {
        // 如果匹配到命名空间处理器，传递短名称
        actionName = action.substring(colonIndex + 1);
      }
      logger.info("[诊断] 命名空间解析", { namespace, found: !!handler, actionName });
    }

    // 如果没有命名空间处理器，Fallback 到默认处理器
    if (!handler && this.defaultActionHandler) {
      handler = this.defaultActionHandler;
      // 传递完整名称
      actionName = action;
    }

    if (handler) {
      try {
        const result = await handler(actionName, params, requestId);

        // 发送成功响应
        await this.sendMessage<ActionResponsePayload>(
          "action-response",
          {
            requestId,
            success: true,
            data: result,
          },
          message.from,
        );
      } catch (error) {
        // 发送失败响应
        await this.sendMessage<ActionResponsePayload>(
          "action-response",
          {
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          message.from,
        );
      }
    } else {
      logger.warn("未找到匹配的操作处理器", { action });
      // 发送错误响应，告知未找到处理器
      await this.sendMessage<ActionResponsePayload>(
        "action-response",
        {
          requestId,
          success: false,
          error: `未找到匹配的操作处理器: ${action}`,
        },
        message.from,
      );
    }
  }

  /**
   * 处理操作响应
   */
  private handleActionResponse(message: BaseMessage<ActionResponsePayload>): void {
    // 操作响应由 ActionProxy 处理，这里只做日志记录
    logger.info("收到操作响应", {
      requestId: message.payload.requestId,
      success: message.payload.success,
    });
  }

  /**
   * 处理心跳消息
   */
  private handleHeartbeat(message: BaseMessage<HeartbeatPayload>): void {
    const windowInfo = this.connectedWindows.value.get(message.from);
    if (windowInfo) {
      windowInfo.lastHeartbeat = message.timestamp;
      logger.debug("更新窗口心跳", { label: message.from, sequence: message.payload.sequence });
    }
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      return;
    }

    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat();
      this.checkHeartbeatTimeout();
    }, this.config.heartbeatInterval);

    logger.info("心跳检测已启动", { interval: this.config.heartbeatInterval });
  }

  /**
   * 发送心跳
   */
  private async sendHeartbeat(): Promise<void> {
    const payload: HeartbeatPayload = {
      sequence: ++this.heartbeatSequence,
    };

    await this.sendMessage("heartbeat", payload);
  }

  /**
   * 检查心跳超时
   */
  private checkHeartbeatTimeout(): void {
    const now = Date.now();
    const disconnectedWindows: string[] = [];

    for (const [label, info] of this.connectedWindows.value.entries()) {
      if (now - info.lastHeartbeat > this.config.heartbeatTimeout) {
        disconnectedWindows.push(label);
      }
    }

    for (const label of disconnectedWindows) {
      const windowInfo = this.connectedWindows.value.get(label)!;
      this.connectedWindows.value.delete(label);

      logger.warn("窗口心跳超时，已断开", { label });

      // 通知断开处理器
      for (const handler of this.disconnectionHandlers) {
        try {
          handler(label, windowInfo);
        } catch (error) {
          errorHandler.error(error, "断开处理器执行失败");
        }
      }
    }
  }

  /**
   * 处理重连逻辑
   * 添加防抖机制，避免频繁触发导致性能问题
   */
  private handleReconnect(): void {
    const now = Date.now();

    // 防抖检查：如果距离上次重连不到指定时间，则跳过
    if (now - this.lastReconnectTime < this.reconnectDebounceMs) {
      logger.debug("重连请求被防抖跳过", {
        timeSinceLastReconnect: now - this.lastReconnectTime,
        debounceMs: this.reconnectDebounceMs,
      });
      return;
    }

    this.lastReconnectTime = now;
    logger.info("窗口重新获得焦点，触发重连逻辑");

    // 主窗口和工具窗口（作为数据源）触发重连事件（广播状态）
    if (this.windowType === "main" || this.windowType === "detached-tool") {
      for (const handler of this.reconnectionHandlers) {
        try {
          handler();
        } catch (error) {
          errorHandler.error(error, "重连处理器执行失败");
        }
      }
    } else {
      // 组件窗口（作为消费者）请求初始状态
      this.requestInitialState();
    }
  }

  /**
   * 同步状态
   */
  async syncState<K extends StateKey>(
    stateType: K,
    data: any,
    version: number,
    isFull: boolean,
    target?: string,
  ): Promise<void> {
    const payload: StateSyncPayload = {
      stateType: stateType,
      version,
      isFull,
      data: isFull ? data : undefined,
      patches: isFull ? undefined : data,
    };

    await this.sendMessage("state-sync", payload, target);
  }
  /**
   * 请求操作
   * 改为广播模式：向所有窗口发送请求，由注册了处理器的窗口响应
   */
  async requestAction<TParams, TResult>(
    action: string,
    params: TParams,
    options?: { retries?: number; idempotencyKey?: string },
  ): Promise<TResult> {
    const requestId = `${this.windowLabel}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const payload: ActionRequestPayload = {
      action,
      params,
      requestId,
      idempotencyKey: options?.idempotencyKey,
    };

    // 等待响应 - 先注册监听器，防止竞态条件
    const responsePromise = new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unlisten();
        reject(new Error(`操作请求超时: ${action}`));
      }, 10000);

      const unlisten = this.onMessage<ActionResponsePayload>("action-response", (responsePayload) => {
        if (responsePayload.requestId === requestId) {
          unlisten();
          clearTimeout(timeout);
          if (responsePayload.success) {
            resolve(responsePayload.data as TResult);
          } else {
            reject(new Error(responsePayload.error || "操作失败"));
          }
        }
      });
    });

    // 广播到所有窗口，由有处理器的窗口响应
    // 这样无论服务端在主窗口还是分离的工具窗口都能正确处理
    await this.sendMessage("action-request", payload);

    return responsePromise;
  }

  /**
   * 请求初始状态（分离窗口使用）
   * 改为广播模式：向所有窗口发送请求，由拥有数据的窗口响应
   */
  async requestInitialState(): Promise<void> {
    logger.info("广播初始状态请求（由拥有数据的窗口响应）");
    await this.sendMessage("request-initial-state", {});
  }

  /**
   * 监听初始状态请求（主窗口使用）
   */
  onInitialStateRequest(handler: InitialStateRequestHandler): UnlistenFn {
    this.initialStateRequestHandlers.add(handler);
    return () => {
      this.initialStateRequestHandlers.delete(handler);
    };
  }
  private handleInitialStateRequest(requesterLabel: string): void {
    // 只要窗口注册了处理器，就应该响应（无论是 main 还是 detached-tool）
    if (this.initialStateRequestHandlers.size > 0) {
      logger.info(
        `[${this.windowType}] 收到来自 ${requesterLabel} 的初始状态请求，准备批量推送 (${this.initialStateRequestHandlers.size} 个处理器)`,
      );
      for (const handler of this.initialStateRequestHandlers) {
        try {
          handler(requesterLabel);
        } catch (error) {
          errorHandler.error(error, "初始状态请求处理器执行失败");
        }
      }
    }
  }

  /**
   * 注册操作处理器
   * 支持重载：
   * 1. onActionRequest(handler: ActionHandler): 注册默认处理器
   * 2. onActionRequest(namespace: string, handler: ActionHandler): 注册命名空间处理器
   */
  onActionRequest(handler: ActionHandler): UnlistenFn;
  onActionRequest(namespace: string, handler: ActionHandler): UnlistenFn;
  onActionRequest(namespaceOrHandler: string | ActionHandler, handler?: ActionHandler): UnlistenFn {
    if (typeof namespaceOrHandler === "string") {
      const namespace = namespaceOrHandler;
      const actualHandler = handler!;
      this.actionHandlers.set(namespace, actualHandler);
      return () => {
        this.actionHandlers.delete(namespace);
      };
    } else {
      const actualHandler = namespaceOrHandler;
      this.defaultActionHandler = actualHandler;
      return () => {
        this.defaultActionHandler = null;
      };
    }
  }

  /**
   * 监听消息
   */
  onMessage<TPayload>(type: WindowMessageType, handler: MessageHandler<TPayload>): UnlistenFn {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }

    this.messageHandlers.get(type)!.add(handler);

    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  /**
   * 监听连接事件
   */
  onConnect(handler: ConnectionHandler): UnlistenFn {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  /**
   * 监听断开事件
   */
  onDisconnect(handler: ConnectionHandler): UnlistenFn {
    this.disconnectionHandlers.add(handler);
    return () => {
      this.disconnectionHandlers.delete(handler);
    };
  }

  /**
   * 监听重连事件（主窗口使用）
   */
  onReconnect(handler: () => void): UnlistenFn {
    this.reconnectionHandlers.add(handler);
    return () => {
      this.reconnectionHandlers.delete(handler);
    };
  }

  /**
   * 获取已连接的窗口列表
   */
  get connectedWindowsList() {
    return computed(() => Array.from(this.connectedWindows.value.values()));
  }

  /**
   * 检查是否存在下游窗口（detached-component）
   */
  get hasDownstreamWindows() {
    return computed(() => {
      for (const windowInfo of this.connectedWindows.value.values()) {
        if (windowInfo.type === "detached-component") {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 停止心跳
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // 清理事件监听器
    for (const unlisten of this.eventUnlisteners) {
      unlisten();
    }
    this.eventUnlisteners = [];

    // 清理处理器
    this.messageHandlers.clear();
    this.connectionHandlers.clear();
    this.disconnectionHandlers.clear();
    this.reconnectionHandlers.clear();
    this.actionHandlers.clear();
    this.defaultActionHandler = null;
    this.initialStateRequestHandlers.clear();

    this.initialized = false;
    logger.info("WindowSyncBus 已清理");
  }
}

/**
 * 使用窗口同步总线（Composable）
 * 这是与总线交互的唯一入口点。它管理单例实例并提供所有公共API。
 */
export function useWindowSyncBus() {
  // 获取或创建总线单例
  const bus = getOrCreateInstance("WindowSyncBus", () => new WindowSyncBus());

  /**
   * 初始化总线实例。
   * 必须在应用根组件（如 App.vue, DetachedComponentContainer.vue）的 onMounted 中调用。
   * 此函数会设置核心监听器，并为非主窗口发送初始握手消息。
   */
  const initializeSyncBus = async (config?: WindowSyncBusConfig) => {
    if (bus["initialized"]) {
      return;
    }

    // 注册全局 Executor 处理器 (仅在主窗口或拥有数据的工具窗口)
    if (bus["windowType"] === "main" || bus["windowType"] === "detached-tool") {
      bus.onActionRequest("executor", async (action, params) => {
        if (action === "execute-tool") {
          const call = params as ToolCall;
          logger.info("主窗口收到转发的工具调用", { service: call.service, method: call.method });
          const result = await execute(call);
          if (result.success) {
            return result.data;
          } else {
            throw result.error;
          }
        }
        return null;
      });
    }

    // 如果提供了配置，则更新实例的配置
    if (config) {
      Object.assign(bus["config"], config);
      logger.info("总线配置已更新", bus["config"]);
    }

    // 初始化核心监听器
    await bus.initialize();

    // 如果是分离窗口，则在初始化后立即发送握手消息
    if (bus["windowType"] !== "main") {
      await bus.sendHandshake();
    }
  };

  return {
    // 新的初始化函数
    initializeSyncBus,

    // 公开请求初始状态的函数
    requestInitialState: bus.requestInitialState.bind(bus),

    // 基础信息
    windowLabel: bus["windowLabel"],
    windowType: bus["windowType"],
    connectedWindows: bus.connectedWindowsList,
    hasDownstreamWindows: bus.hasDownstreamWindows,

    // 核心 API
    syncState: bus.syncState.bind(bus),
    requestAction: bus.requestAction.bind(bus),

    // 事件监听
    onActionRequest: bus.onActionRequest.bind(bus),
    onInitialStateRequest: bus.onInitialStateRequest.bind(bus),
    onMessage: bus.onMessage.bind(bus),
    onConnect: bus.onConnect.bind(bus),
    onDisconnect: bus.onDisconnect.bind(bus),
    onReconnect: bus.onReconnect.bind(bus),

    // 生命周期
    cleanup: bus.cleanup.bind(bus),
  };
}
