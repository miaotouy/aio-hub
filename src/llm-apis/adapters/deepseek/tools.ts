import type { LlmProfile } from "@/types/llm-profiles";
import { useLlmKeyManager } from "@/composables/useLlmKeyManager";
import { fetchWithTimeout } from "@/llm-apis/common";
import { buildOpenAiHeaders } from "../openai/utils";

export interface DeepSeekSearchOptions {
  query: string;
  count?: number;
  originalQuestion?: string;
  localization?: string;
  needContent?: boolean;
  timeout?: number;
  signal?: AbortSignal;
}

export interface WebSearchItem {
  title: string;
  url: string;
  snippet: string;
  summary: string;
  content: string;
  siteName: string | null;
  siteIcon: string | null;
  date: string | null;
  rerankScore: number | null;
  authority: number;
}

export class DeepSeekToolsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "DeepSeekToolsError";
  }
}

function validHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DeepSeekToolsError(
      "INVALID_URL",
      "请填写有效的 HTTP 或 HTTPS 地址"
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new DeepSeekToolsError(
      "INVALID_URL",
      "请填写有效的 HTTP 或 HTTPS 地址"
    );
  }
  return url;
}

function validateQuery(value: string, label: string) {
  if (typeof value !== "string" || !value.trim() || [...value].length > 128) {
    throw new DeepSeekToolsError(
      "INVALID_QUERY",
      `${label}需包含 1～128 个字符`
    );
  }
}

async function requestTool(
  profile: LlmProfile,
  operation: "search" | "fetch",
  body: Record<string, unknown>,
  options: { timeout?: number; signal?: AbortSignal }
) {
  if (!profile.enabled)
    throw new DeepSeekToolsError(
      "PROFILE_DISABLED",
      "所选 DeepSeek 渠道已停用，请在 LLM 服务设置中启用"
    );
  const keyManager = useLlmKeyManager();
  await keyManager.ensureLoaded();
  const key = keyManager.pickKey(profile);
  if (!key)
    throw new DeepSeekToolsError(
      "MISSING_API_KEY",
      "请在 LLM 服务设置中为所选 DeepSeek 渠道配置 API Key"
    );
  const base = validHttpUrl(profile.baseUrl);
  if (base.search || base.hash)
    throw new DeepSeekToolsError(
      "INVALID_URL",
      "DeepSeek 渠道基础地址应使用 API 服务地址"
    );
  const path = base.pathname.replace(/\/+$/, "");
  base.pathname = `${path}${path.endsWith("/v1") ? "" : "/v1"}/tools/${operation}`;
  const response = await fetchWithTimeout(
    base.href,
    {
      method: "POST",
      headers: {
        ...buildOpenAiHeaders({ ...profile, apiKeys: [key.trim()] }),
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      networkStrategy: profile.networkStrategy,
      relaxIdCerts: profile.relaxIdCerts,
      http1Only: profile.http1Only,
      isStreaming: false,
      proxyBodyKind: "raw",
      requestKind: "tool",
    },
    options.timeout ?? 20000,
    options.signal
  );
  if (!response.ok) {
    const status = response.status;
    const messages: Record<number, string> = {
      400: "请求参数无效，请检查搜索词或网页地址",
      401: "DeepSeek 鉴权失败，请检查所选渠道的 API Key",
      402: "DeepSeek 账号余额不足，请充值后重试",
      403: "目标网页被 DeepSeek 安全策略拒绝",
      404:
        operation === "fetch"
          ? "未能获取网页正文，请检查地址或尝试其他提取引擎"
          : "搜索接口不可用，请检查渠道地址及接口支持情况",
      408: "DeepSeek 请求超时，请稍后重试",
      413: "请求内容过大，请缩短搜索词或目标地址",
      429: "DeepSeek 请求过于频繁，请稍后重试",
      504: "DeepSeek 下游服务超时，请稍后重试",
    };
    const retryable = status === 408 || status === 429 || status >= 500;
    const error = new DeepSeekToolsError(
      `HTTP_${status}`,
      messages[status] ??
        `DeepSeek 服务请求失败（HTTP ${status}）${retryable ? "，请稍后重试" : "，请检查渠道与请求参数"}`,
      status,
      retryable
    );
    // Search/Fetch 的 429 按账号限流，轮换 Key 无法增加额度。
    keyManager.reportFailure(profile.id, key, error, {
      allowAutoDisable: status === 401,
      countTowardThreshold: status === 401,
      forceBroken: status === 401,
      treatRateLimitAsImmediateBreak: false,
    });
    throw error;
  }
  keyManager.reportSuccess(profile.id, key);
  try {
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new DeepSeekToolsError(
      "INVALID_RESPONSE",
      "DeepSeek 返回了无法解析的响应，请检查渠道地址"
    );
  }
}

export async function callDeepSeekSearchApi(
  profile: LlmProfile,
  options: DeepSeekSearchOptions
): Promise<{ results: WebSearchItem[] }> {
  validateQuery(options.query, "搜索词");
  if (options.originalQuestion !== undefined)
    validateQuery(options.originalQuestion, "原始问题");
  const count = options.count ?? 10;
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new DeepSeekToolsError(
      "INVALID_COUNT",
      "搜索结果数量应为 1～50 的整数"
    );
  const data = await requestTool(
    profile,
    "search",
    {
      query: options.query,
      count,
      need_content: options.needContent ?? false,
      ...(options.originalQuestion === undefined
        ? {}
        : { ori_question: options.originalQuestion }),
      ...(options.localization === undefined
        ? {}
        : { localization: options.localization }),
    },
    options
  );
  if (!Array.isArray(data.results))
    throw new DeepSeekToolsError(
      "INVALID_RESPONSE",
      "DeepSeek 搜索响应缺少结果列表"
    );
  const results = data.results.map((raw: unknown): WebSearchItem => {
    if (!raw || typeof raw !== "object")
      throw new DeepSeekToolsError(
        "INVALID_RESPONSE",
        "DeepSeek 搜索结果格式异常"
      );
    const item = raw as Record<string, unknown>;
    if (typeof item.url !== "string" || typeof item.title !== "string")
      throw new DeepSeekToolsError(
        "INVALID_RESPONSE",
        "DeepSeek 搜索结果缺少标题或来源地址"
      );
    let url: string;
    try {
      url = validHttpUrl(item.url).href;
    } catch {
      throw new DeepSeekToolsError(
        "INVALID_RESPONSE",
        "DeepSeek 搜索结果包含无效来源地址"
      );
    }
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return {
      title: item.title,
      url,
      snippet: text(item.snippet),
      summary: text(item.summary),
      content: text(item.content),
      siteName: typeof item.site_name === "string" ? item.site_name : null,
      siteIcon:
        typeof item.site_icon === "string" &&
        /^https?:\/\//i.test(item.site_icon)
          ? item.site_icon
          : null,
      date:
        typeof item.date === "string" && Number.isFinite(Date.parse(item.date))
          ? item.date
          : null,
      rerankScore:
        typeof item.rerank_score === "number" &&
        Number.isFinite(item.rerank_score)
          ? item.rerank_score
          : null,
      authority:
        Number.isInteger(item.authority) &&
        Number(item.authority) >= -1 &&
        Number(item.authority) <= 4
          ? Number(item.authority)
          : -1,
    };
  });
  return { results };
}

export async function callDeepSeekFetchApi(
  profile: LlmProfile,
  options: { url: string; timeout?: number; signal?: AbortSignal }
): Promise<{ title: string; content: string }> {
  const url = validHttpUrl(options.url).href;
  if ([...url].length > 8192)
    throw new DeepSeekToolsError(
      "INVALID_URL",
      "网页地址长度应在 8192 字符以内"
    );
  const data = await requestTool(profile, "fetch", { url }, options);
  if (typeof data.content !== "string" || !data.content.trim())
    throw new DeepSeekToolsError(
      "EMPTY_CONTENT",
      "DeepSeek 未返回可用的网页正文，请尝试其他引擎"
    );
  return {
    title: typeof data.title === "string" ? data.title : "",
    content: data.content,
  };
}
