import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse, LlmMessageContent } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  buildBase64DataUrl,
} from "./request-builder";

/**
 * 调用 OpenAI Responses API
 */
export const callOpenAiResponsesApi = async (
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

  // 应用自定义请求头
  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  // 从 messages 中提取 system 消息
  const systemMessages = options.messages.filter(m => m.role === 'system');
  const userAssistantMessages = options.messages.filter(m => m.role !== 'system') as Array<{
    role: 'user' | 'assistant';
    content: string | LlmMessageContent[];
  }>;

  // 构建输入内容 - Responses API 使用多轮对话格式
  const messages: any[] = [];

  // 转换 user 和 assistant 消息
  for (const msg of userAssistantMessages) {
    if (typeof msg.content === "string") {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    } else {
      const parsed = parseMessageContents(msg.content);
      const contentArray: any[] = [];

      for (const textPart of parsed.textParts) {
        contentArray.push({ type: "input_text", text: textPart.text });
      }

      for (const imagePart of parsed.imageParts) {
        contentArray.push({
          type: "input_image",
          image_url: buildBase64DataUrl(imagePart.base64, imagePart.mimeType),
        });
      }

      messages.push({
        role: msg.role,
        content: contentArray,
      });
    }
  }

  // 如果只有一条消息且是纯文本，可以使用简化格式
  const input =
    messages.length === 1 &&
    typeof messages[0].content === "string"
      ? messages[0].content
      : messages;

  // 使用共享函数提取通用参数
  const commonParams = extractCommonParameters(options);

  const body: any = {
    model: options.modelId,
    input,
    max_output_tokens: commonParams.maxTokens || 4000,
    temperature: commonParams.temperature ?? 1.0,
  };

  // 添加系统指令 - 从 messages 中提取的 system 消息
  if (systemMessages.length > 0) {
    // 合并所有 system 消息的内容
    const systemContent = systemMessages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join('\n\n');
    body.instructions = systemContent;
  }

  // 添加通用参数
  if (commonParams.topP !== undefined) {
    body.top_p = commonParams.topP;
  }

  // 工具相关参数
  if (options.tools !== undefined) {
    body.tools = options.tools;
  }
  if (options.toolChoice !== undefined) {
    body.tool_choice = options.toolChoice;
  }
  if (options.parallelToolCalls !== undefined) {
    body.parallel_tool_calls = options.parallelToolCalls;
  }

  // 响应格式配置
  if (options.responseFormat !== undefined) {
    body.text = {
      format: options.responseFormat,
    };
  }

  // 推理配置（o系列模型）
  if (options.seed !== undefined) {
    // Responses API 中 reasoning effort 通过独立参数传递
    body.reasoning = body.reasoning || {};
    if (typeof options.seed === "string") {
      body.reasoning.effort = options.seed; // 复用 seed 字段传递 effort
    }
  }

  // 其他高级参数
  if (commonParams.stop !== undefined) {
    body.truncation = commonParams.stop === "auto" ? "auto" : "disabled";
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
    let usage: LlmResponse["usage"] | undefined;
    let refusal: string | null = null;
    let finishReason: LlmResponse["finishReason"] = null;
    const toolCalls: LlmResponse["toolCalls"] = [];
    const annotations: LlmResponse["annotations"] = [];

    await parseSSEStream(reader, (data) => {
      try {
        const json = JSON.parse(data);

        // 提取文本内容（从 delta 事件）
        if (json.type === "response.output_text.delta" && json.delta) {
          const text = json.delta;
          fullContent += text;
          options.onStream!(text);
        }

        // 从完成事件中提取 usage 信息
        if (json.type === "response.completed" && json.response) {
          const resp = json.response;
          if (resp.usage) {
            usage = {
              promptTokens: resp.usage.input_tokens,
              completionTokens: resp.usage.output_tokens,
              totalTokens: resp.usage.total_tokens,
            };
          }

          // 提取状态信息
          if (resp.status === "completed") {
            finishReason = "stop";
          } else if (resp.status === "incomplete") {
            finishReason = "length";
          }

          // 检查输出中的工具调用和 annotations
          if (resp.output && Array.isArray(resp.output)) {
            for (const item of resp.output) {
              if (item.type === "function_call") {
                toolCalls.push({
                  id: item.call_id || item.id,
                  type: "function",
                  function: {
                    name: item.name,
                    arguments: item.arguments,
                  },
                });
                finishReason = "tool_calls";
              }
              // 提取 message 中的 annotations
              else if (item.type === "message" && item.content) {
                for (const contentItem of item.content) {
                  if (contentItem.type === "output_text" && contentItem.annotations) {
                    for (const annotation of contentItem.annotations) {
                      if (annotation.type === "url_citation") {
                        annotations.push({
                          type: "url_citation",
                          urlCitation: {
                            startIndex: annotation.start_index,
                            endIndex: annotation.end_index,
                            url: annotation.url,
                            title: annotation.title,
                          },
                        });
                      } else if (annotation.type === "file_citation") {
                        annotations.push({
                          type: "file_citation",
                          fileCitation: {
                            startIndex: annotation.start_index,
                            endIndex: annotation.end_index,
                            fileId: annotation.file_id,
                            quote: annotation.quote,
                          },
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // 忽略解析错误，可能是非 JSON 数据
      }
    }, undefined, options.signal);

    return {
      content: fullContent,
      usage,
      refusal,
      finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      annotations: annotations.length > 0 ? annotations : undefined,
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

  // Responses API 的响应格式：output 是一个数组，可能包含多种类型
  let content = "";
  let refusal: string | null = null;
  let finishReason: LlmResponse["finishReason"] = null;
  const toolCalls: LlmResponse["toolCalls"] = [];
  const annotations: LlmResponse["annotations"] = [];

  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      // 处理消息类型输出
      if (item.type === "message" && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === "output_text") {
            content += contentItem.text;

            // 提取 annotations
            if (contentItem.annotations && Array.isArray(contentItem.annotations)) {
              for (const annotation of contentItem.annotations) {
                if (annotation.type === "url_citation") {
                  annotations.push({
                    type: "url_citation",
                    urlCitation: {
                      startIndex: annotation.start_index,
                      endIndex: annotation.end_index,
                      url: annotation.url,
                      title: annotation.title,
                    },
                  });
                } else if (annotation.type === "file_citation") {
                  annotations.push({
                    type: "file_citation",
                    fileCitation: {
                      startIndex: annotation.start_index,
                      endIndex: annotation.end_index,
                      fileId: annotation.file_id,
                      quote: annotation.quote,
                    },
                  });
                }
              }
            }
          } else if (contentItem.type === "refusal") {
            refusal = contentItem.refusal;
          }
        }
      }
      // 处理函数调用
      else if (item.type === "function_call") {
        toolCalls.push({
          id: item.call_id || item.id,
          type: "function",
          function: {
            name: item.name,
            arguments: item.arguments,
          },
        });
        finishReason = "tool_calls";
      }
      // 其他工具调用类型（web_search_call、file_search_call 等）
      // 这些类型在 Responses API 中不直接映射到标准响应，但可以记录状态
    }
  }

  // 根据响应状态判断 finish_reason
  if (!finishReason) {
    if (data.status === "completed") {
      finishReason = "stop";
    } else if (data.status === "incomplete") {
      finishReason = "length";
    }
  }

  return {
    content,
    refusal,
    finishReason,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    annotations: annotations.length > 0 ? annotations : undefined,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
};
