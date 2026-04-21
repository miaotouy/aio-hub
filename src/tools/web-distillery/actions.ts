/**
 * Web Distillery 核心操作 Facade
 */
import { invoke } from "@tauri-apps/api/core";
import router from "@/router";
import { transformer } from "./core/transformer";
import { iframeBridge } from "./core/iframe-bridge";
import { actionRunner } from "./core/action-runner";
import { recipeStore } from "./core/recipe-store";
import type { QuickFetchOptions, SmartExtractOptions, FetchResult, ExtractResult, RawFetchPayload } from "./types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

const errorHandler = createModuleErrorHandler("web-distillery/actions");
const logger = createModuleLogger("web-distillery/actions");

import type { ToolContext } from "@/services/types";

/**
 * 快速获取并蒸馏（基于 HTTP 请求，无浏览器）
 */
export async function quickFetch(options: QuickFetchOptions, context?: ToolContext): Promise<FetchResult> {
  logger.info("Starting quickFetch", { url: options.url });
  context?.reportStatus("正在通过 HTTP 获取网页内容...");
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

      context?.reportStatus("内容获取成功，正在蒸馏提取...");
      const matchedRecipe = await recipeStore.findBestMatch(options.url, payload.html);
      const result = await transformer.transform(
        payload.html,
        {
          ...options,
          cleanMode: options.cleanMode,
        },
        matchedRecipe || undefined,
        "fast",
      );

      // 保存原始 HTML 用于源码查看
      return {
        ...result,
        domSnapshot: payload.html,
      };
    },
    {
      userMessage: "网页内容获取失败，请重试",
    },
  )) as FetchResult;
}

/**
 * 智能提取（使用隐藏 Iframe 渲染 JS，支持动态内容）
 */
export async function smartExtract(options: SmartExtractOptions, context?: ToolContext): Promise<ExtractResult> {
  logger.info("Starting smartExtract", { url: options.url, waitFor: options.waitFor });
  context?.reportStatus("准备启动浏览器引擎...");
  return (await errorHandler.wrapAsync(
    async () => {
      // 1. 查找是否有匹配的配方
      const matchedRecipe = await recipeStore.findBestMatch(options.url);
      if (matchedRecipe) {
        logger.info("Found matched recipe", { id: matchedRecipe.id, name: matchedRecipe.name });
      }

      // 初始化 bridge（启动代理服务器）
      await iframeBridge.init();

      // 创建临时隐藏容器
      const tempContainer = document.createElement("div");
      tempContainer.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;width:1920px;height:5000px;visibility:hidden;pointer-events:none;";
      document.body.appendChild(tempContainer);

      try {
        // 创建隐藏 Iframe
        context?.reportStatus("正在加载并渲染目标页面...");
        await iframeBridge.create({
          url: options.url,
          hidden: true,
          container: tempContainer,
        });

        // 执行配方动作（如果有）
        if (matchedRecipe?.actions?.length) {
          logger.info("Executing recipe actions", { count: matchedRecipe.actions.length });
          await actionRunner.runSequence(matchedRecipe.actions);
        }

        // 5. 并行等待：DOM 提取触发 + 超时
        // 优先级：options > recipe > 默认值
        const waitTimeout = options.waitTimeout || matchedRecipe?.waitTimeout || 15000;
        logger.debug("Extraction parameters", { waitTimeout, waitFor: options.waitFor || matchedRecipe?.waitFor });
        const combinedWaitFor =
          options.waitFor || matchedRecipe?.waitFor || matchedRecipe?.extractSelectors?.[0];

        // 预先启动等待事件监听（避免时序竞态条件丢失消息）
        const extractPromise = iframeBridge.waitForDomExtracted(waitTimeout + 3000);

        // 触发带 selector 的提取命令
        context?.reportStatus("正在分析页面结构...");
        await iframeBridge.extractDom(combinedWaitFor, waitTimeout);

        // 6. 等待结果
        context?.reportStatus("正在抓取动态内容...");
        const extracted = await extractPromise;

        if (!extracted) {
          throw new Error("未能从页面获取到有效内容");
        }

      // 8. 用前端管道清洗 HTML
      // 这里的 include/exclude 优先级：options > recipe
      const finalOptions = {
        ...options,
        includeSelectors: options.extractSelectors || matchedRecipe?.extractSelectors,
        excludeSelectors: options.excludeSelectors || matchedRecipe?.excludeSelectors,
      };

      context?.reportStatus("内容抓取成功，正在进行高纯度蒸馏...");
      const result = await transformer.transform(
        extracted.html,
        {
          ...finalOptions,
          cleanMode: options.cleanMode,
        },
        matchedRecipe || undefined,
      );

      return {
        ...result,
        mode: "smart",
        url: extracted.url || options.url,
        title: extracted.title || result.title,
        domSnapshot: extracted.html,
      } as ExtractResult;
    } finally {
      // 无论成功失败，都清理
      await iframeBridge.destroy().catch(() => {});
      tempContainer.remove();
    }
    },
    {
      userMessage: "智能提取失败，目标页面可能需要更长加载时间或需要授权",
    },
  )) as ExtractResult;
}

/**
 * 处理本地内容（手动上传的文件）
 */
export async function processLocalContent(
  content: string,
  fileName: string,
  options?: Partial<QuickFetchOptions>,
): Promise<FetchResult> {
  logger.info("Processing local content", { fileName, contentLength: content.length });
  return (await errorHandler.wrapAsync(
    async () => {
      const url = `file://${fileName}`;
      const matchedRecipe = await recipeStore.findBestMatch(url, content);
      const result = await transformer.transform(
        content,
        {
          url,
          format: options?.format || "markdown",
          ...options,
          cleanMode: options?.cleanMode,
        },
        matchedRecipe || undefined,
      );

      return {
        ...result,
        domSnapshot: content,
      };
    },
    {
      userMessage: "本地内容处理失败，请检查文件格式",
    },
  )) as FetchResult;
}

/**
 * 打开交互式 UI
 */
export async function openDistillery(url?: string): Promise<void> {
  logger.info("Opening interactive UI", { url });

  // 如果提供了 URL，先更新 store 中的当前 URL
  if (url) {
    const { useWebDistilleryStore } = await import("./stores/store");
    const store = useWebDistilleryStore();
    store.setUrl(url);
  }

  // 跳转到工具页面
  await router.push("/web-distillery");
}
