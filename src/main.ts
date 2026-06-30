import * as Vue from "vue";
import { createApp } from "vue";
import App from "./App.vue";
import DetachedWindowContainer from "./views/DetachedWindowContainer.vue";
import DetachedComponentContainer from "./views/DetachedComponentContainer.vue";
import CanvasWindowContainer from "./tools/web-canvas/components/window/CanvasWindowContainer.vue";
import * as ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import * as PluginSDK from "@/services/plugin-sdk";
import * as PluginUI from "@/services/plugin-ui";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import router, { initDynamicRoutes } from "./router"; // 从 ./router/index.ts 导入
import "./styles/index.css"; // 导入全局样式（已包含暗色模式样式）
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ElNotification } from "element-plus";
import { extname } from "@tauri-apps/api/path"; // 导入 path 模块用于获取文件扩展名
import { createPinia } from "pinia"; // 导入 Pinia
import { errorHandler, ErrorLevel } from "./utils/errorHandler";
import { createModuleLogger } from "./utils/logger";
import packageJson from "../package.json";
// 导入 Monaco 汉化模块，确保 globalThis._VSCODE_NLS_MESSAGES 被初始化
import "@/utils/monaco-i18n/nls";
// 导入 Inspector 钩子注册器，以便在应用启动时初始化跨窗口状态同步。
// 这能确保即使用户从未打开 Inspector 工具页，主窗口也能响应分离窗口
// 切换开关的事件，从而正确启用 fetchWithTimeout 中的内部钩子。
// 详见 src/tools/llm-inspector/ARCHITECTURE.md §1.1.3
import { inspectorHookRegistry } from "@/tools/llm-inspector/core/hookRegistry";
import { Buffer } from "buffer";

// 解决 music-metadata-browser 在浏览器环境下缺少 Buffer 的问题
if (typeof (window as any).Buffer === "undefined") {
  (window as any).Buffer = Buffer;
}

// 将 Vue 和 ElementPlus 挂载到全局，供插件 ESM Shim 使用
(window as any).Vue = Vue;
(window as any).ElementPlus = ElementPlus;
(window as any).ElementPlusIconsVue = ElementPlusIconsVue;
(window as any).AiohubSDK = PluginSDK;
(window as any).AiohubUI = PluginUI;

const logger = createModuleLogger("Main");

const FRONTEND_PROBE_HEARTBEAT_MS = 5000;
const FRONTEND_PROBE_TEXT_LIMIT = 4000;
let frontendProbeSequence = 0;
let frontendHeartbeatTimer: number | null = null;

const truncateProbeText = (value: string, limit = FRONTEND_PROBE_TEXT_LIMIT) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}... [truncated, chars=${value.length}]`;
};

const getCurrentRouteForProbe = () => {
  try {
    return router.currentRoute.value.fullPath;
  } catch {
    return undefined;
  }
};

const buildFrontendProbeSnapshot = (phase: string) => ({
  sequence: ++frontendProbeSequence,
  phase,
  timestamp: new Date().toISOString(),
  performanceNow: performance.now(),
  pathname: window.location.pathname,
  href: window.location.href,
  route: getCurrentRouteForProbe(),
  visibilityState: document.visibilityState,
  documentReadyState: document.readyState,
  focused: document.hasFocus(),
  online: navigator.onLine,
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  },
  userAgent: navigator.userAgent,
});

const sendFrontendProbe = (command: string, payload: unknown) => {
  invoke(command, { payload }).catch((error) => {
    if (import.meta.env.DEV) {
      console.debug("[FrontendProbe] 发送探针失败", command, error);
    }
  });
};

const normalizeErrorForProbe = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncateProbeText(error.message || String(error)),
      stack: error.stack ? truncateProbeText(error.stack) : undefined,
    };
  }

  if (typeof error === "string") {
    return {
      name: undefined,
      message: truncateProbeText(error),
      stack: undefined,
    };
  }

  try {
    return {
      name:
        error && typeof error === "object" && "name" in error
          ? String((error as { name?: unknown }).name)
          : undefined,
      message: truncateProbeText(JSON.stringify(error)),
      stack:
        error && typeof error === "object" && "stack" in error
          ? truncateProbeText(String((error as { stack?: unknown }).stack))
          : undefined,
    };
  } catch {
    return {
      name: undefined,
      message: truncateProbeText(String(error)),
      stack: undefined,
    };
  }
};

const reportFrontendReady = (phase: string) => {
  sendFrontendProbe(
    "frontend_probe_ready",
    buildFrontendProbeSnapshot(phase)
  );
};

const reportFrontendHeartbeat = (phase = "heartbeat") => {
  sendFrontendProbe(
    "frontend_probe_heartbeat",
    buildFrontendProbeSnapshot(phase)
  );
};

const reportFrontendError = (
  kind: string,
  error: unknown,
  context?: Record<string, unknown>
) => {
  sendFrontendProbe("frontend_probe_error", {
    ...normalizeErrorForProbe(error),
    kind,
    context,
    snapshot: buildFrontendProbeSnapshot(`error:${kind}`),
  });
};

const startFrontendHeartbeat = () => {
  if (frontendHeartbeatTimer !== null) return;

  reportFrontendHeartbeat("heartbeat-start");
  frontendHeartbeatTimer = window.setInterval(
    () => reportFrontendHeartbeat(),
    FRONTEND_PROBE_HEARTBEAT_MS
  );

  document.addEventListener("visibilitychange", () => {
    reportFrontendHeartbeat("visibilitychange");
  });
  window.addEventListener("focus", () => reportFrontendHeartbeat("focus"));
  window.addEventListener("online", () => reportFrontendHeartbeat("online"));
  window.addEventListener("offline", () => reportFrontendHeartbeat("offline"));
};

// 检查是否为独立工具窗口（需要标题栏和标准布局）
const isDetachedWindow = () => {
  return window.location.pathname.startsWith("/detached-window/");
};

// 检查是否为分离组件加载器
const isDetachedComponentLoader = () => {
  return window.location.pathname.startsWith("/detached-component/");
};

// 检查是否为画布窗口
const isCanvasWindow = () => {
  return window.location.pathname.startsWith("/canvas-window/");
};

// 为所有需要透明背景的窗口添加类名
const needsTransparentBackground =
  isDetachedComponentLoader() || isCanvasWindow();
if (needsTransparentBackground) {
  document.documentElement.classList.add("transparent-window");
  document.body.classList.add("transparent-window");
  logger.info(`透明窗口 (${window.location.pathname})：已添加透明背景类`);
}

// 根据窗口类型选择根组件
const rootComponent = (() => {
  if (isDetachedWindow()) return DetachedWindowContainer;
  if (isDetachedComponentLoader()) return DetachedComponentContainer;
  if (isCanvasWindow()) return CanvasWindowContainer;
  return App;
})();

logger.info("选择根组件", {
  component: rootComponent.name || "Unknown",
  pathname: window.location.pathname,
});

const app = createApp(rootComponent);

// 注册插件 UI 组件为全局组件
Object.entries(PluginUI.components).forEach(([name, component]) => {
  app.component(name, component);
});

const pinia = createPinia(); // 创建 Pinia 实例

app.use(ElementPlus, { locale: zhCn });
app.use(pinia); // 注册 Pinia（必须在所有依赖它的模块之前）

// 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  reportFrontendError("vue.error", err, {
    component: instance?.$options?.name,
    info,
  });

  errorHandler.handle(err, {
    module: "Vue",
    level: ErrorLevel.ERROR,
    userMessage: "应用遇到错误，请查看控制台了解详情",
    context: {
      component: instance?.$options?.name,
      info,
    },
  });
};

// 全局警告处理
app.config.warnHandler = (msg, instance, trace) => {
  logger.warn("Vue 警告", {
    message: msg,
    componentName: instance?.$options?.name || "Unknown",
    trace,
  });
};

// 未捕获的 Promise 错误
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason?.message || String(reason || "");

  // 过滤 Element Plus Popper 内部的无害竞态错误
  // 当组件在 Popper 异步定位计算期间被卸载时，会抛出此错误
  if (message.includes("getBoundingClientRect is not a function")) {
    logger.debug("已忽略 Popper 内部竞态错误", { message });
    event.preventDefault();
    return;
  }

  reportFrontendError("unhandledrejection", reason, { message });

  errorHandler.handle(reason, {
    module: "Promise",
    level: ErrorLevel.ERROR,
    userMessage: "操作失败，请重试",
  });

  event.preventDefault();
});

// 全局错误捕获
window.addEventListener("error", (event) => {
  // 过滤良性的 ResizeObserver 警告
  if (
    event.message?.includes(
      "ResizeObserver loop completed with undelivered notifications"
    )
  ) {
    event.preventDefault();
    return;
  }

  const errorToHandle = event.error || event.message || "Unknown Global Error";
  reportFrontendError("window.error", errorToHandle, {
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
  });

  errorHandler.handle(errorToHandle, {
    module: "Global",
    level: ErrorLevel.ERROR,
    context: {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    },
  });
});

// 异步挂载应用
const mountApp = async () => {
  try {
    // 1. 初始化动态路由（必须在 Pinia 注册后）
    // 注意：此时 autoRegisterServices 尚未运行，但 initDynamicRoutes 会设置一个 watch
    // 监听 toolsStore.tools 的变化，从而在后续工具注册时自动添加路由。
    initDynamicRoutes();
    logger.info("动态路由初始化完成");

    // 2. 注册 Router
    app.use(router);
    logger.info("Router 注册完成");

    // 3. 挂载 Vue 应用
    app.mount("#app");
    logger.info("应用挂载完成");
    reportFrontendReady("vue-mounted");
    startFrontendHeartbeat();

    // 4. 主窗口挂载后显示（避免窗口位置或白屏闪烁，窗口在 Rust 端以 visible(false) 创建）
    if (
      !isDetachedWindow() &&
      !isDetachedComponentLoader() &&
      !isCanvasWindow()
    ) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().show();
      logger.info("主窗口已显示");

      // 通知 Rust 后端前端已就绪（用于 Linux 白屏检测）
      const { emit } = await import("@tauri-apps/api/event");
      await emit("frontend-ready");
    }
  } catch (error) {
    reportFrontendError("mount.failed", error);
    errorHandler.handle(error, {
      module: "Main",
      level: ErrorLevel.CRITICAL,
      userMessage: "应用挂载失败，请检查配置或联系支持。",
    });
  }
};

// 兼容性检测失败时阻止应用挂载
if ((window as any).__AIO_COMPAT_FAILED__) {
  throw new Error("Compatibility check failed, app mount aborted.");
}

logger.info("应用启动", { version: packageJson.version });

// 初始化 Inspector 跨窗口状态同步（幂等，每个 webview 各调一次）
inspectorHookRegistry.initGlobalSync().catch((err) => {
  logger.debug("Inspector 跨窗口同步初始化失败", { error: String(err) });
});

mountApp();

// 在 Vue 应用挂载后执行
window.addEventListener("DOMContentLoaded", () => {
  // 监听文件拖拽事件
  listen("tauri-file-drop", async (event: { payload: string[] }) => {
    const paths = event.payload;
    if (paths && paths.length > 0) {
      const filePath = paths[0]; // 只处理第一个拖拽的文件
      const extension = await extname(filePath);

      let targetRoute = "";
      let message = `已拖拽文件: ${filePath}`;

      switch (extension.toLowerCase()) {
        case "png":
        case "jpg":
        case "jpeg":
        case "webp":
        case "gif":
          targetRoute = "/media-info-reader";
          message += `，已跳转到媒体信息读取器。`;
          break;
        case "json":
          targetRoute = "/json-formatter";
          message += `，已跳转到 JSON 格式化。`;
          break;
        case "txt":
        case "md":
        case "js":
        case "ts":
        case "html":
        case "css":
        case "xml":
          targetRoute = "/code-formatter";
          message += `，已跳转到代码格式化工具。`;
          break;
        default:
          ElNotification({
            title: "文件拖拽",
            message: `不支持的文件类型: .${extension}`,
            type: "warning",
            duration: 3000,
          });
          return; // 不跳转
      }

      ElNotification({
        title: "文件拖拽",
        message: message,
        type: "success",
        duration: 3000,
        onClick: () => {
          if (targetRoute) {
            router.push(targetRoute);
          }
        },
      });
    }
  });
});
