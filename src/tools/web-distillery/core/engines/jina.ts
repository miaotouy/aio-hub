import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { getLocalISOString } from "@/utils/time";
import type { ToolContext } from "@/services/types";
import type {
  JinaFetchOptions,
  FetchResult,
  RawFetchPayload,
  FetchFormat,
  WebDistilleryConfig,
} from "../../types";
import {
  stripMarkdownLinks,
  extractTitleFromMarkdown,
} from "../../utils/markdown";
import { DistilleryError } from "./errors";
const logger = createModuleLogger("web-distillery/jina");

export async function fetchJina(
  options: JinaFetchOptions,
  config: WebDistilleryConfig,
  context?: ToolContext
): Promise<FetchResult> {
  logger.info("Starting jinaFetch", { url: options.url });
  context?.reportStatus("正在通过 Jina Reader 云端引擎提炼内容...");

  const apiKey = options.apiKey || config.jina.apiKey;
  const timeoutMs = options.timeout || config.network.timeout || 20000;

  const targetFormat = options.format || config.defaultFormat || "markdown";
  const headers: Record<string, string> = {
    Accept: "text/plain, */*",
    "X-Respond-With": targetFormat, // 官方规范主要控制头
    "X-Return-Format": targetFormat, // 兼顾向后兼容
    "X-Timeout": String(Math.round(timeoutMs / 1000)), // 秒级超时头
  };

  // 日志安全：只记录 Key 是否存在，绝不打印明文
  if (apiKey) {
    logger.debug("Jina request authenticated", {
      hasApiKey: !!apiKey.trim(),
    });
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  // 引擎选择 (支持 ReaderLM-v2)
  const engine = options.engine || config.jina.engine;
  if (engine && engine !== "default") {
    headers["X-Engine"] = engine;
  }

  if (options.withGeneratedAlt ?? config.jina.withGeneratedAlt) {
    headers["X-With-Generated-Alt"] = "true";
  }
  const targetSelector = options.targetSelector || config.jina.targetSelector;
  if (targetSelector) {
    headers["X-Target-Selector"] = targetSelector;
  }
  // 官方标准头为 X-Wait-For-Selector
  const waitForSelector =
    options.waitForSelector || config.jina.waitForSelector;
  if (waitForSelector) {
    headers["X-Wait-For-Selector"] = waitForSelector;
  }
  // 支持直接在服务端剥离广告或干扰元素
  const removeSelector = options.removeSelector || config.jina.removeSelector;
  if (removeSelector) {
    headers["X-Remove-Selector"] = removeSelector;
  }

  // 统一通过 Rust 端的通用 HTTP 客户端代理请求，避开前端 CORS 与 CSP 约束
  const jinaTargetUrl = `https://r.jina.ai/${options.url.trim()}`;
  const payload = await invoke<RawFetchPayload>("distillery_quick_fetch", {
    url: jinaTargetUrl,
    options: {
      url: jinaTargetUrl,
      timeout: timeoutMs,
      headers,
    },
  });

  if (payload.statusCode >= 400) {
    throw new DistilleryError(
      "HTTP_ERROR",
      `Jina Reader 响应异常: HTTP ${payload.statusCode}`,
      payload.statusCode,
      payload.statusCode === 429 || payload.statusCode >= 500
    );
  }

  if (!payload.html.trim())
    throw new DistilleryError("EMPTY_CONTENT", "Jina Reader 未返回正文");
  let finalContent = payload.html;
  // 如果启用了 cleanMode，执行轻量纯文本净化（去除纯链接语法）
  if (options.cleanMode ?? config.defaultCleanMode) {
    finalContent = stripMarkdownLinks(finalContent);
  }

  return {
    url: options.url,
    title: extractTitleFromMarkdown(finalContent) || options.url,
    content: finalContent,
    contentLength: finalContent.length,
    format: targetFormat as FetchFormat,
    quality: null,
    mode: "jina",
    fetchedAt: getLocalISOString(),
  };
}
