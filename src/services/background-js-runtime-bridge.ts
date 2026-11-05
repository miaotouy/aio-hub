import { requireHostCapability } from "@/platform/core/capabilities";
import { getBackgroundRuntimeHost } from "@/platform/modules/background-runtime";
import { invoke } from "@/platform/native/core";
import { listen, type UnlistenFn } from "@/platform/native/events";
import { getCurrentWindow } from "@/platform/native/window";
import {
  BACKGROUND_JS_RUNTIME_EVENTS,
  BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
  type BackgroundJsRuntimeReadyPayload,
  type BackgroundJsRuntimeRequest,
  type BackgroundJsRuntimeResponse,
  type BackgroundJsRuntimeStatus,
} from "@/background-runtime/protocol";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: number;
};
type ReadyWaiter = {
  resolve(): void;
  reject(error: Error): void;
  timer: number;
};
const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_READY_TIMEOUT_MS = 15_000;
const stopped = () => new Error("Background JS Runtime bridge stopped");

export class BackgroundJsRuntimeBridge {
  private startPromise: Promise<void> | null = null;
  private epoch = 0;
  private ready = false;
  private readonly readyWaiters = new Set<ReadyWaiter>();
  private readonly pending = new Map<string, PendingRequest>();
  private unlistenResponse: UnlistenFn | null = null;
  private unlistenReady: UnlistenFn | null = null;
  private host: ReturnType<typeof getBackgroundRuntimeHost> = null;

  async start(): Promise<void> {
    requireHostCapability("backgroundJsRuntime");
    if (this.startPromise) return this.startPromise;
    const epoch = ++this.epoch;
    this.host = getBackgroundRuntimeHost();
    const host = this.host;
    this.startPromise = (async () => {
      if (host) {
        const status = await host.start();
        this.assertCurrent(epoch);
        this.ready = status.ready;
        return;
      }
      const response = await listen<BackgroundJsRuntimeResponse>(
        BACKGROUND_JS_RUNTIME_EVENTS.response,
        ({ payload }) => {
          if (epoch === this.epoch) this.handleResponse(payload);
        }
      );
      if (epoch !== this.epoch) {
        response();
        throw stopped();
      }
      this.unlistenResponse = response;
      const ready = await listen<BackgroundJsRuntimeReadyPayload>(
        BACKGROUND_JS_RUNTIME_EVENTS.ready,
        () => {
          if (epoch !== this.epoch) return;
          this.ready = true;
          this.resolveReadyWaiters();
        }
      );
      if (epoch !== this.epoch) {
        ready();
        throw stopped();
      }
      this.unlistenReady = ready;
      const status = await invoke<BackgroundJsRuntimeStatus>(
        "background_runtime_get_status"
      );
      this.assertCurrent(epoch);
      if (status.ready) {
        this.ready = true;
        this.resolveReadyWaiters();
      }
    })().catch((error) => {
      if (epoch === this.epoch) {
        ++this.epoch;
        this.reset(error instanceof Error ? error : Error(String(error)));
      }
      throw error;
    });
    return this.startPromise;
  }
  async call<T>(
    method: string,
    payload: unknown,
    timeoutMs = DEFAULT_CALL_TIMEOUT_MS
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000)
      throw new Error("Background JS Runtime request timeout is invalid");
    const starting = this.start();
    const epoch = this.epoch;
    await starting;
    this.assertCurrent(epoch);
    await this.waitUntilReady();
    this.assertCurrent(epoch);
    const id = globalThis.crypto.randomUUID();
    const request: BackgroundJsRuntimeRequest = { id, method, payload };
    const result = new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Background JS Runtime request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
    });
    // Dispatch without awaiting: stop() can reject the caller even if transport is stalled.
    const host = this.host;
    void (async () => {
      try {
        if (host) {
          const value = await host.call(method, payload, timeoutMs);
          this.handleResponse({ id, ok: true, result: value });
        } else {
          await getCurrentWindow().emitTo(
            BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
            BACKGROUND_JS_RUNTIME_EVENTS.request,
            request
          );
        }
      } catch (error) {
        const pending = this.pending.get(id);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error);
      }
    })();
    return result;
  }
  async stop(): Promise<void> {
    ++this.epoch;
    this.reset(stopped());
  }
  private assertCurrent(epoch: number) {
    if (epoch !== this.epoch) throw stopped();
  }
  private reset(error: Error) {
    this.unlistenResponse?.();
    this.unlistenReady?.();
    this.unlistenResponse = null;
    this.unlistenReady = null;
    this.startPromise = null;
    this.host = null;
    this.ready = false;
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const waiter of this.readyWaiters) {
      window.clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.readyWaiters.clear();
  }
  private async waitUntilReady(
    timeoutMs = DEFAULT_READY_TIMEOUT_MS
  ): Promise<void> {
    if (this.ready) return;
    await new Promise<void>((resolve, reject) => {
      const waiter: ReadyWaiter = {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          this.readyWaiters.delete(waiter);
          reject(new Error("Background JS Runtime is not ready"));
        }, timeoutMs),
      };
      this.readyWaiters.add(waiter);
    });
  }
  private resolveReadyWaiters(): void {
    for (const waiter of this.readyWaiters) {
      window.clearTimeout(waiter.timer);
      waiter.resolve();
    }
    this.readyWaiters.clear();
  }
  private handleResponse(response: BackgroundJsRuntimeResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    window.clearTimeout(pending.timer);
    if (response.ok) pending.resolve(response.result);
    else
      pending.reject(
        Object.assign(
          new Error(
            response.error?.message ?? "Background JS Runtime request failed"
          ),
          { code: response.error?.code }
        )
      );
  }
}
export const backgroundJsRuntimeBridge = new BackgroundJsRuntimeBridge();
