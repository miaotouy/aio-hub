/**
 * LLM API 请求构建辅助模块
 */
import type { LlmMessageContent, LlmRequestOptions, LlmProfile, LlmModelInfo } from "../types";
import { getMatchedModelProperties } from "../config/model-metadata";

/**
 * 解析后的消息内容结构
 */
export interface ParsedMessageContent {
  textParts: Array<{ text: string }>;
  imageParts: Array<{ base64: string; mimeType: string }>;
  toolUseParts: Array<{ id: string; name: string; input: any }>;
  toolResultParts: Array<{ id: string; content: any; isError?: boolean }>;
}

/**
 * 解析消息内容数组
 */
export function parseMessageContents(contents: LlmMessageContent[]): ParsedMessageContent {
  const result: ParsedMessageContent = {
    textParts: [],
    imageParts: [],
    toolUseParts: [],
    toolResultParts: [],
  };

  for (const msg of contents) {
    switch (msg.type) {
      case "text":
        if (msg.text) result.textParts.push({ text: msg.text });
        break;
      case "image":
        if (msg.imageBase64) {
          result.imageParts.push({
            base64: msg.imageBase64,
            mimeType: inferImageMimeType(msg.imageBase64),
          });
        }
        break;
      case "tool_use":
        if (msg.toolUseId && msg.toolName) {
          result.toolUseParts.push({
            id: msg.toolUseId,
            name: msg.toolName,
            input: msg.toolInput || {},
          });
        }
        break;
      case "tool_result":
        if (msg.toolResultId) {
          result.toolResultParts.push({
            id: msg.toolResultId,
            content: msg.toolResultContent || "",
            isError: msg.isError,
          });
        }
        break;
    }
  }

  return result;
}

/**
 * 推断图片的 MIME 类型
 */
export function inferImageMimeType(base64Data: string): string {
  const header = base64Data.substring(0, 20);
  if (header.startsWith("iVBOR")) return "image/png";
  if (header.startsWith("/9j/")) return "image/jpeg";
  if (header.startsWith("R0lGO")) return "image/gif";
  if (header.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

/**
 * 构建 Base64 Data URL
 */
export function buildBase64DataUrl(base64Data: string, mimeType?: string): string {
  const finalMimeType = mimeType || inferImageMimeType(base64Data);
  return `data:${finalMimeType};base64,${base64Data}`;
}

/**
 * 获取模型所属的家族
 */
export function getModelFamily(modelId: string, provider?: string): string {
  const props = getMatchedModelProperties(modelId, provider);
  const group = props?.group?.toLowerCase();

  if (!group) {
    if (provider) {
      const p = provider.toLowerCase();
      if (p === "anthropic" || p === "claude") return "claude";
      if (p === "google" || p === "gemini") return "gemini";
      if (p === "deepseek") return "deepseek";
    }
    return "openai";
  }

  if (group.includes("openai") || group.startsWith("gpt") || group.startsWith("o1") || group.startsWith("o3")) return "openai";
  if (group.includes("claude")) return "claude";
  if (group.includes("gemini") || group.includes("gemma")) return "gemini";
  if (group.includes("deepseek")) return "deepseek";

  return "openai";
}

/**
 * 清理请求体中的内部字段
 */
export function cleanPayload(body: any): any {
  if (!body || typeof body !== "object") return body;

  const forbiddenKeys = [
    "onStream",
    "onReasoningStream",
    "signal",
    "timeout",
  ];

  for (const key of forbiddenKeys) {
    if (key in body) {
      delete body[key];
    }
  }

  return body;
}