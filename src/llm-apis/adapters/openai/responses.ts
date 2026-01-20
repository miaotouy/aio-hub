import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { parseSSEStream } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  buildBase64DataUrl,
  applyCustomParameters,
} from "@/llm-apis/request-builder";
import { asyncJsonStringify } from "@/utils/serialization";
import { openAiResponsesUrlHandler } from "./utils";

/**
 * 调用 OpenAI Responses API
 */
export const callOpenAiResponsesApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = openAiResponsesUrlHandler.buildUrl(profile.baseUrl, "responses");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (profile.apiKeys && profile.apiKeys.length > 0) {
    headers["Authorization"] = `Bearer ${profile.apiKeys[0]}`;
  }

  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  const systemMessages = (options.messages || []).filter(m => m.role === 'system');
  const userAssistantMessages = (options.messages || []).filter(m => m.role !== 'system');

  const messages: any[] = [];

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

      for (const documentPart of parsed.documentParts) {
        const source = documentPart.source;

        if (source.type === "file_url") {
          contentArray.push({
            type: "input_file",
            file_url: source.file_url,
          });
        } else if (source.type === "file_id") {
          contentArray.push({
            type: "input_file",
            file_id: source.file_id,
          });
        } else if (source.type === "file_data") {
          contentArray.push({
            type: "input_file",
            filename: source.filename || "document.pdf",
            file_data: source.file_data,
          });
        } else if (source.type === "base64") {
          contentArray.push({
            type: "input_file",
            filename: (source as any).filename || "document.pdf",
            file_data: buildBase64DataUrl(source.data, source.media_type),
          });
        }
      }

      messages.push({
        role: msg.role,
        content: contentArray,
      });
    }
  }

  const input =
    messages.length === 1 &&
      typeof messages[0].content === "string"
      ? messages[0].content
      : messages;

  const commonParams = extractCommonParameters(options);

  const body: any = {
    model: options.modelId,
    input,
    temperature: commonParams.temperature ?? 1.0,
  };

  if (commonParams.maxTokens !== undefined) {
    body.max_output_tokens = commonParams.maxTokens;
  }

  if (systemMessages.length > 0) {
    const systemContent = systemMessages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join('\n\n');
    body.instructions = systemContent;
  }

  if (commonParams.topP !== undefined) {
    body.top_p = commonParams.topP;
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

  if (options.responseFormat !== undefined) {
    body.text = {
      format: options.responseFormat,
    };
  }

  const reasoning: any = {};
  if (options.reasoningEffort) {
    reasoning.effort = options.reasoningEffort;
  }

  if (Object.keys(reasoning).length > 0) {
    body.reasoning = reasoning;
  }

  if (options.thinkingEnabled) {
    body.thinking = {
      type: "enabled",
    };
    if (options.thinkingBudget) {
      body.thinking.budget_tokens = options.thinkingBudget;
    }
  }

  if (commonParams.stop !== undefined) {
    body.truncation = commonParams.stop === "auto" ? "auto" : "disabled";
  }

  applyCustomParameters(body, options);

  if (options.stream && options.onStream) {
    body.stream = true;

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: await asyncJsonStringify(body),
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
    let refusal: string | null = null;
    let finishReason: LlmResponse["finishReason"] = null;
    const toolCalls: LlmResponse["toolCalls"] = [];
    const annotations: LlmResponse["annotations"] = [];

    await parseSSEStream(reader, (data) => {
      try {
        const json = JSON.parse(data);

        if (json.type === "response.output_text.delta" && json.delta) {
          const text = json.delta;
          fullContent += text;
          options.onStream!(text);
        }

        if (json.type === "response.completed" && json.response) {
          const resp = json.response;
          if (resp.usage) {
            usage = {
              promptTokens: resp.usage.input_tokens,
              completionTokens: resp.usage.output_tokens,
              totalTokens: resp.usage.total_tokens,
            };
          }

          if (resp.status === "completed") {
            finishReason = "stop";
          } else if (resp.status === "incomplete") {
            finishReason = "length";
          }

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

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: await asyncJsonStringify(body),
    },
    options.timeout,
    options.signal
  );

  await ensureResponseOk(response);

  const data = await response.json();

  let content = "";
  let refusal: string | null = null;
  let finishReason: LlmResponse["finishReason"] = null;
  const toolCalls: LlmResponse["toolCalls"] = [];
  const annotations: LlmResponse["annotations"] = [];

  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === "output_text") {
            content += contentItem.text;

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
    }
  }

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
