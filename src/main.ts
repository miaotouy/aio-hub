import { createApp } from "vue";
import App from "./App.vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import router from "./router"; // 从 ./router/index.ts 导入
import './styles/index.css'; // 导入全局样式
import './styles/dark/css-vars.css'; // 导入自定义暗黑模式样式
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ElNotification } from 'element-plus';
import { extname } from "@tauri-apps/api/path"; // 导入 path 模块用于获取文件扩展名
import { createPinia } from 'pinia'; // 导入 Pinia
import { errorHandler, ErrorLevel } from './utils/errorHandler';
import { createModuleLogger } from './utils/logger';

const logger = createModuleLogger('Main');

// 早期主题色应用：在 Vue 应用创建前从 localStorage 读取并应用主题色
// 这样可以避免应用启动时的颜色闪烁
(() => {
  let cachedThemeColor: string | null = null;
  try {
    cachedThemeColor = localStorage.getItem('app-theme-color');
    if (cachedThemeColor && /^#[0-9A-F]{6}$/i.test(cachedThemeColor)) {
      const root = document.documentElement;
      
      // 设置主题色
      root.style.setProperty("--primary-color", cachedThemeColor);
      
      // 计算悬停色
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        } : null;
      };
      
      const lightenColor = (hex: string, percent: number) => {
        const rgb = hexToRgb(hex);
        if (!rgb) return hex;
        const r = Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * (percent / 100)));
        const g = Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * (percent / 100)));
        const b = Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * (percent / 100)));
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      };
      
      const hoverColor = lightenColor(cachedThemeColor, 20);
      root.style.setProperty("--primary-hover-color", hoverColor);
      
      const rgb = hexToRgb(cachedThemeColor);
      if (rgb) {
        root.style.setProperty("--primary-color-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
      }
      
      // 同步 Element Plus 变量
      root.style.setProperty("--el-color-primary", cachedThemeColor);
      root.style.setProperty("--el-color-primary-light-3", hoverColor);
      root.style.setProperty("--el-color-primary-light-5", hoverColor);
      root.style.setProperty("--el-color-primary-light-7", hoverColor);
      root.style.setProperty("--el-color-primary-light-9", hoverColor);
    }
  } catch (error) {
    logger.warn('应用缓存主题颜色失败', {
      error,
      cachedColor: cachedThemeColor
    });
  }
})();

const app = createApp(App);
const pinia = createPinia(); // 创建 Pinia 实例

app.use(ElementPlus);
app.use(router);
app.use(pinia); // 注册 Pinia

// 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  logger.error('Vue 全局错误', err, {
    componentName: instance?.$options?.name || 'Unknown',
    errorInfo: info
  });
  
  errorHandler.handle(err, {
    module: 'Vue',
    level: ErrorLevel.ERROR,
    userMessage: '应用遇到错误，请查看控制台了解详情',
    context: {
      component: instance?.$options?.name,
      info
    }
  });
};

// 全局警告处理
app.config.warnHandler = (msg, instance, trace) => {
  logger.warn('Vue 警告', {
    message: msg,
    componentName: instance?.$options?.name || 'Unknown',
    trace
  });
};

// 未捕获的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  logger.error('未捕获的 Promise 错误', event.reason, {
    promise: event.promise
  });
  
  errorHandler.handle(event.reason, {
    module: 'Promise',
    level: ErrorLevel.ERROR,
    userMessage: '操作失败，请重试',
  });
  
  event.preventDefault();
});

// 全局错误捕获
window.addEventListener('error', (event) => {
  logger.error('全局错误', event.error, {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
  
  errorHandler.handle(event.error, {
    module: 'Global',
    level: ErrorLevel.ERROR,
    context: {
      filename: event.filename,
      line: event.lineno,
      column: event.colno
    }
  });
});

logger.info('应用启动', { version: '0.1.5' });
app.mount("#app");
logger.info('应用挂载完成');

// 剪贴板监听逻辑
// 在 Vue 应用挂载后执行
window.addEventListener('DOMContentLoaded', () => {
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
            router.push('/json-formatter'); // 跳转到 JSON 格式化工具
          }
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
          duration: 3000
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

      let targetRoute = '';
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
            duration: 3000
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
        }
      });
    }
  });

});

// 在应用关闭前停止剪贴板监听 (可选，因为进程会直接关闭)
window.addEventListener('beforeunload', () => {
  invoke("stop_clipboard_monitor");
});
