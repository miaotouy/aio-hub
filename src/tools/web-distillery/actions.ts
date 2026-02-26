/**
 * Web Distillery 核心操作 Facade
 */
import { invoke } from "@tauri-apps/api/core";
import { transformer } from "./core/transformer";
import { webviewBridge } from "./core/webview-bridge";
import type { QuickFetchOptions, SmartExtractOptions, FetchResult, ExtractResult, RawFetchPayload } from "./types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

const errorHandler = createModuleErrorHandler("web-distillery/actions");
const logger = createModuleLogger("web-distillery/actions");

/**
 * Level 0: 快速获取并蒸馏（基于 HTTP 请求，无浏览器）
 */
export async function quickFetch(options: QuickFetchOptions): Promise<FetchResult> {
  logger.info("Starting quickFetch", { url: options.url });
  return (await errorHandler.wrapAsync(
    async () => {
      const payload = await invoke<RawFetchPayload>("distillery_quick_fetch", {
        url: options.url,
        options: {
          url: options.url,
          timeout: options.timeout || 15000,
          headers: options.headers,
          cookieProfile: options.cookieProfile,
        },
      });

      return await transformer.transform(payload.html, options);
    },
    {
      userMessage: "网页内容获取失败，请重试",
    }
  )) as FetchResult;
}

/**
 * Level 1: 智能提取（使用 headless 子 Webview，处理 JS 渲染页面）
 */
export async function smartExtract(options: SmartExtractOptions): Promise<ExtractResult> {
  logger.info("Starting smartExtract", { url: options.url, waitFor: options.waitFor });
  return (await errorHandler.wrapAsync(
    async () => {
      // 1. 初始化 IPC 监听桥
      await webviewBridge.init();

      // 2. 创建 headless 子 Webview 并加载目标页面
      //    放到一个不可见的区域（0,0 且宽高为 1x1）
      await webviewBridge.createWebview({
        url: options.url,
        x: 0,
        y: 0,
        width: 1280,
        height: 900,
        headless: true,
      });

      // 3. 并行等待：DOM 提取触发 + 超时
      const waitTimeout = options.waitTimeout || 15000;

      // 触发带 waitFor 的提取命令
      await webviewBridge.extractDom(options.waitFor, waitTimeout);

      // 4. 等待 dom-extracted 事件从子 Webview 回传
      const extracted = await webviewBridge.waitForDomExtracted(waitTimeout + 2000);

      // 5. 销毁 headless Webview
      await webviewBridge.destroy();

      // 6. 用前端管道清洗 HTML
      const result = await transformer.transform(extracted.html, {
        ...options,
        url: extracted.url || options.url,
      });

      return {
        ...result,
        level: 1,
        url: extracted.url || options.url,
        title: extracted.title || result.title,
      } as ExtractResult;
    },
    {
      userMessage: "智能提取失败，目标页面可能需要更长加载时间或需要授权",
    }
  )) as ExtractResult;
}

/**
 * Level 2: 打开交互式 UI (P3 阶段实施)
 */
export async function openDistillery(_url?: string): Promise<void> {
  console.log("[Distillery] Interactive mode will be implemented in P3");
}
