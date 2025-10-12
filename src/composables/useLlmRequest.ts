/**
 * 通用 LLM 请求中间件
 * 支持文本和视觉模型的统一调用
 */

import type { LlmProfile } from "../types/llm-profiles";
import { useLlmProfiles } from "./useLlmProfiles";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { createModuleLogger } from "@utils/logger";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";

const logger = createModuleLogger("LlmRequest");

/**
 * 默认配置
 */
const DEFAULT_TIMEOUT = 60000; // 60秒
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1秒

/**
 * LLM 请求的消息内容
 */
export interface LlmMessageContent {
  type: "text" | "image";
  text?: string;
  imageBase64?: string;
}

/**
  * LLM 请求参数
  */
export interface LlmRequestOptions {
  profileId: string;
  modelId: string;
  messages: LlmMessageContent[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  /** 是否启用流式响应 */
  stream?: boolean;
  /** 流式响应回调 */
  onStream?: (chunk: string) => void;
  /** 请求超时时间（毫秒），默认 60000 */
  timeout?: number;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
}

/**
 * LLM 响应结果
 */
export interface LlmResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 是否为流式响应 */
  isStream?: boolean;
}

export function useLlmRequest() {
  const { getProfileById } = useLlmProfiles();

  /**
   * 延迟函数
   */
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * 带重试的请求包装器
   */
  const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    maxRetries: number = DEFAULT_MAX_RETRIES,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<Response> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // 如果是 4xx 错误，不重试
        if (response.status >= 400 && response.status < 500) {
          return response;
        }

        // 如果是 5xx 错误，重试
        if (response.status >= 500 && attempt < maxRetries) {
          logger.warn(`请求失败 (${response.status})，第 ${attempt + 1}/${maxRetries} 次重试`, {
            url,
            status: response.status,
          });
          await delay(DEFAULT_RETRY_DELAY * Math.pow(2, attempt));
          continue;
        }

        return response;
      } catch (error: any) {
        lastError = error;

        // 如果是超时或网络错误，重试
        if (attempt < maxRetries && (error.name === "AbortError" || error instanceof TypeError)) {
          logger.warn(`请求失败，第 ${attempt + 1}/${maxRetries} 次重试`, {
            url,
            error: error.message,
          });
          await delay(DEFAULT_RETRY_DELAY * Math.pow(2, attempt));
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error("请求失败");
  };

  /**
   * 发送 LLM 请求
   */
  const sendRequest = async (options: LlmRequestOptions): Promise<LlmResponse> => {
    try {
      logger.info("发送 LLM 请求", {
        profileId: options.profileId,
        modelId: options.modelId,
        messageCount: options.messages.length,
      });

      // 获取配置
      const profile = getProfileById(options.profileId);
      if (!profile) {
        const error = new Error(`未找到配置 ID: ${options.profileId}`);
        logger.error("配置不存在", error, { profileId: options.profileId });
        throw error;
      }

      // 检查配置是否启用
      if (!profile.enabled) {
        const error = new Error(`配置 "${profile.name}" 未启用`);
        logger.error("配置未启用", error, {
          profileId: options.profileId,
          profileName: profile.name,
        });
        throw error;
      }

      // 验证模型
      const model = profile.models.find((m) => m.id === options.modelId);
      if (!model) {
        const error = new Error(`未找到模型 ID: ${options.modelId}`);
        logger.error("模型不存在", error, {
          profileId: options.profileId,
          modelId: options.modelId,
          availableModels: profile.models.map((m) => m.id),
        });
        throw error;
      }

      logger.debug("开始调用 API", {
        providerType: profile.type,
        modelId: options.modelId,
      });

      // 根据提供商类型调用对应的 API
      let response: LlmResponse;
      switch (profile.type) {
        case "openai":
          response = await callOpenAiCompatibleApi(profile, options);
          break;
        case "openai-responses":
          response = await callOpenAiResponsesApi(profile, options);
          break;
        case "gemini":
          response = await callGeminiApi(profile, options);
          break;
        case "claude":
          response = await callClaudeApi(profile, options);
          break;
        case "cohere":
          response = await callCohereApi(profile, options);
          break;
        case "huggingface":
          response = await callHuggingFaceApi(profile, options);
          break;
        case "vertexai":
          response = await callVertexAiApi(profile, options);
          break;
        default:
          const error = new Error(`不支持的提供商类型: ${profile.type}`);
          logger.error("不支持的提供商类型", error, { providerType: profile.type });
          throw error;
      }

      logger.info("LLM 请求成功", {
        profileId: options.profileId,
        modelId: options.modelId,
        contentLength: response.content.length,
        usage: response.usage,
      });

      return response;
    } catch (error) {
      logger.error("LLM 请求失败", error, {
        profileId: options.profileId,
        modelId: options.modelId,
      });
      throw error;
    }
  };

  /**
   * 调用 OpenAI Responses API
   */
  const callOpenAiResponsesApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    const url = buildLlmApiUrl(profile.baseUrl, "openai-responses", "responses");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 使用第一个可用的 API Key
    if (profile.apiKeys && profile.apiKeys.length > 0) {
      headers["Authorization"] = `Bearer ${profile.apiKeys[0]}`;
    }

    // 构建输入内容 - Responses API 使用不同的格式
    const inputContent: any[] = [];
    
    for (const msg of options.messages) {
      if (msg.type === "text" && msg.text) {
        inputContent.push({ type: "input_text", text: msg.text });
      } else if (msg.type === "image" && msg.imageBase64) {
        inputContent.push({
          type: "input_image",
          image_url: `data:image/png;base64,${msg.imageBase64}`,
        });
      }
    }

    // 如果只有一个文本输入，可以直接使用字符串
    const input = inputContent.length === 1 && inputContent[0].type === "input_text"
      ? inputContent[0].text
      : [{ role: "user", content: inputContent }];

    const body: any = {
      model: options.modelId,
      input,
      max_output_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.5,
    };

    // 添加系统指令（如果有）
    if (options.systemPrompt) {
      body.instructions = options.systemPrompt;
    }

    // 如果启用流式响应
    if (options.stream && options.onStream) {
      body.stream = true;

      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        },
        options.maxRetries,
        options.timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
      }

      // 处理流式响应
      if (!response.body) {
        throw new Error("响应体为空");
      }

      const reader = response.body.getReader();
      let fullContent = "";

      await parseSSEStream(reader, (data) => {
        const text = extractTextFromSSE(data, "openai-responses");
        if (text) {
          fullContent += text;
          options.onStream!(text);
        }
      });

      return {
        content: fullContent,
        isStream: true,
      };
    }

    // 非流式响应
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      options.maxRetries,
      options.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Responses API 的响应格式：output 是一个数组，包含 message 对象
    let content = "";
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === "message" && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === "output_text") {
              content += contentItem.text;
            }
          }
        }
      }
    }

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  };

  /**
   * 调用 OpenAI 兼容格式的 API
   */
  const callOpenAiCompatibleApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    const url = buildLlmApiUrl(profile.baseUrl, "openai", "chat/completions");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 使用第一个可用的 API Key
    if (profile.apiKeys && profile.apiKeys.length > 0) {
      headers["Authorization"] = `Bearer ${profile.apiKeys[0]}`;
    }

    // 构建消息内容
    const messageContent: any[] = [];
    for (const msg of options.messages) {
      if (msg.type === "text" && msg.text) {
        messageContent.push({ type: "text", text: msg.text });
      } else if (msg.type === "image" && msg.imageBase64) {
        messageContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${msg.imageBase64}`,
          },
        });
      }
    }

    const messages: any[] = [];

    // 添加系统提示（如果有）
    if (options.systemPrompt) {
      messages.push({
        role: "system",
        content: options.systemPrompt,
      });
    }

    // 添加用户消息
    messages.push({
      role: "user",
      content: messageContent,
    });

    const body: any = {
      model: options.modelId,
      messages,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.5,
    };

    // 如果启用流式响应
    if (options.stream && options.onStream) {
      body.stream = true;

      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        },
        options.maxRetries,
        options.timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
      }

      // 处理流式响应
      if (!response.body) {
        throw new Error("响应体为空");
      }

      const reader = response.body.getReader();
      let fullContent = "";

      await parseSSEStream(reader, (data) => {
        const text = extractTextFromSSE(data, "openai");
        if (text) {
          fullContent += text;
          options.onStream!(text);
        }
      });

      return {
        content: fullContent,
        isStream: true,
      };
    }

    // 非流式响应
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      options.maxRetries,
      options.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  };

  /**
   * 调用 Google Gemini API
   */
  const callGeminiApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    // 获取第一个可用的 API Key
    const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

    // 流式响应使用不同的端点
    const endpoint =
      options.stream && options.onStream
        ? `models/${options.modelId}:streamGenerateContent`
        : `models/${options.modelId}:generateContent`;

    const baseUrl = buildLlmApiUrl(profile.baseUrl, "gemini", endpoint);
    const url = `${baseUrl}?key=${apiKey}${options.stream ? "&alt=sse" : ""}`;

    // 构建 parts
    const parts: any[] = [];
    for (const msg of options.messages) {
      if (msg.type === "text" && msg.text) {
        parts.push({ text: msg.text });
      } else if (msg.type === "image" && msg.imageBase64) {
        parts.push({
          inline_data: {
            mime_type: "image/png",
            data: msg.imageBase64,
          },
        });
      }
    }

    const body: any = {
      contents: [
        {
          parts,
        },
      ],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4000,
        temperature: options.temperature ?? 0.5,
      },
    };

    // Gemini 使用 systemInstruction 而不是 system message
    if (options.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    // 如果启用流式响应
    if (options.stream && options.onStream) {
      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        options.maxRetries,
        options.timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error("响应体为空");
      }

      const reader = response.body.getReader();
      let fullContent = "";

      await parseSSEStream(reader, (data) => {
        const text = extractTextFromSSE(data, "gemini");
        if (text) {
          fullContent += text;
          options.onStream!(text);
        }
      });

      return {
        content: fullContent,
        isStream: true,
      };
    }

    // 非流式响应
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      options.maxRetries,
      options.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.candidates[0].content.parts[0].text,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  };

  /**
   /**
    * 调用 Anthropic Claude API
    */
  const callClaudeApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    const url = buildLlmApiUrl(profile.baseUrl, "claude", "messages");

    // 构建消息内容
    const content: any[] = [];
    for (const msg of options.messages) {
      if (msg.type === "text" && msg.text) {
        content.push({
          type: "text",
          text: msg.text,
        });
      } else if (msg.type === "image" && msg.imageBase64) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: msg.imageBase64,
          },
        });
      }
    }

    const body: any = {
      model: options.modelId,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.5,
      messages: [
        {
          role: "user",
          content,
        },
      ],
    };

    // Claude 使用 system 参数
    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    // 如果启用流式响应
    if (options.stream && options.onStream) {
      body.stream = true;
    }

    // 获取第一个可用的 API Key
    const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

    // 如果启用流式响应
    if (options.stream && options.onStream) {
      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        },
        options.maxRetries,
        options.timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error("响应体为空");
      }

      const reader = response.body.getReader();
      let fullContent = "";

      await parseSSEStream(reader, (data) => {
        const text = extractTextFromSSE(data, "claude");
        if (text) {
          fullContent += text;
          options.onStream!(text);
        }
      });

      return {
        content: fullContent,
        isStream: true,
      };
    }

    // 非流式响应
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
      options.maxRetries,
      options.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.content[0].text,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    };
  };
  /**
   * 调用 Cohere API
   */
  const callCohereApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    const url = buildLlmApiUrl(profile.baseUrl, "cohere", "chat");

    // 获取第一个可用的 API Key
    const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

    // 构建消息内容
    const message = options.messages
      .filter((msg) => msg.type === "text" && msg.text)
      .map((msg) => msg.text)
      .join("\n");

    const body: any = {
      model: options.modelId,
      message,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.5,
    };

    // Cohere 使用 preamble 作为系统提示
    if (options.systemPrompt) {
      body.preamble = options.systemPrompt;
    }

    // 如果启用流式响应
    if (options.stream && options.onStream) {
      body.stream = true;

      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
        options.maxRetries,
        options.timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error("响应体为空");
      }

      const reader = response.body.getReader();
      let fullContent = "";

      await parseSSEStream(reader, (data) => {
        const text = extractTextFromSSE(data, "cohere");
        if (text) {
          fullContent += text;
          options.onStream!(text);
        }
      });

      return {
        content: fullContent,
        isStream: true,
      };
    }

    // 非流式响应
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      options.maxRetries,
      options.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.text,
      usage: data.meta?.tokens
        ? {
            promptTokens: data.meta.tokens.input_tokens,
            completionTokens: data.meta.tokens.output_tokens,
            totalTokens: data.meta.tokens.input_tokens + data.meta.tokens.output_tokens,
          }
        : undefined,
    };
  };

  /**
   * 调用 Hugging Face API
   */
  const callHuggingFaceApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    // Hugging Face 使用模型 ID 作为路径的一部分
    const url = `${profile.baseUrl}/models/${options.modelId}`;

    // 获取第一个可用的 API Key
    const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

    // 构建输入文本
    let inputText = "";
    if (options.systemPrompt) {
      inputText += options.systemPrompt + "\n\n";
    }
    inputText += options.messages
      .filter((msg) => msg.type === "text" && msg.text)
      .map((msg) => msg.text)
      .join("\n");

    const body = {
      inputs: inputText,
      parameters: {
        max_new_tokens: options.maxTokens || 4000,
        temperature: options.temperature ?? 0.5,
        return_full_text: false,
      },
    };

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      options.maxRetries,
      options.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Hugging Face 返回的格式可能是数组
    const resultText = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;

    return {
      content: resultText || "",
      // Hugging Face 通常不返回 token 使用信息
      usage: undefined,
    };
  };

  /**
   * 调用 Vertex AI API
   */
  const callVertexAiApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    // Vertex AI 需要项目信息，这里假设在 baseUrl 中已经包含
    // 或者从 profile 的自定义配置中获取
    const url = buildLlmApiUrl(
      profile.baseUrl,
      "vertexai",
      `models/${options.modelId}:generateContent`
    );

    // 获取第一个可用的 API Key (Access Token)
    const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

    // 构建 parts（格式类似 Gemini）
    const parts: any[] = [];
    for (const msg of options.messages) {
      if (msg.type === "text" && msg.text) {
        parts.push({ text: msg.text });
      } else if (msg.type === "image" && msg.imageBase64) {
        parts.push({
          inline_data: {
            mime_type: "image/png",
            data: msg.imageBase64,
          },
        });
      }
    }

    const body: any = {
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4000,
        temperature: options.temperature ?? 0.5,
      },
    };

    // Vertex AI 使用 systemInstruction
    if (options.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      options.maxRetries,
      options.timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.candidates[0].content.parts[0].text,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  };

  return {
    sendRequest,
  };
}
