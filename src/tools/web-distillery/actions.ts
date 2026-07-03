// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Web Distillery 核心操作 Facade
 */
import { invoke } from "@tauri-apps/api/core";
import router from "@/router";
import { transformer } from "./core/transformer";
import { iframeBridge } from "./core/iframe-bridge";
import { actionRunner } from "./core/action-runner";
import { recipeStore } from "./core/recipe-store";
import { cookieProfileStore } from "./core/cookie-profile-store";
import type {
  QuickFetchOptions,
  SmartExtractOptions,
  FetchResult,
  ExtractResult,
  RawFetchPayload,
  CookieProfile,
} from "./types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { getLocalISOString } from "@/utils/time";
import { getWebViewFingerprint } from "./core/fingerprint";

const errorHandler = createModuleErrorHandler("web-distillery/actions");
const logger = createModuleLogger("web-distillery/actions");

import type { ToolContext } from "@/services/types";

/**
 * 解析蒸馏时应使用的 Cookie Profile
 * 优先级：配方绑定的 cookieProfile > URL 匹配的激活 Profile
 */
async function resolveProfileForUrl(
  url: string,
  recipeCookieProfileId?: string
): Promise<CookieProfile | null> {
  await cookieProfileStore.load();

  // 优先使用配方绑定的身份卡片
  if (recipeCookieProfileId) {
    const bound = await cookieProfileStore.getById(recipeCookieProfileId);
    if (bound) {
      logger.info("Using recipe-bound cookie profile", {
        profileId: bound.id,
        profileName: bound.name,
      });
      return bound;
    }
    logger.warn(
      "Recipe-bound cookie profile not found, falling back to URL match",
      {
        profileId: recipeCookieProfileId,
      }
    );
  }

  // 回退到 URL 匹配的激活 Profile
  return cookieProfileStore.getActiveProfileForUrl(url);
}

/**
 /**
  * 检测 quickFetch 结果是否需要自动升级到 smartExtract
  */
function detectShouldUpgrade(payload: RawFetchPayload): string | null {
  // 1. 反爬 challenge 页面（后端已检测）
  if (payload.isChallengePage) return "反爬验证页面";

  // 2. 状态码异常
  if (payload.statusCode === 403) return "403 禁止访问";
  if (payload.statusCode === 429) return "429 请求过频";

  // 3. SPA 空壳检测
  const htmlLower = payload.html.toLowerCase();
  if (payload.contentLength < 2000 && payload.html.length > 200) {
    if (
      htmlLower.includes('id="app"') ||
      htmlLower.includes('id="root"') ||
      htmlLower.includes('id="__next"') ||
      htmlLower.includes('id="__nuxt"')
    ) {
      return "SPA 空壳页面";
    }
  }

  // 4. 内容极短且文本密度低（大量标签但几乎没有文字）
  const textOnly = payload.html.replace(/<[^>]*>/g, "").trim();
  if (textOnly.length < 100 && payload.html.length > 1000) {
    return "文本密度过低";
  }

  return null;
}

/**
 * 快速获取并蒸馏（基于 HTTP 请求，无浏览器）
 * 使用 wreq 进行 TLS/H2 指纹模拟，并在质量不足时自动升级到 smartExtract
 */
export async function quickFetch(
  options: QuickFetchOptions,
  context?: ToolContext
): Promise<FetchResult> {
  logger.info("Starting quickFetch", { url: options.url });
  context?.reportStatus("正在通过 HTTP 获取网页内容...");
  return (await errorHandler.wrapAsync(
    async () => {
      // 先尝试通过 URL 匹配配方（不需要 HTML 内容），以获取绑定的身份卡片
      const preMatchedRecipe = await recipeStore.findBestMatch(options.url);
      const activeProfile = await resolveProfileForUrl(
        options.url,
        preMatchedRecipe?.cookieProfile
      );
      const cookieStr = activeProfile
        ? activeProfile.cookies.map((c) => `${c.name}=${c.value}`).join("; ")
        : undefined;

      // 获取当前 WebView 的真实浏览器指纹
      const fingerprint = getWebViewFingerprint();

      const payload = await invoke<RawFetchPayload>("distillery_quick_fetch", {
        url: options.url,
        options: {
          url: options.url,
          timeout: options.timeout || 15000,
          headers: options.headers,
          cookieProfile: options.cookieProfile,
        },
        cookies: cookieStr,
        fingerprint,
      });

      if (activeProfile) {
        logger.info("Using cookie profile for quickFetch", {
          profileName: activeProfile.name,
          domain: activeProfile.domain,
        });
        cookieProfileStore.update(activeProfile.id, {
          lastUsedAt: getLocalISOString(),
        });
      }

      // 质量门控：检测是否需要自动升级到 smartExtract
      const upgradeReason = detectShouldUpgrade(payload);
      if (upgradeReason && !(options as any)._noUpgrade) {
        logger.warn(
          "quickFetch quality insufficient, upgrading to smartExtract",
          {
            reason: upgradeReason,
            statusCode: payload.statusCode,
            contentLength: payload.contentLength,
          }
        );
        context?.reportStatus(
          `快速获取受阻(${upgradeReason})，正在切换到智能提取...`
        );
        return (await smartExtract(
          { ...options, _noUpgrade: true } as any,
          context
        )) as unknown as FetchResult;
      }

      context?.reportStatus("内容获取成功，正在蒸馏提取...");
      // 用 HTML 内容做更精确的配方匹配（内容嗅探）
      const matchedRecipe =
        (await recipeStore.findBestMatch(options.url, payload.html)) ||
        preMatchedRecipe;
      const result = await transformer.transform(
        payload.html,
        {
          ...options,
          cleanMode: options.cleanMode,
        },
        matchedRecipe || undefined,
        "fast"
      );

      // 保存原始 HTML 用于源码查看
      return {
        ...result,
        domSnapshot: payload.html,
      };
    },
    {
      userMessage: "网页内容获取失败，请重试",
    }
  )) as FetchResult;
}
/**
 * 智能提取（使用隐藏 Iframe 渲染 JS，支持动态内容）
 */
export async function smartExtract(
  options: SmartExtractOptions,
  context?: ToolContext
): Promise<ExtractResult> {
  logger.info("Starting smartExtract", {
    url: options.url,
    waitFor: options.waitFor,
  });
  context?.reportStatus("准备启动浏览器引擎...");
  return (await errorHandler.wrapAsync(
    async () => {
      // 1. 查找是否有匹配的配方
      const matchedRecipe = await recipeStore.findBestMatch(options.url);
      if (matchedRecipe) {
        logger.info("Found matched recipe", {
          id: matchedRecipe.id,
          name: matchedRecipe.name,
        });
      }

      // 查找匹配的 Cookie Profile 并设置代理 cookie
      // 优先使用配方绑定的身份卡片
      const activeProfile = await resolveProfileForUrl(
        options.url,
        matchedRecipe?.cookieProfile
      );

      if (activeProfile) {
        const cookieStr = activeProfile.cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        await invoke("distillery_set_proxy_cookies", { cookies: cookieStr });
        logger.info("Using cookie profile for smartExtract", {
          profileName: activeProfile.name,
          domain: activeProfile.domain,
        });
      } else {
        await invoke("distillery_set_proxy_cookies", { cookies: null });
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

        // 注入非 HttpOnly cookie 到 document.cookie
        if (activeProfile) {
          for (const cookie of activeProfile.cookies.filter(
            (c) => !c.httpOnly
          )) {
            const parts = [`${cookie.name}=${cookie.value}`];
            if (cookie.domain) parts.push(`domain=${cookie.domain}`);
            if (cookie.path) parts.push(`path=${cookie.path}`);
            if (cookie.expires)
              parts.push(`expires=${new Date(cookie.expires).toUTCString()}`);
            if (cookie.secure) parts.push("secure");
            await iframeBridge.setCookie(parts.join("; "));
          }
          // 更新 lastUsedAt（非关键，不阻塞主流程）
          cookieProfileStore.update(activeProfile.id, {
            lastUsedAt: getLocalISOString(),
          });
        }

        // 执行配方动作（如果有）
        if (matchedRecipe?.actions?.length) {
          logger.info("Executing recipe actions", {
            count: matchedRecipe.actions.length,
          });
          await actionRunner.runSequence(matchedRecipe.actions);
        }

        // 5. 自动滚动以触发懒加载内容
        const scrollConfig = matchedRecipe?.scrollConfig;
        if (!scrollConfig?.disabled) {
          context?.reportStatus("正在滚动页面加载动态内容...");
          const maxScrolls = scrollConfig?.maxScrolls ?? 3;
          const scrollDelay = scrollConfig?.delay ?? 800;
          await iframeBridge.autoScroll(maxScrolls, scrollDelay);
        }

        // 6. 并行等待：DOM 提取触发 + 超时
        // 优先级：options > recipe > 默认值
        const waitTimeout =
          options.waitTimeout || matchedRecipe?.waitTimeout || 15000;
        logger.debug("Extraction parameters", {
          waitTimeout,
          waitFor: options.waitFor || matchedRecipe?.waitFor,
        });
        const combinedWaitFor =
          options.waitFor ||
          matchedRecipe?.waitFor ||
          matchedRecipe?.extractSelectors?.[0];

        // 预先启动等待事件监听（避免时序竞态条件丢失消息）
        const extractPromise = iframeBridge.waitForDomExtracted(
          waitTimeout + 3000
        );

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
          includeSelectors:
            options.extractSelectors || matchedRecipe?.extractSelectors,
          excludeSelectors:
            options.excludeSelectors || matchedRecipe?.excludeSelectors,
        };

        context?.reportStatus("内容抓取成功，正在进行高纯度蒸馏...");
        const result = await transformer.transform(
          extracted.html,
          {
            ...finalOptions,
            cleanMode: options.cleanMode,
          },
          matchedRecipe || undefined
        );

        return {
          ...result,
          mode: "smart",
          url: extracted.url || options.url,
          title: extracted.title || result.title,
          domSnapshot: extracted.html,
        } as ExtractResult;
      } finally {
        // 清除代理 cookie，避免影响后续请求
        await invoke("distillery_set_proxy_cookies", { cookies: null }).catch(
          () => {}
        );
        // 无论成功失败，都清理
        await iframeBridge.destroy().catch(() => {});
        tempContainer.remove();
      }
    },
    {
      userMessage: "智能提取失败，目标页面可能需要更长加载时间或需要授权",
    }
  )) as ExtractResult;
}

/**
 * 处理本地内容（手动上传的文件）
 */
export async function processLocalContent(
  content: string,
  fileName: string,
  options?: Partial<QuickFetchOptions>
): Promise<FetchResult> {
  logger.info("Processing local content", {
    fileName,
    contentLength: content.length,
  });
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
        matchedRecipe || undefined
      );

      return {
        ...result,
        domSnapshot: content,
      };
    },
    {
      userMessage: "本地内容处理失败，请检查文件格式",
    }
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
