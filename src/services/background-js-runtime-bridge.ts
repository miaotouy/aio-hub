import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  BACKGROUND_JS_RUNTIME_EVENTS,
  BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
  type BackgroundJsRuntimeReadyPayload,
  type BackgroundJsRuntimeRequest,
  type BackgroundJsRuntimeResponse,
} from "@/background-runtime/protocol";

type BackgroundJsRuntimeStatus = {
  available: boolean;
  ready: boolean;
  generation: number;
  runtimeVersion?: string;
  lastHeartbeatAt?: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: number;
};

const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_READY_TIMEOUT_MS = 15_000;

export class BackgroundJsRuntimeBridge {
  private startPromise: Promise<void> | null = null;
  private ready = false;
  private readyWaiters: Array<() => void> = [];
  private readonly pending = new Map<string, PendingRequest>();
  private unlistenResponse: UnlistenFn | null = null;
  private unlistenReady: UnlistenFn | null = null;

  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;

    this.startPromise = (async () => {
      this.unlistenResponse = await listen<BackgroundJsRuntimeResponse>(
        BACKGROUND_JS_RUNTIME_EVENTS.response,
        ({ payload }) => this.handleResponse(payload)
      );
      this.unlistenReady = await listen<BackgroundJsRuntimeReadyPayload>(
        BACKGROUND_JS_RUNTIME_EVENTS.ready,
        ({ payload }) => {
          this.ready = true;
          this.resolveReadyWaiters();
          console.info("[BackgroundJsRuntimeBridge] runtime ready", payload);
        }
      );

      const status = await invoke<BackgroundJsRuntimeStatus>("background_runtime_get_status");
      if (status.ready) {
        this.ready = true;
        this.resolveReadyWaiters();
      }
    })().catch((error) => {
      this.startPromise = null;
      throw error;
    });

    return this.startPromise;
  }

  async call<T>(
    method: string,
    payload: unknown,
    timeoutMs = DEFAULT_CALL_TIMEOUT_MS
  ): Promise<T> {
    await this.start();
    await this.waitUntilReady();

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

    try {
      await getCurrentWindow().emitTo(
        BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
        BACKGROUND_JS_RUNTIME_EVENTS.request,
        request
      );
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        window.clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error);
      }
    }

    return result;
  }

  async stop(): Promise<void> {
    this.unlistenResponse?.();
    this.unlistenReady?.();
    this.unlistenResponse = null;
    this.unlistenReady = null;
    this.startPromise = null;
    this.ready = false;

    for (const [id, pending] of this.pending) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("Background JS Runtime bridge stopped"));
      this.pending.delete(id);
    }
  }

  private async waitUntilReady(timeoutMs = DEFAULT_READY_TIMEOUT_MS): Promise<void> {
    if (this.ready) return;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        const index = this.readyWaiters.indexOf(resolve);
        if (index >= 0) this.readyWaiters.splice(index, 1);
        reject(new Error("Background JS Runtime is not ready"));
      }, timeoutMs);

      this.readyWaiters.push(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  private resolveReadyWaiters(): void {
    const waiters = this.readyWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  private handleResponse(response: BackgroundJsRuntimeResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;

    this.pending.delete(response.id);
    window.clearTimeout(pending.timer);

    if (response.ok) {
      pending.resolve(response.result);
      return;
    }

    pending.reject(
      new Error(response.error?.message || "Background JS Runtime request failed")
    );
  }
}

export const backgroundJsRuntimeBridge = new BackgroundJsRuntimeBridge();