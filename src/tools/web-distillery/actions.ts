/**
 * Web Distillery 核心操作 Facade
 */
import { invoke } from "@tauri-apps/api/core";
import { transformer } from "./core/transformer";
import { webviewBridge } from "./core/webview-bridge";
import { actionRunner } from "./core/action-runner";
import { recipeStore } from "./core/recipe-store";
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

      // 2. 查找是否有匹配的配方
      const matchedRecipe = await recipeStore.findBestMatch(options.url);
      if (matchedRecipe) {
        logger.info("Found matched recipe", { id: matchedRecipe.id, name: matchedRecipe.name });
      }

      // 3. 创建 headless 子 Webview 并加载目标页面
      await webviewBridge.createWebview({
        url: options.url,
        x: -2000, // 确保在屏幕外
        y: -2000,
        width: 1280,
        height: 900,
        headless: true,
      });

      // 4. 如果有配方动作，执行它们
      if (matchedRecipe?.actions?.length) {
        logger.info("Executing recipe actions", { count: matchedRecipe.actions.length });
        await actionRunner.runSequence(matchedRecipe.actions);
      }

      // 5. 并行等待：DOM 提取触发 + 超时
      const waitTimeout = options.waitTimeout || 15000;
      const combinedWaitFor = options.waitFor || (matchedRecipe?.extractSelectors?.[0]);

      // 触发带 selector 的提取命令
      await webviewBridge.extractDom(combinedWaitFor, waitTimeout);

      // 6. 等待 dom-extracted 事件从子 Webview 回传
      const extracted = await webviewBridge.waitForDomExtracted(waitTimeout + 2000);

      // 7. 销毁 headless Webview
      await webviewBridge.destroy();

      // 8. 用前端管道清洗 HTML
      // 这里的 include/exclude 优先级：options > recipe
      const finalOptions = {
        ...options,
        includeSelectors: options.extractSelectors || matchedRecipe?.extractSelectors,
        excludeSelectors: options.excludeSelectors || matchedRecipe?.excludeSelectors,
      };

      const result = await transformer.transform(extracted.html, finalOptions);

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
