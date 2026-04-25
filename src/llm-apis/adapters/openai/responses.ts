import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { parseSSEStream } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  applyCustomParameters,
  buildBase64DataUrl,
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

  // 姐姐，如果提供了 prompt (MediaGenerationOptions)，我们将其视为 user 消息
  const mediaOpts = options as any;
  if (mediaOpts.prompt && userAssistantMessages.length === 0) {
    messages.push({
      role: "user",
      content: mediaOpts.prompt,
    });
  }

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
            file_data: buildBase64DataUrl(source.file_data, source.media_type),
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
  } else if (options.modelId.includes("image") || mediaOpts.prompt) {
    // 姐姐，针对图像生成任务，如果没传 tools，我们自动补上 image_generation 工具
    // 这样在 openai-responses 渠道下就能正常触发图像生成了
    const imgTool: any = {
      type: "image_generation",
    };

    // 根据文档，Responses API 的 image_generation 工具支持 quality, size 等参数
    // 映射逻辑对齐 OpenAI 规范
    if (mediaOpts.quality) imgTool.quality = mediaOpts.quality;
    if (mediaOpts.size) imgTool.size = mediaOpts.size;
    if (mediaOpts.style) imgTool.style = mediaOpts.style;
    if (mediaOpts.background) imgTool.background = mediaOpts.background;
    if (mediaOpts.moderation) imgTool.moderation = mediaOpts.moderation;

    // 处理响应格式映射
    const respFormat = mediaOpts.responseFormat;
    if (typeof respFormat === "string") {
      imgTool.output_format = respFormat;
    } else if (mediaOpts.outputFormat) {
      imgTool.output_format = mediaOpts.outputFormat;
    }

    if (mediaOpts.outputCompression !== undefined) {
      imgTool.output_compression = mediaOpts.outputCompression;
    }

    // 使用我们新定义的规范化参数
    if (options.partialImages !== undefined) imgTool.partial_images = options.partialImages;
    if (options.inputFidelity !== undefined) imgTool.input_fidelity = options.inputFidelity;

    body.tools = [imgTool];
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

  if (options.modalities) {
    body.modalities = options.modalities;
  }

  if (options.audio) {
    body.audio = options.audio;
  }

  if (options.include) {
    body.include = options.include;
  }

  // 姐姐，支持 store 参数，让用户决定是否在服务器端保留对话状态
  // 优先使用规范化的 responsesStore 参数
  if (options.responsesStore !== undefined) {
    body.store = options.responsesStore;
  } else if (options.store !== undefined) {
    body.store = options.store;
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
    let usage: LlmResponse["usage"] | undefined;
    let refusal: string | null = null;
    let finishReason: LlmResponse["finishReason"] = null;
    const toolCalls: LlmResponse["toolCalls"] = [];
    const annotations: LlmResponse["annotations"] = [];
    const images: NonNullable<LlmResponse["images"]> = [];

    await parseSSEStream(reader, (data) => {
      try {
        if (!data || data === "[DONE]") return;
        const json = JSON.parse(data);

        if (json.type === "response.output_text.delta" && json.delta) {
          const text = json.delta;
          fullContent += text;
          options.onStream!(text);
        } else if (json.type === "response.reasoning_text.delta" && json.delta) {
          // 姐姐，这是推理模型的思维链输出
          fullReasoning += json.delta;
          if (options.onReasoningStream) {
            options.onReasoningStream(json.delta);
          }
        } else if (json.type === "error") {
          // 姐姐，显式抛出 API 返回的错误，不再默默吞掉
          throw new Error(`OpenAI Responses Error: ${json.error?.message || JSON.stringify(json.error)}`);
        }

        // 处理图像生成工具的流式预览 (Partial Image)
        if (json.type === "response.image_generation_call.partial_image" && json.partial_image_b64) {
          // 姐姐，这是 gpt-image-2 的特性，可以将预览图传给前端展示
          const base64 = `data:image/png;base64,${json.partial_image_b64}`;
          if (options.onPartialImage) {
            options.onPartialImage(base64, json.partial_image_index || 0);
          } else if (options.onStream) {
            // 兜底：如果没传专门的回调，我们通过特殊的协议格式传给 onStream
            // 前端 UI 需要识别这种格式
            options.onStream(`__PARTIAL_IMAGE__:${base64}`);
          }
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
              if (item.type === "image_generation_call") {
                // 姐姐，这是 Responses API 返回的图像生成结果
                if (item.result) {
                  images.push({
                    b64_json: item.result,
                    revisedPrompt: item.revised_prompt,
                  });
                }
              } else if (item.type === "function_call") {
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

    const finalResponse: LlmResponse = {
      content: fullContent,
      reasoningContent: fullReasoning || undefined,
      usage,
      refusal,
      finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      annotations: annotations.length > 0 ? annotations : undefined,
      images: images.length > 0 ? images : undefined,
      revisedPrompt: images[0]?.revisedPrompt,
      isStream: true,
    };

    // 如果有生成的图片，且没有正文，加个提示
    if (images.length > 0 && !finalResponse.content) {
      finalResponse.content = `Generated ${images.length} images via Responses API.`;
    }

    return finalResponse;
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
  let reasoningContent = "";
  let refusal: string | null = null;
  let finishReason: LlmResponse["finishReason"] = null;
  const toolCalls: LlmResponse["toolCalls"] = [];
  const annotations: LlmResponse["annotations"] = [];

  const images: any[] = [];
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "image_generation_call") {
        // 姐姐，非流式响应也要解析图片
        if (item.result) {
          images.push({
            b64_json: item.result,
            revisedPrompt: item.revised_prompt,
          });
        }
      } else if (item.type === "message" && item.content) {
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
          } else if (contentItem.type === "reasoning_text") {
            reasoningContent += contentItem.text;
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
    content: content || (images.length > 0 ? `Generated ${images.length} images.` : ""),
    reasoningContent: reasoningContent || undefined,
    refusal,
    finishReason,
    images: images.length > 0 ? images : undefined,
    revisedPrompt: images[0]?.revisedPrompt,
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
