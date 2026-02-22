import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { parseSSEStream } from "@utils/sse-parser";
import {
  extractCommonParameters,
  applyCustomParameters,
  cleanPayload,
} from "@/llm-apis/request-builder";
import { asyncJsonStringify } from "@/utils/serialization";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  claudeUrlHandler,
  convertToClaudeMessages,
  convertTools,
  convertToolChoice,
  ClaudeRequest,
} from "./utils";

const logger = createModuleLogger("anthropic-chat");
const errorHandler = createModuleErrorHandler("anthropic-chat");

/**
 * 解析 SSE 流
 */
const parseClaudeSSE = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<{
  fullContent: string;
  usage?: LlmResponse["usage"];
  stopReason?: string;
  stopSequence?: string | null;
  toolCalls?: LlmResponse["toolCalls"];
}> => {
  let fullContent = "";
  let usage: LlmResponse["usage"] | undefined;
  let stopReason: string | undefined;
  let stopSequence: string | null | undefined;
  const toolCalls: LlmResponse["toolCalls"] = [];
  let currentToolCall: { id: string; name: string; input: string } | null = null;

  await parseSSEStream(
    reader,
    (data: string) => {
      try {
        const event: any = JSON.parse(data);
        switch (event.type) {
          case "message_start":
            logger.debug("Claude 流开始", { messageId: event.message?.id });
            break;
          case "content_block_start":
            if (event.content_block?.type === "tool_use") {
              currentToolCall = { id: event.content_block.id!, name: event.content_block.name!, input: "" };
              logger.debug("工具调用块开始", { toolName: currentToolCall.name });
            }
            break;
          case "content_block_delta":
            if (event.delta?.type === "text_delta" && event.delta.text) {
              fullContent += event.delta.text;
              onChunk(event.delta.text);
            } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json && currentToolCall) {
              currentToolCall.input += event.delta.partial_json;
            }
            break;
          case "content_block_stop":
            if (currentToolCall) {
              toolCalls.push({
                id: currentToolCall.id,
                type: "function",
                function: { name: currentToolCall.name, arguments: currentToolCall.input },
              });
              logger.debug("工具调用块结束", { toolName: currentToolCall.name });
              currentToolCall = null;
            }
            break;
          case "message_delta":
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
            if (event.delta?.stop_sequence !== undefined) stopSequence = event.delta.stop_sequence;
            if (event.usage) {
              usage = {
                promptTokens: event.usage.input_tokens,
                completionTokens: event.usage.output_tokens,
                totalTokens: event.usage.input_tokens + event.usage.output_tokens,
              };
            }
            break;
          case "message_stop":
            logger.debug("Claude 流结束");
            break;
          case "error": {
            const err = new Error(event.error?.message || "未知流错误");
            errorHandler.error(err, "Claude 流错误", { context: { errorType: event.error?.type } });
            throw err;
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("流错误")) throw e;
        logger.warn("解析流数据失败", { data, error: e });
      }
    },
    undefined,
    signal
  );

  return { fullContent, usage, stopReason, stopSequence, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
};

/**
 * 调用 Anthropic Claude API
 */
export const callClaudeChatApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = claudeUrlHandler.buildUrl(profile.baseUrl, "messages");
  const systemMessages = (options.messages || []).filter(m => m.role === 'system');
  const userAssistantMessages = (options.messages || []).filter(m => m.role !== 'system');
  const messages = convertToClaudeMessages(userAssistantMessages);
  const commonParams = extractCommonParameters(options);

  const body: ClaudeRequest = {
    model: options.modelId,
    messages,
    max_tokens: commonParams.maxTokens || 4096,
  };

  if (commonParams.temperature !== undefined) body.temperature = commonParams.temperature;
  if (commonParams.topK !== undefined) body.top_k = commonParams.topK;
  if (commonParams.topP !== undefined) body.top_p = commonParams.topP;

  if (systemMessages.length > 0) {
    body.system = systemMessages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n');
  }
  if (options.stopSequences && options.stopSequences.length > 0) body.stop_sequences = options.stopSequences;
  if (options.claudeMetadata) body.metadata = options.claudeMetadata;

  if (options.thinkingEnabled) {
    body.thinking = { type: "enabled", budget_tokens: options.thinkingBudget || 4096 };
    delete body.temperature;
  }

  const tools = convertTools(options.tools);
  if (tools) body.tools = tools;
  const toolChoice = convertToolChoice(options.toolChoice, options.parallelToolCalls);
  if (toolChoice) body.tool_choice = toolChoice;

  applyCustomParameters(body, options);
  cleanPayload(body);

  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  const betas: string[] = [];
  if (options.thinkingEnabled) betas.push("thinking-2025-12-05");
  betas.push("files-api-2025-04-14");
  if (betas.length > 0) headers["anthropic-beta"] = betas.join(",");
  if (profile.customHeaders) Object.assign(headers, profile.customHeaders);

  logger.info("发送 Claude API 请求", {
    model: options.modelId,
    messageCount: messages.length,
    hasTools: !!tools,
    hasThinking: !!options.thinkingEnabled,
    stream: !!options.stream,
  });

  if (options.stream && options.onStream) {
    body.stream = true;
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: await asyncJsonStringify(body),
        hasLocalFile: options.hasLocalFile,
        forceProxy: options.forceProxy,
        relaxIdCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
        isStreaming: true,
      },
      options.timeout,
      options.signal
    );
    await ensureResponseOk(response);
    if (!response.body) throw new Error("响应体为空");
    const reader = response.body.getReader();
    const result = await parseClaudeSSE(reader, options.onStream, options.signal);
    return {
      content: result.fullContent,
      usage: result.usage,
      isStream: true,
      finishReason: result.stopReason as any,
      stopSequence: result.stopSequence,
      toolCalls: result.toolCalls,
    };
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: await asyncJsonStringify(body),
      hasLocalFile: options.hasLocalFile,
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    options.timeout,
    options.signal
  );
  await ensureResponseOk(response);
  const data: any = await response.json();

  let textContent = "";
  const toolCalls: LlmResponse["toolCalls"] = [];
  for (const block of data.content) {
    if (block.type === "text" && block.text) textContent += block.text;
    else if (block.type === "tool_use" && block.id && block.name) {
      toolCalls.push({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input || {}) } });
    }
  }

  logger.info("Claude API 响应成功", {
    contentLength: textContent.length,
    toolCallsCount: toolCalls.length,
    stopReason: data.stop_reason,
    usage: data.usage,
  });

  return {
    content: textContent,
    usage: {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    },
    finishReason: data.stop_reason,
    stopSequence: data.stop_sequence,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
};
