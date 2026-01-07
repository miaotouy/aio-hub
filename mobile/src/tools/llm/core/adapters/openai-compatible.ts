import type { LlmProfile } from "../../types";
import type { LlmRequestOptions } from "../../types/common";
import { httpClient } from "@/utils/http-client";
import { parseSSEStream, extractTextFromSSE, extractReasoningFromSSE } from "@/utils/sse-parser";
import { parseMessageContents, cleanPayload, buildBase64DataUrl } from "../request-builder";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm/openai-compatible");

export const openAiUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const versionedHost = (host.includes('/v1') || host.includes('/v2') || host.includes('/v3') || host.includes('/api/v')) ? host : `${host}v1/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}chat/completions`;
  }
};


/**
 * 调用 OpenAI 兼容格式的 API (移动端对等版)
 */
export const callOpenAiCompatibleApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
) => {
  const url = openAiUrlHandler.buildUrl(profile.baseUrl, "chat/completions");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (profile.apiKeys && profile.apiKeys.length > 0) {
    headers["Authorization"] = `Bearer ${profile.apiKeys[0]}`;
  }

  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  const messages: any[] = [];

  for (const msg of options.messages) {
    if (typeof msg.content === "string") {
      const messageObj: any = {
        role: msg.role,
        content: msg.content,
      };
      messages.push(messageObj);
    } else {
      const parsed = parseMessageContents(msg.content);
      const contentArray: any[] = [];

      for (const textPart of parsed.textParts) {
        contentArray.push({ type: "text", text: textPart.text });
      }

      for (const imagePart of parsed.imageParts) {
        contentArray.push({
          type: "image_url",
          image_url: {
            url: buildBase64DataUrl(imagePart.base64, imagePart.mimeType),
          },
        });
      }

      // 移动端也支持基本的文档/媒体转换逻辑（对齐桌面端）
      if ((parsed as any).documentParts) {
        for (const docPart of (parsed as any).documentParts) {
          if (docPart.source.type === "base64") {
            const mediaType = docPart.source.media_type;
            if (mediaType.startsWith("image/")) {
              contentArray.push({
                type: "image_url",
                image_url: { url: buildBase64DataUrl(docPart.source.data, mediaType) },
              });
            } else if (mediaType === "application/pdf") {
              contentArray.push({
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: buildBase64DataUrl(docPart.source.data, mediaType),
                },
              });
            }
          }
        }
      }

      messages.push({
        role: msg.role,
        content: contentArray,
      });
    }
  }

  const body: any = {
    model: options.modelId,
    messages,
    temperature: options.temperature ?? 0.7,
    stream: options.stream || false,
  };

  // 参数映射
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.topP) body.top_p = options.topP;
  if (options.stop) body.stop = options.stop;
  if (options.presencePenalty) body.presence_penalty = options.presencePenalty;
  if (options.frequencyPenalty) body.frequency_penalty = options.frequencyPenalty;
  if (options.seed) body.seed = options.seed;
  
  // 处理推理参数 (DeepSeek/OpenAI o1)
  if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;

  // 透传自定义参数
  if (options.extra) {
    Object.assign(body, options.extra);
  }

  cleanPayload(body);

  try {
    const response = await httpClient(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
      timeout: options.timeout,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    if (options.stream && options.onStream) {
      if (!response.body) throw new Error("响应体为空");
      const reader = response.body.getReader();
      let fullContent = "";
      let fullReasoning = "";

      await parseSSEStream(
        reader,
        (data) => {
          const text = extractTextFromSSE(data, "openai");
          if (text) {
            fullContent += text;
            options.onStream!(text);
          }
          const reasoning = extractReasoningFromSSE(data, "openai");
          if (reasoning) {
            fullReasoning += reasoning;
            options.onReasoningStream?.(reasoning);
          }
        },
        undefined,
        options.signal
      );

      return { content: fullContent, reasoningContent: fullReasoning, isStream: true };
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("API 响应格式异常");

    return {
      content: choice.message?.content || "",
      reasoningContent: choice.message?.reasoning_content || choice.message?.thinking || choice.message?.thought || "",
      isStream: false,
      usage: data.usage,
    };
  } catch (error) {
    logger.error("API 调用失败", error as Error, { url });
    throw error;
  }
};