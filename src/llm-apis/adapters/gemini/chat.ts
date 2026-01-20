import type { LlmProfile } from "../../../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "../../common";
import { fetchWithTimeout, ensureResponseOk } from "../../common";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";
import {
  applyCustomParameters,
  cleanPayload,
} from "../../request-builder";
import { asyncJsonStringify } from "@/utils/serialization";
import {
  geminiUrlHandler,
  buildGeminiContents,
  buildGeminiGenerationConfig,
  buildGeminiTools,
  buildGeminiToolConfig,
  buildGeminiSafetySettings,
  GeminiRequest,
} from "./utils";

/**
 * 映射 Gemini finishReason 到通用格式
 */
function mapGeminiFinishReason(reason: string | undefined): LlmResponse["finishReason"] {
  if (!reason) return null;
  const reasonMap: Record<string, LlmResponse["finishReason"]> = {
    STOP: "stop",
    MAX_TOKENS: "max_tokens",
    SAFETY: "content_filter",
    RECITATION: "content_filter",
    LANGUAGE: "content_filter",
    OTHER: "stop",
    BLOCKLIST: "content_filter",
    PROHIBITED_CONTENT: "content_filter",
    SPII: "content_filter",
    MALFORMED_FUNCTION_CALL: "stop",
    IMAGE_SAFETY: "content_filter",
  };
  return reasonMap[reason] || "stop";
}

/**
 * 解析 Gemini Logprobs 结果
 */
function parseGeminiLogprobs(logprobsResult: any): LlmResponse["logprobs"] {
  if (!logprobsResult?.topCandidates) return undefined;
  const content = logprobsResult.topCandidates
    .map((topCandidate: any) => {
      if (!topCandidate.candidates?.[0]) return null;
      const candidate = topCandidate.candidates[0];
      return {
        token: candidate.token || "",
        logprob: candidate.logProbability || 0,
        bytes: null,
        topLogprobs: topCandidate.candidates.slice(0, 5).map((c: any) => ({
          token: c.token || "",
          logprob: c.logProbability || 0,
          bytes: null,
        })),
      };
    })
    .filter(Boolean);
  return content.length > 0 ? { content } : undefined;
}

/**
 * 解析 Gemini API 响应
 */
function parseGeminiResponse(data: any): LlmResponse {
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error(`Gemini API 响应格式异常: 没有候选回答`);

  let content = "";
  let toolCalls: LlmResponse["toolCalls"] = undefined;
  let thoughtsContent = "";

  if (candidate.content?.parts) {
    for (const part of candidate.content.parts) {
      if (!part.text && !part.functionCall && !part.executableCode && !part.codeExecutionResult) continue;
      if (part.thought && part.text) {
        thoughtsContent += part.text;
        continue;
      }
      if (part.text) content += part.text;
      else if (part.functionCall) {
        if (!toolCalls) toolCalls = [];
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      } else if (part.executableCode) {
        content += `\n\`\`\`${part.executableCode.language.toLowerCase()}\n${part.executableCode.code}\n\`\`\`\n`;
      } else if (part.codeExecutionResult) {
        const outcomeText = part.codeExecutionResult.outcome === "OUTCOME_OK" ? "成功" : "失败";
        content += `\n**代码执行结果 (${outcomeText}):**\n\`\`\n${part.codeExecutionResult.output}\n\`\`\`\n`;
      }
    }
  }

  if (!content && !toolCalls) {
    if (data.promptFeedback?.blockReason) throw new Error(`请求被屏蔽: ${data.promptFeedback.blockReason}`);
    throw new Error(`Gemini API 响应格式异常: ${JSON.stringify(data)}`);
  }

  const result: LlmResponse = {
    content,
    finishReason: mapGeminiFinishReason(candidate.finishReason),
  };

  if (data.usageMetadata) {
    result.usage = {
      promptTokens: data.usageMetadata.promptTokenCount || 0,
      completionTokens: data.usageMetadata.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata.totalTokenCount || 0,
    };
  }

  if (toolCalls) result.toolCalls = toolCalls;
  if (thoughtsContent) result.reasoningContent = thoughtsContent;
  if (candidate.logprobsResult) result.logprobs = parseGeminiLogprobs(candidate.logprobsResult);

  return result;
}

/**
 * 调用 Google Gemini API
 */
export const callGeminiChatApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";
  const endpoint = options.stream && options.onStream ? `models/${options.modelId}:streamGenerateContent` : `models/${options.modelId}:generateContent`;
  const baseUrl = geminiUrlHandler.buildUrl(profile.baseUrl, endpoint);
  const url = `${baseUrl}?key=${apiKey}${options.stream ? "&alt=sse" : ""}`;

  const body: GeminiRequest = {
    contents: buildGeminiContents(options.messages || []),
    generationConfig: buildGeminiGenerationConfig(options),
  };

  const systemMessages = (options.messages || []).filter(m => m.role === 'system');
  if (systemMessages.length > 0) {
    const systemContent = systemMessages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n');
    body.systemInstruction = { parts: [{ text: systemContent }] };
  }

  const tools = buildGeminiTools(options);
  if (tools) body.tools = tools;
  const toolConfig = buildGeminiToolConfig(options);
  if (toolConfig) body.toolConfig = toolConfig;
  const safetySettings = buildGeminiSafetySettings(options);
  if (safetySettings) body.safetySettings = safetySettings;

  applyCustomParameters(body, options);
  cleanPayload(body);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (profile.customHeaders) Object.assign(headers, profile.customHeaders);

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
    if (!response.body) throw new Error("响应体为空");

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
        if (json.candidates?.[0]?.finishReason) finishReason = mapGeminiFinishReason(json.candidates[0].finishReason);
        const parts = json.candidates?.[0]?.content?.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              if (part.thought) {
                reasoningContent += part.text;
                if (options.onReasoningStream) options.onReasoningStream(part.text);
              } else {
                fullContent += part.text;
                options.onStream!(part.text);
              }
            } else if (part.functionCall) {
              toolCalls = [{
                id: `call_${Date.now()}`,
                type: "function",
                function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) },
              }];
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

    const result: LlmResponse = { content: fullContent, usage, finishReason, toolCalls, isStream: true };
    if (reasoningContent) result.reasoningContent = reasoningContent;
    return result;
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
  return parseGeminiResponse(data);
};
