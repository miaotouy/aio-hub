import type { LlmProfile } from "../../../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse, LlmMessage } from "../../common";
import { fetchWithTimeout, ensureResponseOk } from "../../common";
import { createModuleLogger } from "@utils/logger";
import { parseSSEStream } from "@utils/sse-parser";
import { 
  extractCommonParameters, 
  applyCustomParameters, 
  cleanPayload 
} from "../../request-builder";
import { asyncJsonStringify } from "@/utils/serialization";
import { 
  VertexAiClaudeRequest, 
  buildClaudeMessages 
} from "./utils";

const logger = createModuleLogger("VertexAiAnthropic");

/**
 * 调用 Vertex AI API（Anthropic Publisher - Claude 模型）
 */
export async function callVertexAiClaude(
  profile: LlmProfile,
  options: LlmRequestOptions,
  url: string,
  apiKey: string
): Promise<LlmResponse> {
  const commonParams = extractCommonParameters(options);

  // 从 messages 中提取 system 消息
  const systemMessages = (options.messages || []).filter((m: LlmMessage) => m.role === 'system');

  // 构建请求体
  const body: VertexAiClaudeRequest = {
    anthropic_version: "vertex-2023-10-16",
    messages: buildClaudeMessages(options.messages || []),
    max_tokens: commonParams.maxTokens || 8192,
  };

  // 添加参数
  if (commonParams.temperature !== undefined) {
    body.temperature = commonParams.temperature;
  }
  if (commonParams.topK !== undefined) {
    body.top_k = commonParams.topK;
  }
  if (commonParams.topP !== undefined) {
    body.top_p = commonParams.topP;
  }

  // 系统提示
  if (systemMessages.length > 0) {
    const systemContent = systemMessages
      .map((m: LlmMessage) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join('\n\n');
    body.system = systemContent;
  }

  // 停止序列
  if (options.stopSequences && options.stopSequences.length > 0) {
    body.stop_sequences = options.stopSequences;
  }

  // 应用自定义参数
  applyCustomParameters(body, options);
  cleanPayload(body);

  logger.info("发送 Vertex AI Claude 请求", {
    model: options.modelId,
    messageCount: body.messages.length,
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
    let stopReason: string | undefined;

    await parseSSEStream(reader, (data) => {
      try {
        const event = JSON.parse(data);

        // Claude 流式事件处理
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const text = event.delta.text;
          if (text) {
            fullContent += text;
            options.onStream!(text);
          }
        } else if (event.type === "message_delta") {
          if (event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
          if (event.usage) {
            usage = {
              promptTokens: event.usage.input_tokens || 0,
              completionTokens: event.usage.output_tokens || 0,
              totalTokens: (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
            };
          }
        } else if (event.type === "error") {
          throw new Error(`Vertex AI Claude 错误: ${event.error?.message}`);
        }
      } catch (parseError) {
        logger.warn("解析 Claude 流数据失败", { data, error: parseError });
      }
    }, undefined, options.signal);

    return {
      content: fullContent,
      usage,
      finishReason: stopReason as LlmResponse["finishReason"],
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
    },
    options.timeout,
    options.signal
  );

  await ensureResponseOk(response);
  const data = await response.json();

  let textContent = "";
  if (data.content && Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text" && block.text) {
        textContent += block.text;
      }
    }
  }

  if (!textContent) {
    throw new Error(`Vertex AI Claude 响应格式异常: ${JSON.stringify(data)}`);
  }

  logger.info("Vertex AI Claude 响应成功", {
    contentLength: textContent.length,
    stopReason: data.stop_reason,
  });

  return {
    content: textContent,
    usage: data.usage
      ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      }
      : undefined,
    finishReason: data.stop_reason,
    stopSequence: data.stop_sequence,
  };
}