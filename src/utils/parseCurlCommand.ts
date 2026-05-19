/**
 * curl 命令解析工具
 * 从 curl 命令中提取 LLM 渠道配置信息
 */

import type { ProviderType } from "@/types/llm-profiles";

/**
 * curl 解析结果
 */
export interface ParsedCurlResult {
  /** 提取的 API 基础地址 */
  baseUrl: string;
  /** Bearer token（可能是占位符） */
  apiKey?: string;
  /** API Key 是否为占位符（需要用户手动填写） */
  apiKeyIsPlaceholder: boolean;
  /** 从 body 中提取的模型名 */
  model?: string;
  /** 非标准请求头 */
  customHeaders?: Record<string, string>;
  /** 推断的渠道类型 */
  providerType: ProviderType;
  /** 建议的渠道名称 */
  suggestedName: string;
  /** 完整的 chat 端点路径（如果非标准） */
  chatEndpoint?: string;
  /** 原始解析数据 */
  raw: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
  };
}

/**
 * 已知的 API 路径后缀，用于从 URL 中剥离以获取 baseUrl
 */
const KNOWN_PATH_SUFFIXES = [
  "/v1/chat/completions",
  "/v1/messages",
  "/v1/completions",
  "/v1/embeddings",
  "/v1/images/generations",
  "/v1/audio/speech",
  "/v1/audio/transcriptions",
  "/v1/responses",
  "/chat/completions",
  "/completions",
  "/messages",
  "/embeddings",
];

/**
 * 域名到 ProviderType 的映射
 */
const DOMAIN_TO_PROVIDER: Record<string, ProviderType> = {
  "api.openai.com": "openai",
  "api.anthropic.com": "claude",
  "generativelanguage.googleapis.com": "gemini",
  "api.deepseek.com": "deepseek",
  "api.groq.com": "groq",
  "openrouter.ai": "openrouter",
  "api.siliconflow.cn": "siliconflow",
  "api.x.ai": "xai",
  "api.cohere.com": "cohere",
  "api.moonshot.cn": "openai",
  "open.bigmodel.cn": "openai",
  "dashscope.aliyuncs.com": "openai",
  "ark.cn-beijing.volces.com": "openai",
  "api.minimax.chat": "openai",
  "api.01.ai": "openai",
  "api.baichuan-ai.com": "openai",
  "api.mistral.ai": "openai",
  "api.together.xyz": "openai",
  "api.fireworks.ai": "openai",
  "api.deepinfra.com": "openai",
  "api.perplexity.ai": "openai",
  "api.hunyuan.cloud.tencent.com": "openai",
  "api-inference.huggingface.co": "openai",
  "api-inference.modelscope.cn": "openai",
};

/**
 * 路径模式到 ProviderType 的映射
 */
const PATH_TO_PROVIDER: Array<{ pattern: RegExp; type: ProviderType }> = [
  { pattern: /\/v1\/messages/, type: "claude" },
  { pattern: /\/v1beta\//, type: "gemini" },
  { pattern: /\/v1\/responses/, type: "openai-responses" },
  { pattern: /\/openai\/deployments\//, type: "azure" },
];

/**
 * 占位符 API Key 的检测模式
 */
const PLACEHOLDER_PATTERNS = [
  /^<.*>$/, // <auto_filled_on_copy>
  /^YOUR[_\-]/i, // YOUR_API_KEY
  /^\$\{/, // ${API_KEY}
  /^\$[A-Z]/, // $API_KEY
  /^sk-[x.]{10,}$/i, // sk-xxxxxxxx
  /^xxx/i, // xxx...
  /^placeholder/i,
  /^api[_-]?key/i,
  /^insert/i,
  /^replace/i,
  /^put[_-]/i,
];

/**
 * 标准请求头（不需要作为 customHeaders 保存的）
 */
const STANDARD_HEADERS = new Set(["content-type", "authorization", "accept", "user-agent", "x-api-key"]);

/**
 * 预处理 curl 命令字符串
 * 处理多行续行符（\、^、`）
 */
function preprocessCurl(input: string): string {
  // 移除 Windows cmd 续行符 ^
  let result = input.replace(/\^\s*\r?\n\s*/g, " ");
  // 移除 PowerShell 续行符 `
  result = result.replace(/`\s*\r?\n\s*/g, " ");
  // 移除 Unix 续行符 \
  result = result.replace(/\\\s*\r?\n\s*/g, " ");
  // 规范化空白
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

/**
 * 从 curl 命令中提取 URL
 */
function extractUrl(cmd: string): string | null {
  // 匹配 curl 后面的 URL（可能有引号包裹）
  // 支持: curl "url", curl 'url', curl url
  // 也支持: curl -X POST "url", curl --request GET "url"
  const patterns = [
    // 带引号的 URL（在各种选项之后）
    /curl\s+(?:.*?\s+)?["']?(https?:\/\/[^\s"']+)["']?/i,
    // -X METHOD 后面的 URL
    /(?:-X|--request)\s+\w+\s+["']?(https?:\/\/[^\s"']+)["']?/i,
    // --url 选项
    /--url\s+["']?(https?:\/\/[^\s"']+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = cmd.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * 从 curl 命令中提取所有 -H / --header 的值
 */
function extractHeaders(cmd: string): Record<string, string> {
  const headers: Record<string, string> = {};
  // 匹配 -H "Key: Value" 或 --header "Key: Value"
  const headerRegex = /(?:-H|--header)\s+["']([^"']+)["']/gi;
  let match;
  while ((match = headerRegex.exec(cmd)) !== null) {
    const headerStr = match[1];
    const colonIdx = headerStr.indexOf(":");
    if (colonIdx > 0) {
      const key = headerStr.substring(0, colonIdx).trim();
      const value = headerStr.substring(colonIdx + 1).trim();
      headers[key.toLowerCase()] = value;
    }
  }
  return headers;
}

/**
 * 从 curl 命令中提取 -d / --data / --data-raw 的 body
 */
function extractBody(cmd: string): any | null {
  // 匹配 -d 'json' 或 --data 'json' 或 --data-raw 'json'
  // 需要处理嵌套引号的情况
  const patterns = [
    // 单引号包裹
    /(?:-d|--data|--data-raw)\s+'([\s\S]*?)(?<!\\)'/i,
    // 双引号包裹
    /(?:-d|--data|--data-raw)\s+"([\s\S]*?)(?<!\\)"/i,
    // 无引号（到下一个选项或结尾）
    /(?:-d|--data|--data-raw)\s+(\{[\s\S]*?\})\s*(?:-|$)/i,
  ];

  for (const pattern of patterns) {
    const match = cmd.match(pattern);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]);
      } catch {
        // JSON 解析失败，尝试修复常见问题
        try {
          // 移除转义的引号
          const fixed = match[1].replace(/\\"/g, '"').replace(/\\'/g, "'");
          return JSON.parse(fixed);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * 从 URL 中提取 baseUrl（剥离已知路径后缀）
 */
function extractBaseUrl(url: string): { baseUrl: string; endpoint?: string } {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // 尝试匹配已知路径后缀
    for (const suffix of KNOWN_PATH_SUFFIXES) {
      if (pathname.endsWith(suffix)) {
        const basePath = pathname.slice(0, -suffix.length);
        urlObj.pathname = basePath || "/";
        // 移除尾部斜杠
        const baseUrl = urlObj.toString().replace(/\/$/, "");
        return { baseUrl, endpoint: suffix };
      }
    }

    // 如果没有匹配到已知后缀，尝试智能剥离
    // 保留到 /v1 或 /v2 等版本路径
    const versionMatch = pathname.match(/^(.*\/v\d+)\//);
    if (versionMatch) {
      urlObj.pathname = versionMatch[1];
      const baseUrl = urlObj.toString().replace(/\/$/, "");
      const endpoint = pathname.slice(versionMatch[1].length);
      return { baseUrl, endpoint };
    }

    // 无法识别路径结构，返回去掉路径的 origin
    return { baseUrl: urlObj.origin, endpoint: pathname !== "/" ? pathname : undefined };
  } catch {
    return { baseUrl: url };
  }
}

/**
 * 从 URL 推断 ProviderType
 */
function inferProviderType(url: string, headers: Record<string, string>): ProviderType {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    // 先检查域名映射
    if (DOMAIN_TO_PROVIDER[hostname]) {
      return DOMAIN_TO_PROVIDER[hostname];
    }

    // 检查路径模式
    for (const { pattern, type } of PATH_TO_PROVIDER) {
      if (pattern.test(pathname)) {
        return type;
      }
    }

    // 检查 Anthropic 特有的 header
    if (headers["x-api-key"] && headers["anthropic-version"]) {
      return "claude";
    }

    // 检查是否包含 ollama 特征
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      const port = urlObj.port;
      if (port === "11434") return "ollama";
    }
  } catch {
    // URL 解析失败
  }

  // 默认为 OpenAI 兼容
  return "openai";
}

/**
 * 从 URL 推断渠道名称
 */
function inferName(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // 从域名中提取有意义的名称
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      // 取主域名部分（去掉 www、api 前缀和 TLD）
      const meaningful = parts.filter(
        (p) => !["www", "api", "com", "cn", "ai", "io", "org", "net", "co", "cloud"].includes(p),
      );
      if (meaningful.length > 0) {
        // 首字母大写
        return meaningful.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
      }
    }

    return hostname;
  } catch {
    return "导入的渠道";
  }
}

/**
 * 检测 API Key 是否为占位符
 */
function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * 从 headers 中提取 API Key
 */
function extractApiKey(headers: Record<string, string>): { key?: string; isPlaceholder: boolean } {
  // 优先从 Authorization: Bearer xxx 提取
  const auth = headers["authorization"];
  if (auth) {
    const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1]) {
      const key = bearerMatch[1].trim();
      return { key, isPlaceholder: isPlaceholderKey(key) };
    }
  }

  // 也检查 x-api-key（Anthropic 风格）
  const xApiKey = headers["x-api-key"];
  if (xApiKey) {
    return { key: xApiKey, isPlaceholder: isPlaceholderKey(xApiKey) };
  }

  return { isPlaceholder: true };
}

/**
 * 提取自定义请求头（排除标准头）
 */
function extractCustomHeaders(headers: Record<string, string>): Record<string, string> | undefined {
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!STANDARD_HEADERS.has(key.toLowerCase())) {
      custom[key] = value;
    }
  }
  return Object.keys(custom).length > 0 ? custom : undefined;
}

/**
 * 解析 curl 命令，提取 LLM 渠道配置信息
 *
 * @param input - curl 命令字符串（支持多行）
 * @returns 解析结果，如果无法解析则返回 null
 */
export function parseCurlCommand(input: string): ParsedCurlResult | null {
  if (!input || !input.trim()) return null;

  // 预处理
  const cmd = preprocessCurl(input);

  // 验证是否为 curl 命令
  if (!cmd.toLowerCase().startsWith("curl")) return null;

  // 提取 URL
  const url = extractUrl(cmd);
  if (!url) return null;

  // 提取 HTTP 方法
  const methodMatch = cmd.match(/(?:-X|--request)\s+(\w+)/i);
  const method = methodMatch?.[1]?.toUpperCase() || "GET";

  // 提取 headers
  const headers = extractHeaders(cmd);

  // 提取 body
  const body = extractBody(cmd);

  // 从 URL 提取 baseUrl
  const { baseUrl, endpoint } = extractBaseUrl(url);

  // 提取 API Key
  const { key: apiKey, isPlaceholder: apiKeyIsPlaceholder } = extractApiKey(headers);

  // 提取模型名
  const model = body?.model || undefined;

  // 推断渠道类型
  const providerType = inferProviderType(url, headers);

  // 推断名称
  const suggestedName = inferName(url);

  // 提取自定义 headers
  const customHeaders = extractCustomHeaders(headers);

  // 判断是否为非标准端点
  const standardEndpoints = ["/v1/chat/completions", "/chat/completions", "/v1/messages", "/v1/responses"];
  const chatEndpoint = endpoint && !standardEndpoints.includes(endpoint) ? endpoint : undefined;

  return {
    baseUrl,
    apiKey: apiKeyIsPlaceholder ? undefined : apiKey,
    apiKeyIsPlaceholder,
    model,
    customHeaders,
    providerType,
    suggestedName,
    chatEndpoint,
    raw: {
      url,
      method,
      headers,
      body,
    },
  };
}
