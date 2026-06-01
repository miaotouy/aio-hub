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
import { emit } from "@tauri-apps/api/event";
import {
  INSPECTOR_INTERNAL_EVENT,
  type InspectorErrorEvent,
  type InspectorHooks,
  type InspectorRequestEvent,
  type InspectorResponseEvent,
  type InspectorStreamEvent,
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
   * 启用内部监控（钩子触发器在此开关 OFF 时会短路，避免 clone Response 的开销）
   */
  enable(): void {
    if (this.captureInternal) return;
    this.captureInternal = true;
    logger.info("内部监控已启用");
  }

  /**
   * 禁用内部监控
   */
  disable(): void {
    if (!this.captureInternal) return;
    this.captureInternal = false;
    logger.info("内部监控已禁用");
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
   * 清空所有已注册的本地钩子（主要用于测试 / 热重载）
   */
  clear(): void {
    this.hooks.clear();
    logger.debug("已清空所有本地钩子");
  }

  /**
   * 获取当前已注册钩子数量（调试 / 测试用）
   */
  getHookCount(): number {
    return this.hooks.size;
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
