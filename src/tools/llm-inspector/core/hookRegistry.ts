/**
 * LLM Inspector 内部监控 — 钩子注册器（A1）
 *
 * 作为基础设施层，本模块不修改任何现有代码，也不会被任何引用方调用。
 * 由 Group B/C 的任务接入后才会真正生效。
 *
 * 设计要点：
 * - 单例模式：`inspectorHookRegistry` 是模块级单例，便于 fetchWithTimeout 等
 *   底层钩子从任意路径访问。
 * - 双通道广播：每个 trigger 同时执行（1）本窗口已注册的本地回调，（2）通过
 *   Tauri Event 跨窗口广播。订阅方（如分离窗口）只需 listen 同名 channel。
 * - **默认 OFF**：`shouldCaptureInternal()` 默认返回 false，所有 trigger
 *   都应在调用前由调用方先判断；为了健壮性，注册器内部也做一次短路。
 */

import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  INSPECTOR_INTERNAL_EVENT,
  INSPECTOR_SYNC_EVENT,
  type InspectorContextMetadata,
  type InspectorErrorEvent,
  type InspectorHooks,
  type InspectorRequestEvent,
  type InspectorResponseEvent,
  type InspectorStreamEvent,
  type InspectorSyncEnablePayload,
} from "../types/hooks";

const logger = createModuleLogger("LlmInspector/HookRegistry");
const errorHandler = createModuleErrorHandler("LlmInspector/HookRegistry");

/**
 * Inspector 钩子注册器
 *
 * 单例对外暴露 `inspectorHookRegistry`，避免每个调用方各自维护一份。
 */
class InspectorHookRegistry {
  private hooks: Set<InspectorHooks> = new Set();
  private captureInternal = false;
  /**
   * 上下文存储：以 requestId 为 key 暂存 inspectorContext。
   *
   * 用于 `fetchWithTimeout` 在没有显式收到 `options.inspectorContext` 时，
   * 通过 X-Request-ID 反查 useLlmRequest 写入的上下文，从而避免修改所有
   * adapter 的 fetchWithTimeout 调用。
   *
   * 生命周期由 useLlmRequest（写入方）管理：sendRequest 进入时 setContext，
   * try/finally 中 deleteContext。开关 OFF 时 useLlmRequest 不写入，存储常空。
   */
  private contextStore: Map<string, InspectorContextMetadata> = new Map();

  /**
   * 跨窗口同步监听器是否已初始化（防止重复 listen）
   */
  private syncInitialized = false;

  /**
   * 已注册的 Tauri 同步事件 unlisten 函数（保留以便测试场景手动清理）
   */
  private syncUnlisteners: UnlistenFn[] = [];

  /**
   * 启用内部监控（钩子触发器在此开关 OFF 时会短路，避免 clone Response 的开销）
   *
   * @param broadcast 是否广播跨窗口同步事件。
   *   - true（默认）：用户主动切换，需要通知其他窗口。
   *   - false：响应其他窗口的同步事件，避免事件回环。
   */
  enable(broadcast = true): void {
    if (this.captureInternal) return;
    this.captureInternal = true;
    logger.info("内部监控已启用", { broadcast });
    if (broadcast) {
      this.emitTauri(INSPECTOR_SYNC_EVENT.ENABLE_CHANGED, {
        enabled: true,
      } satisfies InspectorSyncEnablePayload);
    }
  }

  /**
   * 禁用内部监控
   *
   * @param broadcast 是否广播跨窗口同步事件，语义同 `enable`。
   */
  disable(broadcast = true): void {
    if (!this.captureInternal) return;
    this.captureInternal = false;
    logger.info("内部监控已禁用", { broadcast });
    if (broadcast) {
      this.emitTauri(INSPECTOR_SYNC_EVENT.ENABLE_CHANGED, {
        enabled: false,
      } satisfies InspectorSyncEnablePayload);
    }
  }

  /**
   * 是否应该捕获内部 LLM 调用
   *
   * fetchWithTimeout 等底层钩子点调用此方法做"零成本判断"：
   * - 返回 false 时直接走原逻辑，不 clone Response、不打日志。
   * - 返回 true 时再进入 trigger 流程。
   */
  shouldCaptureInternal(): boolean {
    return this.captureInternal;
  }

  /**
   * 注册一组本地钩子回调
   *
   * @returns 解注册函数（调用后从注册表中移除该回调）
   */
  register(hooks: InspectorHooks): () => void {
    this.hooks.add(hooks);
    logger.debug("注册本地钩子", { totalHooks: this.hooks.size });
    return () => {
      this.hooks.delete(hooks);
      logger.debug("解注册本地钩子", { totalHooks: this.hooks.size });
    };
  }

  /**
   * 触发请求事件
   *
   * - 调用所有已注册的 `onRequest` 回调；
   * - 通过 Tauri Event 跨窗口广播到 `inspector:internal:request`。
   */
  triggerRequest(event: InspectorRequestEvent): void {
    if (!this.captureInternal) return;
    this.dispatchLocal("onRequest", event);
    this.emitTauri(INSPECTOR_INTERNAL_EVENT.REQUEST, event);
  }

  /**
   * 触发响应事件
   */
  triggerResponse(event: InspectorResponseEvent): void {
    if (!this.captureInternal) return;
    this.dispatchLocal("onResponse", event);
    this.emitTauri(INSPECTOR_INTERNAL_EVENT.RESPONSE, event);
  }

  /**
   * 触发流式 chunk 事件
   */
  triggerStream(event: InspectorStreamEvent): void {
    if (!this.captureInternal) return;
    this.dispatchLocal("onStream", event);
    this.emitTauri(INSPECTOR_INTERNAL_EVENT.STREAM, event);
  }

  /**
   * 触发错误事件
   */
  triggerError(event: InspectorErrorEvent): void {
    if (!this.captureInternal) return;
    this.dispatchLocal("onError", event);
    this.emitTauri(INSPECTOR_INTERNAL_EVENT.ERROR, event);
  }

  /**
   * 写入 requestId 对应的 inspectorContext
   *
   * 由 `useLlmRequest` 在调用 adapter 之前写入，供 `fetchWithTimeout`
   * 通过 X-Request-ID header 反查。开关 OFF 时调用方不应写入（无意义）。
   */
  setContext(requestId: string, context: InspectorContextMetadata): void {
    if (!requestId) return;
    this.contextStore.set(requestId, context);
  }

  /**
   * 查询 requestId 对应的 inspectorContext
   *
   * 由 `fetchWithTimeout` 在 `options.inspectorContext` 缺失时调用。
   */
  getContext(requestId: string): InspectorContextMetadata | undefined {
    if (!requestId) return undefined;
    return this.contextStore.get(requestId);
  }

  /**
   * 移除 requestId 对应的 inspectorContext
   *
   * 由 `useLlmRequest` 在 finally 中调用，防止内存泄露。
   */
  deleteContext(requestId: string): void {
    if (!requestId) return;
    this.contextStore.delete(requestId);
  }

  /**
   * 清空所有已注册的本地钩子（主要用于测试 / 热重载）
   */
  clear(): void {
    this.hooks.clear();
    this.contextStore.clear();
    logger.debug("已清空所有本地钩子与上下文存储");
  }

  /**
   * 获取当前已注册钩子数量（调试 / 测试用）
   */
  getHookCount(): number {
    return this.hooks.size;
  }

  /**
   * 获取当前 contextStore 大小（调试 / 测试用）
   */
  getContextStoreSize(): number {
    return this.contextStore.size;
  }

  /**
   * 初始化跨窗口状态同步监听器
   *
   * 应在应用启动时（每个 webview 实例各自调用一次）触发，幂等。
   * 完成后：
   * 1. 监听其他窗口的 `ENABLE_CHANGED` 广播，同步本窗口的 captureInternal。
   * 2. 监听其他窗口的 `STATE_REQUEST`，若本窗口已启用则广播 `STATE_RESPONSE`。
   * 3. 监听其他窗口的 `STATE_RESPONSE`，对齐本窗口的 captureInternal。
   * 4. 主动广播一次 `STATE_REQUEST`，向已存在的窗口询问当前真值。
   *
   * 关键点：所有响应分支调用 enable/disable 时都传 `broadcast=false`，
   * 避免事件回环；ENABLE_CHANGED 也会被发送方自己收到，但因状态已变
   * 不会触发任何 trigger（enable/disable 内部有幂等短路）。
   */
  async initGlobalSync(): Promise<void> {
    if (this.syncInitialized) return;
    this.syncInitialized = true;

    try {
      // 1. 监听 ENABLE_CHANGED
      this.syncUnlisteners.push(
        await listen<InspectorSyncEnablePayload>(
          INSPECTOR_SYNC_EVENT.ENABLE_CHANGED,
          (event) => {
            const enabled = event.payload?.enabled === true;
            if (enabled) this.enable(false);
            else this.disable(false);
          }
        )
      );

      // 2. 监听 STATE_REQUEST（作为应答方）
      this.syncUnlisteners.push(
        await listen(INSPECTOR_SYNC_EVENT.STATE_REQUEST, () => {
          if (this.captureInternal) {
            this.emitTauri(INSPECTOR_SYNC_EVENT.STATE_RESPONSE, {
              enabled: true,
            } satisfies InspectorSyncEnablePayload);
          }
        })
      );

      // 3. 监听 STATE_RESPONSE（作为请求方）
      this.syncUnlisteners.push(
        await listen<InspectorSyncEnablePayload>(
          INSPECTOR_SYNC_EVENT.STATE_RESPONSE,
          (event) => {
            const enabled = event.payload?.enabled === true;
            if (enabled) this.enable(false);
          }
        )
      );

      // 4. 主动询问现有窗口的状态。
      // 注意：emitTauri 自身是 fire-and-forget 异步，确保 listen 已注册完才广播
      this.emitTauri(INSPECTOR_SYNC_EVENT.STATE_REQUEST, {});

      logger.info("跨窗口状态同步已初始化", {
        listenerCount: this.syncUnlisteners.length,
      });
    } catch (error) {
      // 非 Tauri 环境（测试 / 单元 webpack）下 listen 会抛错，安静失败即可
      logger.debug("跨窗口同步初始化失败（可能在非 Tauri 环境）", {
        error: String(error),
      });
    }
  }

  /**
   * 拆除跨窗口同步监听器（主要用于测试场景）
   */
  teardownGlobalSync(): void {
    for (const unlisten of this.syncUnlisteners) {
      try {
        unlisten();
      } catch {
        // ignore
      }
    }
    this.syncUnlisteners.length = 0;
    this.syncInitialized = false;
  }

  // ============ 内部辅助方法 ============

  /**
   * 派发到本地回调；任何一个回调抛错都不影响其他回调和广播流程。
   */
  private dispatchLocal<K extends keyof InspectorHooks>(
    method: K,
    event: Parameters<NonNullable<InspectorHooks[K]>>[0]
  ): void {
    for (const hooks of this.hooks) {
      const cb = hooks[method];
      if (!cb) continue;
      try {
        // 类型断言：cb 的签名已由 InspectorHooks 限定为对应事件
        (cb as (e: typeof event) => void)(event);
      } catch (error) {
        errorHandler.handle(error, {
          userMessage: "Inspector 本地钩子回调失败",
          showToUser: false,
          context: { method },
        });
      }
    }
  }

  /**
   * 通过 Tauri Event 广播；测试环境或 Tauri 不可用时安静失败。
   */
  private emitTauri(channel: string, payload: unknown): void {
    // emit 是 async，但我们不 await — 广播失败不应阻塞主流程
    Promise.resolve()
      .then(() => emit(channel, payload))
      .catch((error) => {
        // 测试环境 / 非 Tauri 环境下 emit 会抛错，降级为 debug 日志即可
        logger.debug("Tauri emit 失败（可能在非 Tauri 环境）", {
          channel,
          error: String(error),
        });
      });
  }
}

/**
 * 单例实例
 *
 * 全应用共用此实例。fetchWithTimeout、useInternalMonitor 等所有上下游
 * 都通过同一个实例通信。
 */
export const inspectorHookRegistry = new InspectorHookRegistry();
