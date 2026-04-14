import * as Vue from "vue";
import { createApp } from "vue";
import App from "./App.vue";
import DetachedWindowContainer from "./views/DetachedWindowContainer.vue";
import DetachedComponentContainer from "./views/DetachedComponentContainer.vue";
import CanvasWindowContainer from "./tools/canvas/components/window/CanvasWindowContainer.vue";
import * as ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import * as PluginSDK from "@/services/plugin-sdk";
import * as PluginUI from "@/services/plugin-ui";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import router, { initDynamicRoutes } from "./router"; // 从 ./router/index.ts 导入
import "./styles/index.css"; // 导入全局样式（已包含暗色模式样式）
import "viewerjs/dist/viewer.css"; // 导入 viewerjs 样式
import "katex/dist/katex.min.css"; // 导入 KaTeX 样式
import { listen } from "@tauri-apps/api/event";
import { ElNotification } from "element-plus";
import { extname } from "@tauri-apps/api/path"; // 导入 path 模块用于获取文件扩展名
import { createPinia } from "pinia"; // 导入 Pinia
import { errorHandler, ErrorLevel } from "./utils/errorHandler";
import { createModuleLogger } from "./utils/logger";
import { applyThemeColors } from "./utils/themeColors";
import packageJson from "../package.json";
// 导入 Monaco 汉化模块，确保 globalThis._VSCODE_NLS_MESSAGES 被初始化
import "@/utils/monaco-i18n/nls";
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
const needsTransparentBackground = isDetachedComponentLoader() || isCanvasWindow();
if (needsTransparentBackground) {
  document.documentElement.classList.add("transparent-window");
  document.body.classList.add("transparent-window");
  logger.info(`透明窗口 (${window.location.pathname})：已添加透明背景类`);
}

// 早期主题色应用：在 Vue 应用创建前从 localStorage 读取并应用主题色
// 这样可以避免应用启动时的颜色闪烁
(() => {
  try {
    const cachedThemeColor = localStorage.getItem("app-theme-color");
    if (cachedThemeColor && /^#[0-9A-F]{6}$/i.test(cachedThemeColor)) {
      applyThemeColors({ primary: cachedThemeColor });
    }
  } catch (error) {
    logger.warn("应用缓存主题颜色失败", { error });
  }
})();

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
  errorHandler.handle(event.reason, {
    module: "Promise",
    level: ErrorLevel.ERROR,
    userMessage: "操作失败，请重试",
  });

  event.preventDefault();
});

// 全局错误捕获
window.addEventListener("error", (event) => {
  // 过滤良性的 ResizeObserver 警告
  if (event.message?.includes("ResizeObserver loop completed with undelivered notifications")) {
    event.preventDefault();
    return;
  }

  const errorToHandle = event.error || event.message || "Unknown Global Error";

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
  } catch (error) {
    errorHandler.handle(error, {
      module: "Main",
      level: ErrorLevel.CRITICAL,
      userMessage: "应用挂载失败，请检查配置或联系支持。",
    });
  }
};

logger.info("应用启动", { version: packageJson.version });
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
