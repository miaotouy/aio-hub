import { createModuleErrorHandler } from "@/utils/errorHandler";
import router from "@/router";
import type { ToolContext } from "@/services/types";
import type {
  QuickFetchOptions,
  SmartExtractOptions,
  JinaFetchOptions,
  FetchResult,
} from "./types";
import { fetchPage } from "./service";
import { extractLocalContent } from "./core/engines/local";
import { useWebDistilleryStore } from "./stores/store";

const errorHandler = createModuleErrorHandler("web-distillery/actions");

export function quickFetch(options: QuickFetchOptions, context?: ToolContext) {
  return errorHandler.wrapAsync(
    () => fetchPage({ ...options, engine: "fast" }, context),
    { userMessage: "网页内容获取失败，请重试" }
  );
}

export function smartExtract(
  options: SmartExtractOptions,
  context?: ToolContext
) {
  return errorHandler.wrapAsync(
    () => fetchPage({ ...options, engine: "smart" }, context),
    { userMessage: "智能提取失败，请检查页面访问条件" }
  );
}

export function jinaFetch(options: JinaFetchOptions, context?: ToolContext) {
  const { engine: jinaEngine, ...request } = options;
  return errorHandler.wrapAsync(
    () => fetchPage({ ...request, jinaEngine, engine: "jina" }, context),
    { userMessage: "Jina 提取失败，请检查网络连接或 API Key" }
  );
}

export function processLocalContent(
  content: string,
  fileName: string,
  options?: Partial<QuickFetchOptions>
): Promise<FetchResult | null> {
  return errorHandler.wrapAsync(
    () => extractLocalContent(content, fileName, options),
    { userMessage: "本地内容处理失败，请检查文件格式" }
  );
}

export async function openDistillery(url?: string): Promise<void> {
  if (url) useWebDistilleryStore().setUrl(url);
  await router.push("/web-distillery");
}
