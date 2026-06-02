/**
 * LLM Inspector — API 格式检测
 *
 * 通过请求 URL 的路径片段判断目标 LLM 服务的接口格式，供 `messageParser`、
 * `streamMerger`、`contentExtractor` 等多个核心模块共享。
 */

/** 已知的 API 格式类型 */
export type ApiFormat =
  | "openai-chat" // /v1/chat/completions
  | "openai-responses" // /v1/responses
  | "openai-completions" // /v1/completions (legacy)
  | "anthropic" // /v1/messages
  | "gemini" // :generateContent, :streamGenerateContent
  | "cohere" // /v1/chat, /v2/chat
  | "ollama" // /api/chat, /api/generate
  | "unknown";

/** 通过请求 URL 路径检测 API 格式 */
export function detectApiFormat(url: string): ApiFormat {
  const path = extractPath(url);

  // OpenAI 系列
  if (path.includes("/chat/completions")) return "openai-chat";
  if (path.includes("/responses")) return "openai-responses";
  if (path.includes("/completions") && !path.includes("/chat/")) {
    return "openai-completions";
  }

  // Anthropic
  if (path.includes("/messages")) return "anthropic";

  // Google Gemini
  if (
    path.includes(":generateContent") ||
    path.includes(":streamGenerateContent")
  ) {
    return "gemini";
  }

  // Cohere
  if (path.match(/\/v[12]\/chat/)) return "cohere";

  // Ollama
  if (path.includes("/api/chat") || path.includes("/api/generate")) {
    return "ollama";
  }

  return "unknown";
}

/** 提取 URL pathname；解析失败时退化为原字符串 */
function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
