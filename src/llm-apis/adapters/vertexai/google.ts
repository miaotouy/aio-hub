import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse, LlmMessage } from "@/llm-apis/common";
import type { EmbeddingRequestOptions, EmbeddingResponse } from "@/llm-apis/embedding-types";
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { createModuleLogger } from "@utils/logger";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";
import {
  extractCommonParameters,
  applyCustomParameters,
  cleanPayload
} from "@/llm-apis/request-builder";
import { asyncJsonStringify } from "@/utils/serialization";
import {
  VertexAiGenerationConfig,
  VertexAiGeminiRequest,
  buildVertexAiContents,
  buildVertexAiTools,
  buildVertexAiToolConfig
} from "./utils";

const logger = createModuleLogger("VertexAiGoogle");

/**
 * 映射 Vertex AI finishReason 到通用格式
 */
function mapVertexAiFinishReason(reason: string | undefined): LlmResponse["finishReason"] {
  if (!reason) return null;

  const reasonMap: Record<string, LlmResponse["finishReason"]> = {
    STOP: "stop",
    MAX_TOKENS: "max_tokens",
    SAFETY: "content_filter",
    RECITATION: "content_filter",
    OTHER: "stop",
  };

  return reasonMap[reason] || "stop";
}

/**
 * 调用 Vertex AI API（Google Publisher - Gemini 模型）
 */
export async function callVertexAiGemini(
  profile: LlmProfile,
  options: LlmRequestOptions,
  url: string,
  apiKey: string
): Promise<LlmResponse> {
  const commonParams = extractCommonParameters(options);

  // 从 messages 中提取 system 消息
  const systemMessages = (options.messages || []).filter((m: LlmMessage) => m.role === 'system');

  // 构建 generationConfig
  const generationConfig: VertexAiGenerationConfig = {
    maxOutputTokens: commonParams.maxTokens || 8192,
    temperature: commonParams.temperature ?? 1.0,
    topP: commonParams.topP,
    topK: commonParams.topK,
    stopSequences: commonParams.stop
      ? Array.isArray(commonParams.stop)
        ? commonParams.stop
        : [commonParams.stop]
      : undefined,
  };

  // 添加思考配置
  const extendedOptions = options as any;
  const shouldIncludeThoughts = extendedOptions.includeThoughts === true || extendedOptions.thinkingEnabled === true;
  const hasThinkingBudget = extendedOptions.thinkingBudget !== undefined;
  const hasReasoningEffort = extendedOptions.reasoningEffort !== undefined;

  if (shouldIncludeThoughts || hasThinkingBudget || hasReasoningEffort) {
    const thinkingConfig: any = {};

    if (extendedOptions.includeThoughts === true || extendedOptions.thinkingEnabled === true) {
      thinkingConfig.includeThoughts = true;
    }

    if (extendedOptions.thinkingBudget !== undefined) {
      thinkingConfig.thinkingBudget = extendedOptions.thinkingBudget;
    }

    if (extendedOptions.reasoningEffort) {
      thinkingConfig.thinkingLevel = extendedOptions.reasoningEffort.toLowerCase();
    }

    generationConfig.thinkingConfig = thinkingConfig;
  }

  // 构建请求体
  const body: VertexAiGeminiRequest = {
    contents: buildVertexAiContents(options.messages || []),
    generationConfig,
  };

  // 系统指令
  if (systemMessages.length > 0) {
    const systemContent = systemMessages
      .map((m: LlmMessage) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join('\n\n');
    body.systemInstruction = {
      parts: [{ text: systemContent }],
    };
  }

  // 工具配置
  const tools = buildVertexAiTools(options);
  if (tools) {
    body.tools = tools;
  }

  const toolConfig = buildVertexAiToolConfig(options);
  if (toolConfig) {
    body.toolConfig = toolConfig;
  }

  // 应用自定义参数
  applyCustomParameters(body, options);
  cleanPayload(body);

  logger.info("发送 Vertex AI Gemini 请求", {
    model: options.modelId,
    hasTools: !!tools,
    stream: !!options.stream,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  // 流式响应
  if (options.stream && options.onStream) {
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
    let usage: LlmResponse["usage"] | undefined;
    let finishReason: LlmResponse["finishReason"] = null;
    let toolCalls: LlmResponse["toolCalls"] = undefined;
    let reasoningContent = "";

    await parseSSEStream(reader, (data) => {
      try {
        const json = JSON.parse(data);

        if (json.usageMetadata) {
          usage = {
            promptTokens: json.usageMetadata.promptTokenCount || 0,
            completionTokens: json.usageMetadata.candidatesTokenCount || 0,
            totalTokens: json.usageMetadata.totalTokenCount || 0,
          };
        }

        if (json.candidates?.[0]?.finishReason) {
          finishReason = mapVertexAiFinishReason(json.candidates[0].finishReason);
        }

        const parts = json.candidates?.[0]?.content?.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              if (part.thought) {
                reasoningContent += part.text;
                if (options.onReasoningStream) {
                  options.onReasoningStream(part.text);
                }
              } else {
                fullContent += part.text;
                options.onStream!(part.text);
              }
            } else if (part.functionCall) {
              toolCalls = [
                {
                  id: `call_${Date.now()}`,
                  type: "function",
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {}),
                  },
                },
              ];
            }
          }
        }
      } catch {
        const text = extractTextFromSSE(data, "gemini");
        if (text) {
          fullContent += text;
          options.onStream!(text);
        }
      }
    }, undefined, options.signal);

    const result: LlmResponse = {
      content: fullContent,
      usage,
      finishReason,
      toolCalls,
      isStream: true,
    };

    if (reasoningContent) {
      result.reasoningContent = reasoningContent;
    }

    return result;
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

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error(`Vertex AI 响应格式异常: 没有候选回答`);
  }

  let content = "";
  let toolCalls: LlmResponse["toolCalls"] = undefined;
  let reasoningContent = "";

  if (candidate.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.thought && part.text) {
        reasoningContent += part.text;
        continue;
      }

      if (part.text) {
        content += part.text;
      } else if (part.functionCall) {
        if (!toolCalls) toolCalls = [];
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }
  }

  if (!content && !toolCalls) {
    throw new Error(`Vertex AI 响应格式异常: ${JSON.stringify(data)}`);
  }

  logger.info("Vertex AI Gemini 响应成功", {
    contentLength: content.length,
    toolCallsCount: toolCalls?.length || 0,
    hasReasoningContent: !!reasoningContent,
  });

  const result: LlmResponse = {
    content,
    usage: data.usageMetadata
      ? {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      }
      : undefined,
    finishReason: mapVertexAiFinishReason(candidate.finishReason),
    toolCalls,
  };

  if (reasoningContent) {
    result.reasoningContent = reasoningContent;
  }

  return result;
}

/**
 * 调用 Vertex AI Embedding API
 */
export async function callVertexAiEmbeddingApi(
  profile: LlmProfile,
  options: EmbeddingRequestOptions,
  url: string,
  apiKey: string
): Promise<EmbeddingResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  const taskType = options.taskType || 'RETRIEVAL_QUERY';
  const inputs = Array.isArray(options.input) ? options.input : [options.input];

  const body = {
    instances: inputs.map((text: string) => ({
      content: text,
      task_type: taskType,
      ...(options.title && taskType === 'RETRIEVAL_DOCUMENT' ? { title: options.title } : {})
    }))
  };

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

  return {
    object: "list",
    data: data.predictions.map((pred: any, index: number) => ({
      object: "embedding",
      index,
      embedding: pred.embeddings.values,
    })),
    model: options.modelId,
    usage: {
      promptTokens: 0,
      totalTokens: 0,
    },
  };
}