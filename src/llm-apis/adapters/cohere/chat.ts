import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { parseSSEStream, extractTextFromSSE, extractReasoningFromSSE } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  applyCustomParameters,
  buildBase64DataUrl,
} from "@/llm-apis/request-builder";
import { asyncJsonStringify } from "@/utils/serialization";
import { cohereUrlHandler } from "./utils";

/**
 * 调用 Cohere Chat API
 */
export const callCohereChatApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = cohereUrlHandler.buildUrl(profile.baseUrl || "https://api.cohere.com", "chat");

  // 获取第一个可用的 API Key
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 使用共享函数提取通用参数
  const commonParams = extractCommonParameters(options);

  // 构建 messages 数组（V2 API 格式）
  const messages = [];

  // 直接转换所有消息（包括 system 角色）
  for (const msg of options.messages || []) {
    const role = msg.role;

    if (typeof msg.content === "string") {
      messages.push({
        role,
        content: msg.content,
      });
    } else {
      // 处理复杂内容（包含图片等）
      const parsed = parseMessageContents(msg.content);
      let contentValue: string | any[];

      if (parsed.imageParts.length > 0) {
        // 多模态格式
        contentValue = [];
        if (parsed.textParts.length > 0) {
          const textContent = parsed.textParts.map((part) => part.text).join("\n");
          contentValue.push({ type: "text", text: textContent });
        }
        for (const img of parsed.imageParts) {
          contentValue.push({
            type: "image_url",
            image_url: {
              url: buildBase64DataUrl(img.base64, img.mimeType),
            },
          });
        }
      } else {
        // 纯文本格式
        contentValue = parsed.textParts.map((part) => part.text).join("\n");
      }

      messages.push({
        role,
        content: contentValue,
      });
    }
  }

  const body: any = {
    model: options.modelId,
    messages: messages,
    temperature: commonParams.temperature ?? 0.5,
  };

  if (commonParams.maxTokens !== undefined) {
    body.max_tokens = commonParams.maxTokens;
  }

  // 思考能力配置 (V2 API)
  if (options.thinkingEnabled !== undefined) {
    if (options.thinkingEnabled) {
      const thinkingConfig: any = { type: "enabled" };
      if (options.thinkingBudget) {
        thinkingConfig.budget_tokens = options.thinkingBudget;
      }
      body.thinking = thinkingConfig;
    } else {
      body.thinking = { type: "disabled" };
    }
  }

  // 添加通用参数
  if (commonParams.topP !== undefined) {
    body.p = commonParams.topP;
  }
  if (commonParams.topK !== undefined) {
    body.k = commonParams.topK;
  }
  if (commonParams.frequencyPenalty !== undefined) {
    body.frequency_penalty = commonParams.frequencyPenalty;
  }
  if (commonParams.presencePenalty !== undefined) {
    body.presence_penalty = commonParams.presencePenalty;
  }
  if (commonParams.seed !== undefined) {
    body.seed = commonParams.seed;
  }
  if (commonParams.stop !== undefined) {
    body.stop_sequences = Array.isArray(commonParams.stop)
      ? commonParams.stop
      : [commonParams.stop];
  }

  // 工具支持
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  if (options.toolChoice) {
    if (typeof options.toolChoice === 'string') {
      body.tool_choice = { type: options.toolChoice };
    } else if (options.toolChoice.type === 'function') {
      body.tool_choice = {
        type: 'function',
        function: { name: options.toolChoice.function.name },
      };
    }
  }

  // 应用自定义参数
  applyCustomParameters(body, options);

  // 构建请求头
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  // 如果启用流式响应
  if (options.stream && options.onStream) {
    body.stream = true;

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: await asyncJsonStringify(body),
        forceProxy: options.forceProxy,
        relaxIdCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
        isStreaming: true,
      },
      options.timeout,
      options.signal
    );

    await ensureResponseOk(response);

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    let fullContent = "";
    let fullReasoning = "";

    await parseSSEStream(reader, (data) => {
      const text = extractTextFromSSE(data, "cohere");
      if (text) {
        fullContent += text;
        options.onStream!(text);
      }

      const reasoning = extractReasoningFromSSE(data, "cohere");
      if (reasoning && options.onReasoningStream) {
        fullReasoning += reasoning;
        options.onReasoningStream(reasoning);
      }
    }, undefined, options.signal);

    return {
      content: fullContent,
      reasoningContent: fullReasoning || undefined,
      isStream: true,
    };
  }

  // 非流式响应
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: await asyncJsonStringify(body),
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    options.timeout,
    options.signal
  );

  await ensureResponseOk(response);

  const data = await response.json();

  let content = "";
  if (data.message?.content) {
    for (const part of data.message.content) {
      if (part.type === "text") {
        content += part.text;
      }
    }
  } else if (data.text) {
    content = data.text;
  } else {
    throw new Error(`Cohere API 响应格式异常: ${JSON.stringify(data)}`);
  }

  return {
    content: content,
    usage: data.usage?.tokens
      ? {
        promptTokens: data.usage.tokens.input_tokens,
        completionTokens: data.usage.tokens.output_tokens,
        totalTokens: data.usage.tokens.input_tokens + data.usage.tokens.output_tokens,
      }
      : data.meta?.tokens
        ? {
          promptTokens: data.meta.tokens.input_tokens,
          completionTokens: data.meta.tokens.output_tokens,
          totalTokens: data.meta.tokens.input_tokens + data.meta.tokens.output_tokens,
        }
        : undefined,
  };
};