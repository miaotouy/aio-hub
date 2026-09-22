import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  BACKGROUND_JS_RUNTIME_EVENTS,
  BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
  type BackgroundJsRuntimeRequest,
  type BackgroundJsRuntimeResponse,
} from "./protocol";

const RUNTIME_VERSION = "0.1.0-poc";
const HEARTBEAT_INTERVAL_MS = 5_000;

const runtimeInfo = {
  runtimeVersion: RUNTIME_VERSION,
  userAgent: navigator.userAgent,
  startedAt: new Date().toISOString(),
};

const responseFor = (
  request: BackgroundJsRuntimeRequest,
  response: Omit<BackgroundJsRuntimeResponse, "id">
): BackgroundJsRuntimeResponse => ({
  id: request.id,
  ...response,
});

const dispatch = (request: BackgroundJsRuntimeRequest): BackgroundJsRuntimeResponse => {
  switch (request.method) {
    case "runtime.ping":
      return responseFor(request, {
        ok: true,
        result: {
          pong: true,
          respondedAt: new Date().toISOString(),
        },
      });
    case "runtime.getInfo":
      return responseFor(request, { ok: true, result: runtimeInfo });
    default:
      return responseFor(request, {
        ok: false,
        error: {
          code: "METHOD_NOT_IMPLEMENTED",
          message: `Background JS Runtime method is not implemented: ${request.method}`,
        },
      });
  }
};

const boot = async (): Promise<void> => {
  await listen<BackgroundJsRuntimeRequest>(BACKGROUND_JS_RUNTIME_EVENTS.request, async (event) => {
    const response = dispatch(event.payload);
    await emitTo("main", BACKGROUND_JS_RUNTIME_EVENTS.response, response);
  });

  const status = await invoke<{ generation: number }>("background_runtime_ready", {
    runtimeVersion: RUNTIME_VERSION,
  });

  await emitTo("main", BACKGROUND_JS_RUNTIME_EVENTS.ready, {
    runtimeVersion: RUNTIME_VERSION,
    generation: status.generation,
  });

  window.setInterval(() => {
    void invoke("background_runtime_heartbeat").catch((error) => {
      console.error("[BackgroundJsRuntime] heartbeat failed", error);
    });
  }, HEARTBEAT_INTERVAL_MS);

  console.info("[BackgroundJsRuntime] ready", {
    label: BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
    ...runtimeInfo,
  });
};

void boot().catch((error) => {
  console.error("[BackgroundJsRuntime] boot failed", error);
});