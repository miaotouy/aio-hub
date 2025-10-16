import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse, LlmMessageContent } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { createModuleLogger } from "@utils/logger";
import { parseSSEStream } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractToolDefinitions,
  parseToolChoice,
  extractCommonParameters,
} from "./request-builder";

const logger = createModuleLogger("ClaudeApi");

/**
 * Claude API 消息内容块类型
 */
interface ClaudeContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result" | "document";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
  // 工具使用
  id?: string;
  name?: string;
  input?: Record<string, any>;
  // 工具结果
  tool_use_id?: string;
  content?: string | ClaudeContentBlock[];
  is_error?: boolean;
  // 缓存控制
  cache_control?: {
    type: "ephemeral";
  };
}

/**
 * Claude API 消息格式
 */
interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

/**
 * Claude API 工具定义
 */
interface ClaudeTool {
  type?: "custom" | "computer_20241022" | "bash_20241022" | "text_editor_20241022";
  name: string;
  description?: string;
  input_schema?: Record<string, any>;
  // 计算机工具特有参数
  display_width_px?: number;
  display_height_px?: number;
  display_number?: number;
  // 缓存控制
  cache_control?: {
    type: "ephemeral";
  };
}

/**
 * Claude API 工具选择策略
 */
type ClaudeToolChoice =
  | { type: "auto"; disable_parallel_tool_use?: boolean }
  | { type: "any"; disable_parallel_tool_use?: boolean }
  | { type: "tool"; name: string; disable_parallel_tool_use?: boolean };

/**
 * Claude API 请求体
 */
interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  system?: string;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: {
    user_id?: string;
  };
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
  tools?: ClaudeTool[];
  tool_choice?: ClaudeToolChoice;
}

/**
 * Claude API 响应格式
 */
interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * Claude 流式事件类型
 */
interface ClaudeStreamEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop"
    | "ping"
    | "error";
  message?: Partial<ClaudeResponse>;
  index?: number;
  content_block?: Partial<ClaudeContentBlock>;
  delta?: {
    type: "text_delta" | "input_json_delta";
    text?: string;
    partial_json?: string;
    stop_reason?: string;
    stop_sequence?: string | null;
  };
  usage?: ClaudeResponse["usage"];
  error?: {
    type: string;
    message: string;
  };
}

/**
 * 将内部消息格式转换为 Claude API 格式
 */
const convertToClaudeMessages = (
  messages: LlmMessageContent[],
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string | LlmMessageContent[] }>
): ClaudeMessage[] => {
  const claudeMessages: ClaudeMessage[] = [];

  // 首先添加对话历史
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      if (typeof msg.content === "string") {
        claudeMessages.push({
          role: msg.role,
          content: msg.content,
        });
      } else {
        claudeMessages.push({
          role: msg.role,
          content: convertContentBlocks(msg.content),
        });
      }
    }
  }

  // 然后添加当前消息
  if (messages.length > 0) {
    const contentBlocks = convertContentBlocks(messages);

    // 如果最后一条历史消息是 user，且当前也是 user，则合并
    if (claudeMessages.length > 0 && claudeMessages[claudeMessages.length - 1].role === "user") {
      const lastMessage = claudeMessages[claudeMessages.length - 1];
      if (typeof lastMessage.content === "string") {
        lastMessage.content = [{ type: "text", text: lastMessage.content }, ...contentBlocks];
      } else {
        lastMessage.content = [...lastMessage.content, ...contentBlocks];
      }
    } else {
      claudeMessages.push({
        role: "user",
        content: contentBlocks,
      });
    }
  }

  return claudeMessages;
};

/**
 * 转换内容块
 * 使用共享的 parseMessageContents 辅助函数，然后转换为 Claude 特定格式
 */
const convertContentBlocks = (messages: LlmMessageContent[]): ClaudeContentBlock[] => {
  const parsed = parseMessageContents(messages);
  const blocks: ClaudeContentBlock[] = [];

  // 转换文本部分
  for (const textPart of parsed.textParts) {
    blocks.push({
      type: "text",
      text: textPart.text,
      cache_control: textPart.cacheControl,
    });
  }

  // 转换图片部分
  for (const imagePart of parsed.imageParts) {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: imagePart.mimeType || "image/png",
        data: imagePart.base64,
      },
      cache_control: imagePart.cacheControl,
    });
  }

  // 转换工具使用部分
  for (const toolUse of parsed.toolUseParts) {
    blocks.push({
      type: "tool_use",
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    });
  }

  // 转换工具结果部分
  for (const toolResult of parsed.toolResultParts) {
    const toolResultBlock: ClaudeContentBlock = {
      type: "tool_result",
      tool_use_id: toolResult.id,
      is_error: toolResult.isError,
    };

    if (typeof toolResult.content === "string") {
      toolResultBlock.content = toolResult.content;
    } else if (Array.isArray(toolResult.content)) {
      toolResultBlock.content = convertContentBlocks(toolResult.content);
    }

    blocks.push(toolResultBlock);
  }

  // 转换文档部分
  for (const doc of parsed.documentParts) {
    blocks.push({
      type: "document",
      source: doc.source as any,
    });
  }

  return blocks;
};

/**
 * 转换工具定义
 * 使用共享的 extractToolDefinitions 辅助函数
 */
const convertTools = (tools?: LlmRequestOptions["tools"]): ClaudeTool[] | undefined => {
  const commonTools = extractToolDefinitions(tools);
  if (!commonTools) return undefined;

  return commonTools.map((tool) => ({
    type: "custom" as const,
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
};

/**
 * 转换工具选择策略
 * 使用共享的 parseToolChoice 辅助函数
 */
const convertToolChoice = (
  toolChoice?: LlmRequestOptions["toolChoice"],
  parallelToolCalls?: boolean
): ClaudeToolChoice | undefined => {
  const parsed = parseToolChoice(toolChoice);
  if (!parsed) return undefined;

  const disableParallel = parallelToolCalls === false;

  if (parsed === "auto") {
    return { type: "auto", disable_parallel_tool_use: disableParallel };
  } else if (parsed === "required") {
    return { type: "any", disable_parallel_tool_use: disableParallel };
  } else if (parsed === "none") {
    return undefined; // Claude 不支持显式的 "none"
  } else if (typeof parsed === "object" && "functionName" in parsed) {
    return {
      type: "tool",
      name: parsed.functionName,
      disable_parallel_tool_use: disableParallel,
    };
  }

  return undefined;
};

/**
 * 解析 SSE 流
 * 使用通用 SSE 解析器，专注于 Claude 特有的业务逻辑
 */
const parseClaudeSSE = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (text: string) => void
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

  // 使用通用 SSE 解析器处理底层字节流
  await parseSSEStream(reader, (data: string) => {
    try {
      const event: ClaudeStreamEvent = JSON.parse(data);

      // Claude 特有的业务逻辑处理
      switch (event.type) {
        case "message_start":
          logger.debug("流开始", { messageId: event.message?.id });
          break;

        case "content_block_start":
          if (event.content_block?.type === "text") {
            logger.debug("文本块开始", { index: event.index });
          } else if (event.content_block?.type === "tool_use") {
            currentToolCall = {
              id: event.content_block.id!,
              name: event.content_block.name!,
              input: "",
            };
            logger.debug("工具调用块开始", {
              index: event.index,
              toolName: currentToolCall.name,
            });
          }
          break;

        case "content_block_delta":
          if (event.delta?.type === "text_delta" && event.delta.text) {
            fullContent += event.delta.text;
            onChunk(event.delta.text);
          } else if (
            event.delta?.type === "input_json_delta" &&
            event.delta.partial_json &&
            currentToolCall
          ) {
            currentToolCall.input += event.delta.partial_json;
          }
          break;

        case "content_block_stop":
          if (currentToolCall) {
            toolCalls.push({
              id: currentToolCall.id,
              type: "function",
              function: {
                name: currentToolCall.name,
                arguments: currentToolCall.input,
              },
            });
            logger.debug("工具调用块结束", {
              toolId: currentToolCall.id,
              toolName: currentToolCall.name,
            });
            currentToolCall = null;
          }
          break;

        case "message_delta":
          if (event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
          if (event.delta?.stop_sequence !== undefined) {
            stopSequence = event.delta.stop_sequence;
          }
          if (event.usage) {
            usage = {
              promptTokens: event.usage.input_tokens,
              completionTokens: event.usage.output_tokens,
              totalTokens: event.usage.input_tokens + event.usage.output_tokens,
            };
          }
          break;

        case "message_stop":
          logger.debug("流结束");
          break;

        case "error":
          logger.error("流错误", new Error(event.error?.message), {
            errorType: event.error?.type,
          });
          throw new Error(`Claude API 错误: ${event.error?.message}`);
      }
    } catch (parseError) {
      logger.warn("解析流数据失败", { data, error: parseError });
    }
  });

  return {
    fullContent,
    usage,
    stopReason,
    stopSequence,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
};

/**
 * 调用 Anthropic Claude API
 */
export const callClaudeApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = buildLlmApiUrl(profile.baseUrl, "claude", "messages");

  // 构建消息
  const messages = convertToClaudeMessages(options.messages, options.conversationHistory);

  // 使用共享函数提取通用参数
  const commonParams = extractCommonParameters(options);

  // 构建请求体
  const body: ClaudeRequest = {
    model: options.modelId,
    messages,
    max_tokens: commonParams.maxTokens || 4096,
  };

  // 添加通用参数
  if (commonParams.temperature !== undefined) {
    body.temperature = commonParams.temperature;
  }
  if (commonParams.topK !== undefined) {
    body.top_k = commonParams.topK;
  }
  if (commonParams.topP !== undefined) {
    body.top_p = commonParams.topP;
  }

  // 添加 Claude 特有参数
  if (options.systemPrompt) {
    body.system = options.systemPrompt;
  }
  if (options.stopSequences && options.stopSequences.length > 0) {
    body.stop_sequences = options.stopSequences;
  }
  if (options.claudeMetadata) {
    body.metadata = options.claudeMetadata;
  }
  if (options.thinking) {
    body.thinking = options.thinking;
  }

  // 工具支持
  const tools = convertTools(options.tools);
  if (tools) {
    body.tools = tools;
  }
  const toolChoice = convertToolChoice(options.toolChoice, options.parallelToolCalls);
  if (toolChoice) {
    body.tool_choice = toolChoice;
  }

  // 获取 API Key
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 构建请求头
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  // 添加 beta 功能头（如果使用了 thinking 或其他 beta 功能）
  if (options.thinking?.type === "enabled") {
    headers["anthropic-beta"] = "thinking-2025-12-05";
  }

  logger.info("发送 Claude API 请求", {
    model: options.modelId,
    messageCount: messages.length,
    hasTools: !!tools,
    hasThinking: !!options.thinking,
    stream: !!options.stream,
  });

  // 流式响应
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
      logger.error("Claude API 请求失败", new Error(errorText), {
        status: response.status,
      });
      throw new Error(`Claude API 请求失败 (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    const result = await parseClaudeSSE(reader, options.onStream);

    return {
      content: result.fullContent,
      usage: result.usage,
      isStream: true,
      finishReason: result.stopReason as any,
      stopSequence: result.stopSequence,
      toolCalls: result.toolCalls,
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
    options.timeout,
    options.signal
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Claude API 请求失败", new Error(errorText), {
      status: response.status,
    });
    throw new Error(`Claude API 请求失败 (${response.status}): ${errorText}`);
  }

  const data: ClaudeResponse = await response.json();

  // 提取文本内容和工具调用
  let textContent = "";
  const toolCalls: LlmResponse["toolCalls"] = [];

  for (const block of data.content) {
    if (block.type === "text" && block.text) {
      textContent += block.text;
    } else if (block.type === "tool_use" && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        },
      });
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
