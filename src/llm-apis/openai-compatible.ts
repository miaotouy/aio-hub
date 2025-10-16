import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE, extractReasoningFromSSE } from "@utils/sse-parser";

/**
 * 调用 OpenAI 兼容格式的 API
 */
export const callOpenAiCompatibleApi = async (
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

  // 添加可选的高级参数
  if (options.topP !== undefined) {
    body.top_p = options.topP;
  }
  if (options.frequencyPenalty !== undefined) {
    body.frequency_penalty = options.frequencyPenalty;
  }
  if (options.presencePenalty !== undefined) {
    body.presence_penalty = options.presencePenalty;
  }
  if (options.stop !== undefined) {
    body.stop = options.stop;
  }
  if (options.n !== undefined) {
    body.n = options.n;
  }
  if (options.seed !== undefined) {
    body.seed = options.seed;
  }
  if (options.logprobs !== undefined) {
    body.logprobs = options.logprobs;
  }
  if (options.topLogprobs !== undefined) {
    body.top_logprobs = options.topLogprobs;
  }
  if (options.responseFormat !== undefined) {
    body.response_format = options.responseFormat;
  }
  if (options.tools !== undefined) {
    body.tools = options.tools;
  }
  if (options.toolChoice !== undefined) {
    body.tool_choice = options.toolChoice;
  }
  if (options.parallelToolCalls !== undefined) {
    body.parallel_tool_calls = options.parallelToolCalls;
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
      options.timeout,
      options.signal
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
    let fullReasoningContent = "";
    let usage: LlmResponse['usage'] | undefined;

    await parseSSEStream(reader, (data) => {
      const text = extractTextFromSSE(data, "openai");
      if (text) {
        fullContent += text;
        options.onStream!(text);
      }
      
      // 提取推理内容（DeepSeek reasoning）
      const reasoningText = extractReasoningFromSSE(data, "openai");
      if (reasoningText) {
        fullReasoningContent += reasoningText;
      }
      
      // 尝试从流数据中提取 usage 信息（OpenAI 在流结束时会发送 usage）
      try {
        const json = JSON.parse(data);
        if (json.usage) {
          usage = {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          };
        }
      } catch {
        // 忽略非 JSON 数据
      }
    });

    return {
      content: fullContent,
      reasoningContent: fullReasoningContent || undefined,
      usage,
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

  // 验证响应格式
  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error(`OpenAI API 响应格式异常: ${JSON.stringify(data)}`);
  }

  const message = choice.message;
  
  // 如果有拒绝消息，优先返回拒绝消息
  if (message?.refusal) {
    return {
      content: "",
      refusal: message.refusal,
      finishReason: choice.finish_reason,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  return {
    content: message?.content || "",
    reasoningContent: message?.reasoning_content || undefined,
    refusal: message?.refusal || null,
    finishReason: choice.finish_reason,
    toolCalls: message?.tool_calls,
    logprobs: choice.logprobs,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
};