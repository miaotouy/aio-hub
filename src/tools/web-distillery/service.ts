import type { ToolContext } from "@/services/types";
import { ensureDistilleryConfig } from "./config";
import type {
  FetchResult,
  SmartExtractOptions,
  JinaFetchOptions,
  WebDistilleryConfig,
} from "./types";
import { getFetchEngine, type FetchEngineId } from "./core/engines/catalog";
import { fetchHttp, fetchBrowser } from "./core/engines/local";
import {
  fetchDeepSeek,
  searchDeepSeek,
  createDeepSeekPage,
} from "./core/engines/deepseek";
import type {
  DeepSeekSearchOptions,
  WebSearchItem,
} from "@/llm-apis/adapters/deepseek/tools";
import { fetchJina } from "./core/engines/jina";
import { BrowserUpgradeRequired, DistilleryError } from "./core/engines/errors";

export interface FetchPageOptions
  extends
    SmartExtractOptions,
    Omit<JinaFetchOptions, keyof SmartExtractOptions | "engine"> {
  engine?: FetchEngineId;
  allowBrowserFallback?: boolean;
  jinaEngine?: JinaFetchOptions["engine"];
}

type EngineExecutor = (
  options: FetchPageOptions,
  config: WebDistilleryConfig,
  context?: ToolContext
) => Promise<FetchResult>;
let browserQueue: Promise<void> = Promise.resolve();
function enqueueBrowser(options: FetchPageOptions, context?: ToolContext) {
  const task = browserQueue.then(() => {
    options.signal?.throwIfAborted();
    return fetchBrowser(options, context);
  });
  browserQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}
const executors = {
  deepseek: fetchDeepSeek,
  fast: (options, _config, context) => fetchHttp(options, context),
  smart: (options, _config, context) => enqueueBrowser(options, context),
  jina: (options, config, context) =>
    fetchJina({ ...options, engine: options.jinaEngine }, config, context),
} satisfies Record<FetchEngineId, EngineExecutor>;

/** 所有调用入口统一在此解析默认值、校验能力与执行回退。 */
export async function fetchPage(
  request: FetchPageOptions,
  context?: ToolContext
): Promise<FetchResult> {
  request.signal?.throwIfAborted();
  const config = await ensureDistilleryConfig();
  const engineId = request.engine ?? config.defaultMode;
  const engine = getFetchEngine(engineId);
  if (!engine)
    throw new DistilleryError("INVALID_ENGINE", "请选择可用的提取引擎");
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new DistilleryError("INVALID_URL", "请输入有效的网页地址");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new DistilleryError(
      "INVALID_URL",
      "请使用有效的 HTTP 或 HTTPS 网页地址"
    );
  }
  const format =
    request.format ??
    ((engine.formats as readonly string[]).includes(config.defaultFormat)
      ? config.defaultFormat
      : engine.formats[0]);
  if (!(engine.formats as readonly string[]).includes(format)) {
    throw new DistilleryError(
      "UNSUPPORTED_FORMAT",
      `${engine.name} 暂不支持所选输出格式`
    );
  }
  const options = {
    ...request,
    url: url.href,
    format,
    cleanMode: request.cleanMode ?? config.defaultCleanMode,
    timeout: request.timeout ?? config.network.timeout,
  };
  try {
    return await executors[engineId](options, config, context);
  } catch (error) {
    if (
      engineId !== "fast" ||
      !(error instanceof BrowserUpgradeRequired) ||
      request.allowBrowserFallback === false
    )
      throw error;
    context?.reportStatus(
      `快速获取受阻（${error.message}），正在切换到智能提取...`
    );
    return executors.smart(options, config, context);
  }
}

/** 搜索返回来源列表，保持与单篇正文提取的契约分离。 */
export async function searchWeb(
  options: DeepSeekSearchOptions,
  context?: ToolContext
) {
  return searchDeepSeek(options, await ensureDistilleryConfig(), context);
}

/** 已附带正文的来源复用内容，其余来源显式执行一次抓取。 */
export async function fetchSearchResult(
  item: WebSearchItem,
  signal?: AbortSignal
): Promise<FetchResult> {
  signal?.throwIfAborted();
  if (item.content.trim()) {
    const config = await ensureDistilleryConfig();
    return createDeepSeekPage(item, config.defaultCleanMode);
  }
  return fetchPage({
    url: item.url,
    engine: "deepseek",
    format: "markdown",
    signal,
  });
}
