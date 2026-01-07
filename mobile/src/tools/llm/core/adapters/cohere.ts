import type { LlmProfile } from "../../types";
import type { LlmRequestOptions, LlmResponse } from "../common";
// import type { EmbeddingRequestOptions, EmbeddingResponse } from "./embedding-types";
import { fetchWithTimeout, ensureResponseOk } from "../common";
import { parseSSEStream, extractTextFromSSE, extractReasoningFromSSE } from "@/utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  buildBase64DataUrl,
  applyCustomParameters,
} from "../request-builder";

/**
 * Cohere 适配器的 URL 处理逻辑
 */
export const cohereUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const versionedHost = host.includes('/v2') ? host : `${host}v2/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}chat`;
  },
  getHint: (): string => {
    return '将自动添加 /v2/chat';
  }
};

/**
 * 调用 Cohere API
 */
export const callCohereApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  // 强制使用 V2 API
  let baseUrl = profile.baseUrl || "https://api.cohere.com";
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  // 移除可能存在的 v1 后缀
  if (baseUrl.endsWith("/v1")) baseUrl = baseUrl.slice(0, -3);

  const url = cohereUrlHandler.buildUrl(profile.baseUrl, "chat");

  // 获取第一个可用的 API Key
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 使用共享函数提取通用参数
  const commonParams = extractCommonParameters(options);

  // 构建 messages 数组（V2 API 格式）
  const messages = [];

  // 直接转换所有消息（包括 system 角色）
  for (const msg of options.messages) {
    // 处理角色
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
          const textContent = parsed.textParts.map((part: any) => part.text).join("\n");
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
        contentValue = parsed.textParts.map((part: any) => part.text).join("\n");
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
    // 如果显式设置了 thinkingEnabled (true/false)
    // 注意：如果 thinkingEnabled 为 false，也需要显式传 disabled 吗？
    // 文档说默认是 enabled (对于支持的模型)，所以如果用户想关掉，需要传 disabled
    // 如果用户想开启，且有 budget，则传 budget

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
    body.tools = options.tools.map((tool: any) => ({
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

  // 应用自定义请求头
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
        body: JSON.stringify(body),
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
      // 提取文本
      const text = extractTextFromSSE(data, "cohere");
      if (text) {
        fullContent += text;
        options.onStream!(text);
      }

      // 提取思考内容
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
      body: JSON.stringify(body),
    },
    options.timeout,
    options.signal // 补上 signal
  );

  await ensureResponseOk(response);

  const data = await response.json();

  // V2 非流式响应格式: message.content[0].text
  let content = "";
  if (data.message?.content) {
    for (const part of data.message.content) {
      if (part.type === "text") {
        content += part.text;
      }
    }
  } else if (data.text) {
    // V1 兼容
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
      : data.meta?.tokens // V1 兼容
        ? {
          promptTokens: data.meta.tokens.input_tokens,
          completionTokens: data.meta.tokens.output_tokens,
          totalTokens: data.meta.tokens.input_tokens + data.meta.tokens.output_tokens,
        }
        : undefined,
  };
};

/**
* 调用 Cohere Embedding API (V2)
* (移动端暂未启用)
*/
/*
export const callCohereEmbeddingApi = async (
  profile: LlmProfile,
  options: any
): Promise<any> => {
  let baseUrl = profile.baseUrl || "https://api.cohere.com";
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  if (baseUrl.endsWith("/v1")) baseUrl = baseUrl.slice(0, -3);

  const url = `${baseUrl}/v2/embed`;
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  const taskTypeMap: Record<string, string> = {
    RETRIEVAL_QUERY: 'search_query',
    RETRIEVAL_DOCUMENT: 'search_document',
    SEMANTIC_SIMILARITY: 'search_query',
    CLASSIFICATION: 'classification',
    CLUSTERING: 'clustering',
  };

  const body: any = {
    model: options.modelId,
    texts: Array.isArray(options.input) ? options.input : [options.input],
    input_type: taskTypeMap[options.taskType || 'RETRIEVAL_QUERY'],
    embedding_types: [options.encodingFormat || 'float'],
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    options.timeout,
    options.signal
  );

  await ensureResponseOk(response);

  const data = await response.json();
  const format = options.encodingFormat || 'float';
  const embeddings = data.embeddings[format];

  return {
    object: "list",
    data: embeddings.map((embedding: number[], index: number) => ({
      object: "embedding",
      index,
      embedding,
    })),
    model: options.modelId,
    usage: {
      promptTokens: data.meta?.billed_units?.input_tokens || 0,
      totalTokens: data.meta?.billed_units?.input_tokens || 0,
    },
  };
};
*/
