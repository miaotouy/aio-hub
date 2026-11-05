import type { LlmProfile } from "../../../types/llm-profiles";

export const createOpenAiHeaders = (
  profile: LlmProfile,
  requestId: string | undefined,
  resolveCustomHeaders: (
    headers: LlmProfile["customHeaders"]
  ) => Record<string, string>
): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 使用第一个可用的 API Key
  if (profile.apiKeys && profile.apiKeys.length > 0) {
    headers["Authorization"] = `Bearer ${profile.apiKeys[0]}`;
  }

  // 如果提供了 requestId，则注入 X-Request-ID 头部
  if (requestId) {
    headers["X-Request-ID"] = requestId;
  }

  // 应用自定义请求头（解析模板变量）
  Object.assign(headers, resolveCustomHeaders(profile.customHeaders));

  return headers;
};
