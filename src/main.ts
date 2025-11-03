import { createApp } from "vue";
import App from "./App.vue";
import DetachedWindowContainer from "./views/DetachedWindowContainer.vue";
import DetachedComponentContainer from "./views/DetachedComponentContainer.vue";
import ElementPlus from "element-plus";
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import router, { initDynamicRoutes } from "./router"; // 从 ./router/index.ts 导入
import "./styles/index.css"; // 导入全局样式（已包含暗色模式样式）
import "viewerjs/dist/viewer.css"; // 导入 viewerjs 样式
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ElNotification } from "element-plus";
import { extname } from "@tauri-apps/api/path"; // 导入 path 模块用于获取文件扩展名
import { createPinia } from "pinia"; // 导入 Pinia
import { errorHandler, ErrorLevel } from "./utils/errorHandler";
import { createModuleLogger } from "./utils/logger";
import { loadAppSettingsAsync } from "./utils/appSettings";
import { initTheme } from "./composables/useTheme";
import { customMessage } from "./utils/customMessage";
import { autoRegisterServices } from "./services";
import { applyThemeColors } from "./utils/themeColors";
import packageJson from "../package.json";
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker()
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    return new editorWorker()
  },
}

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true)

const logger = createModuleLogger("Main");

// 检查是否为独立工具窗口（需要标题栏和标准布局）
const isDetachedWindow = () => {
  return window.location.pathname.startsWith("/detached-window/");
};

// 检查是否为分离组件加载器
const isDetachedComponentLoader = () => {
  return window.location.pathname.startsWith("/detached-component/");
};

// 为所有需要透明背景的窗口添加类名
const needsTransparentBackground = isDetachedComponentLoader();
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
  return App;
})();

logger.info("选择根组件", {
  component: rootComponent.name || "Unknown",
  pathname: window.location.pathname,
});

const app = createApp(rootComponent);
const pinia = createPinia(); // 创建 Pinia 实例

app.use(ElementPlus, { locale: zhCn });
app.use(pinia); // 注册 Pinia（必须在 router 之前，因为路由可能需要使用 store）
app.use(router);

// 初始化动态路由（必须在 Pinia 注册后）
initDynamicRoutes();

// 全局注册 customMessage，这样在所有组件中都可以使用
app.config.globalProperties.$message = customMessage;

// 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  logger.error("Vue 全局错误", err, {
    componentName: instance?.$options?.name || "Unknown",
    errorInfo: info,
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
  logger.error("未捕获的 Promise 错误", event.reason, {
    promise: event.promise,
  });

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
  // 这个警告在使用 Monaco Editor 等复杂 UI 组件时很常见，不影响功能
  if (event.message?.includes("ResizeObserver loop completed with undelivered notifications")) {
    event.preventDefault();
    return;
  }

  logger.error("全局错误", event.error, {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });

  errorHandler.handle(event.error, {
    module: "Global",
    level: ErrorLevel.ERROR,
    context: {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    },
  });
});

// 异步启动函数
const initializeApp = async () => {
  try {
    // 1. 首先异步加载应用设置
    await loadAppSettingsAsync();
    logger.info("应用设置初始化完成");

    // 2. 初始化主题
    await initTheme();
    logger.info("主题初始化完成");

    // 3. 自动注册所有工具服务
    await autoRegisterServices();
    logger.info("工具服务注册完成");

    // 4. 挂载 Vue 应用
    app.mount("#app");
    logger.info("应用挂载完成");
  } catch (error) {
    logger.error("应用初始化失败", error);
    // 可以在这里显示一个全局的错误提示
    errorHandler.handle(error, {
      module: "Main",
      level: ErrorLevel.CRITICAL,
      userMessage: "应用启动失败，请检查配置或联系支持。",
    });
  }
};

logger.info("应用启动", { version: packageJson.version });
initializeApp();

// 剪贴板监听逻辑
// 在 Vue 应用挂载后执行
window.addEventListener("DOMContentLoaded", () => {
  invoke("start_clipboard_monitor"); // 启动剪贴板监听服务

  listen("clipboard-changed", async (event: { payload: string }) => {
    const content = event.payload;
    // 调用 Tauri 命令识别剪贴板内容类型
    const contentType: string = await invoke("get_clipboard_content_type", { content });

    let title = "剪贴板内容变化";
    let message = "";

    switch (contentType) {
      case "json":
        title = "检测到 JSON 内容";
        message = `已自动识别 JSON 内容。点击前往 JSON 格式化工具进行处理。`;
        ElNotification({
          title: title,
          message: message,
          type: "info",
          duration: 3000,
          onClick: () => {
            router.push("/json-formatter"); // 跳转到 JSON 格式化工具
          },
        });
        break;
      case "base64":
        title = "检测到 Base64 内容";
        message = `已自动识别 Base64 内容。`;
        // 暂时不跳转，可根据需求增加 Base64 转换工具
        ElNotification({
          title: title,
          message: message,
          type: "info",
          duration: 3000,
        });
        break;
      case "text":
        // 对于普通文本不弹窗，避免频繁打扰
        // console.log("Text content changed:", content);
        break;
      default:
        break;
    }
  });

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
            // 考虑如何将文件内容传递给目标组件
            // 目前只跳转，内容读取需要组件内部实现
          }
        },
      });
    }
  });
});

// 在应用关闭前停止剪贴板监听 (可选，因为进程会直接关闭)
window.addEventListener("beforeunload", () => {
  invoke("stop_clipboard_monitor");
});
