import { invoke, isTauri } from "@tauri-apps/api/core";
import { nextTick } from "vue";
import router from "@/router";
import { useAppInitStore } from "@/stores/appInitStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  DEV_CONTROL_PROTOCOL_VERSION,
  type DevControlBridge,
  type DevControlIdentity,
} from "./protocol";
import {
  describeCapabilities,
  readDevState,
  registerDevState,
  runDevAction,
} from "./registry";

const logger = createModuleLogger("DevControl");
const moduleError = createModuleErrorHandler("DevControl");
let generation = 0;
let disposeBridge: (() => void) | undefined;

/** Replaces prior bridge registrations when this module is updated through Vite HMR. */
export async function startDevControlBridge(): Promise<void> {
  const currentGeneration = ++generation;
  disposeBridge?.();
  if (!isTauri()) return;
  const identity = await invoke<DevControlIdentity | null>(
    "dev_control_identity"
  );
  if (
    currentGeneration !== generation ||
    !identity ||
    identity.protocolVersion !== DEV_CONTROL_PROTOCOL_VERSION
  )
    return;
  const appInit = useAppInitStore();
  const bridge: DevControlBridge = {
    describe: () => ({
      ...identity,
      route: router.currentRoute.value.fullPath,
      ready: appInit.isReady,
    }),
    async navigate(path, timeoutMs) {
      if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
        throw new Error("INVALID_ROUTE: 需要应用内部路由。");
      const deadline = Date.now() + timeoutMs;
      while (!appInit.isReady && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (!appInit.isReady)
        throw new Error("APP_NOT_READY: 应用初始化尚未完成。");
      const match = router.resolve(path);
      if (
        !match.matched.length ||
        match.matched.some((record) => record.name === "NotFound")
      )
        throw new Error(`UNKNOWN_ROUTE: ${path}`);
      const failure = await router.push(path);
      // Duplicated navigation is successful for a positioning command.
      if (failure && router.currentRoute.value.fullPath !== match.fullPath)
        throw new Error(`NAVIGATION_FAILED: ${failure.message}`);
      await nextTick();
    },
    readState: readDevState,
    runAction: runDevAction,
  };
  const cleanups = [
    registerDevState("ui", () => ({
      ...bridge.describe(),
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      visibilityState: document.visibilityState,
      focused: document.hasFocus(),
    })),
    registerDevState("capabilities", describeCapabilities),
  ];
  window.__AIO_DEV_CONTROL__ = bridge;
  disposeBridge = () => {
    for (const cleanup of cleanups) cleanup();
    if (window.__AIO_DEV_CONTROL__ === bridge)
      delete window.__AIO_DEV_CONTROL__;
    disposeBridge = undefined;
  };
  logger.info("开发控制已连接", { windowLabel: identity.windowLabel });
}
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    generation++;
    disposeBridge?.();
  });
  import.meta.hot.accept((module) => {
    void module
      ?.startDevControlBridge()
      .catch((error: unknown) => moduleError.warn(error));
  });
}
