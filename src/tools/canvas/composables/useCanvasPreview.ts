import { ref } from "vue";
import { debounce } from "lodash-es";
import { convertFileSrc } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/Preview");

export interface ConsoleMessage {
  id: string;
  level: "log" | "warn" | "error" | "info";
  args: string[];
  timestamp: number;
}

/**
 * Canvas 预览引擎 (Physical-First 架构)
 * 统一使用 asset:// 协议加载物理文件
 */
export function useCanvasPreview(options: {
  canvasId: () => string | null;
  basePath: () => string | null;
  entryFile?: () => string;
  readPhysicalFile: (canvasId: string, path: string) => Promise<string | null>;
}) {
  const previewSrc = ref("");
  const previewSrcdoc = ref("");
  const isRefreshing = ref(false);
  const consoleMessages = ref<ConsoleMessage[]>([]);

  /**
   * 刷新预览 (防抖)
   */
  const refreshPreview = debounce(async () => {
    const canvasId = options.canvasId();
    const path = options.basePath();
    const entry = options.entryFile?.() || "index.html";

    if (!canvasId || !path) return;

    // 读取入口文件内容
    let content = await options.readPhysicalFile(canvasId, entry);
    if (!content) {
      previewSrcdoc.value = "<h1>Error: Entry file not found</h1>";
      return;
    }

    // 构建物理基础路径的 asset:// URL
    // 在 Windows 上，确保路径以盘符开头且格式正确
    let normalizedBase = path.replace(/\\/g, "/");
    
    // 关键修复：Tauri 的 convertFileSrc 在 Windows 上如果路径不包含盘符前缀可能会解析失败
    // 我们确保它是一个绝对路径
    const baseUrl = convertFileSrc(normalizedBase);
    
    // 确保 baseUrl 以 / 结尾，这样 <base> 标签才能正确拼接相对路径
    const finalBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

    logger.info("预览 Base URL 已构建", {
      originalPath: path,
      normalizedBase,
      finalBaseUrl
    });

    // 注入 <base> 标签以解决相对路径问题
    // 同时也注入控制台捕获脚本 (参考项目惯例)
    const injectedScript = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalWarn = console.warn;
          const originalError = console.error;
          const originalInfo = console.info;

          function sendToHost(level, args) {
            window.parent.postMessage({
              type: 'canvas-console',
              level: level,
              args: Array.from(args).map(arg => {
                try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); }
                catch(e) { return '[Unserializable]'; }
              }),
              timestamp: Date.now()
            }, '*');
          }

          console.log = function() { sendToHost('log', arguments); originalLog.apply(console, arguments); };
          console.warn = function() { sendToHost('warn', arguments); originalWarn.apply(console, arguments); };
          console.error = function() { sendToHost('error', arguments); originalError.apply(console, arguments); };
          console.info = function() { sendToHost('info', arguments); originalInfo.apply(console, arguments); };
        })();
      </script>
    `;

    const baseTag = `<base href="${finalBaseUrl}">`;
    
    // 注入到 <head> 开头
    if (content.includes("<head>")) {
      content = content.replace("<head>", `<head>\n    ${baseTag}\n    ${injectedScript}`);
    } else if (content.includes("<html>")) {
      content = content.replace("<html>", `<html>\n<head>\n    ${baseTag}\n    ${injectedScript}\n</head>`);
    } else {
      content = `${baseTag}\n${injectedScript}\n${content}`;
    }

    previewSrcdoc.value = content;
    previewSrc.value = ""; // 清空 src 切换到 srcdoc
  }, 300);

  /**
   * 强制刷新 (不防抖)
   */
  function forceRefresh() {
    refreshPreview();
  }

  /**
   * 清空控制台
   */
  function clearConsole() {
    consoleMessages.value = [];
  }

  return {
    previewSrc,
    previewSrcdoc,
    isRefreshing,
    consoleMessages,
    refreshPreview,
    forceRefresh,
    clearConsole,
  };
}
