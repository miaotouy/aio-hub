import type { LlmResponse } from "@/llm-apis/common";

export interface EmptyResponseDiagnosticInput {
  response: Partial<LlmResponse>;
  visibleText: string;
  attachmentCount?: number;
}

// 已知不是消息内容的元数据字段名
const EXCLUDED_KEYS = new Set([
  "id",
  "object",
  "model",
  "modelId",
  "provider",
  "providerType",
  "finishReason",
  "stopSequence",
  "systemFingerprint",
  "serviceTier",
  "status",
  "type",
  "mimeType",
  "media_type",
  "file_uri",
  "url",
  "b64_json",
  "imageBase64",
  "role",
  "name",
  "toolUseId",
  "toolName",
  "toolResultId",
  "voice",
  "format",
  "expiresAt",
  "revisedPrompt",
  "seed",
  "index",
]);

interface FoundField {
  path: string;
  value: string;
}

/**
 * 递归扫描 response 对象，寻找所有非空的、未展示的 string 字段
 */
export function scanForHiddenText(
  obj: any,
  visibleText: string,
  path = "",
  visited = new Set<any>()
): FoundField[] {
  if (obj === null || typeof obj !== "object") return [];
  if (visited.has(obj)) return [];
  visited.add(obj);

  const found: FoundField[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof value === "string") {
      const trimmed = value.trim();
      // 过滤掉空字符串、已知的元数据 key、以及已经包含在可见文本中的内容
      if (
        trimmed.length > 0 &&
        !EXCLUDED_KEYS.has(key) &&
        !visibleText.includes(trimmed)
      ) {
        // 进一步过滤掉一些极短的、看起来不像内容的元数据（比如 "stop", "assistant" 等）
        // 如果长度小于 10，且不包含中文/空格/换行，可能只是某种枚举或 ID，排除掉
        const isLikelyContent =
          trimmed.length >= 10 ||
          /[\u4e00-\u9fa5\s\n,，.。!！?？]/.test(trimmed);

        if (isLikelyContent) {
          found.push({ path: currentPath, value: trimmed });
        }
      }
    } else if (typeof value === "object" && value !== null) {
      found.push(
        ...scanForHiddenText(value, visibleText, currentPath, visited)
      );
    }
  }

  return found;
}

/**
 * Builds a user-facing diagnostic for successful API responses that contain no
 * visible chat text. The message is stored as metadata instead of node.content
 * so it will not pollute later LLM context.
 */
export function buildEmptyResponseDiagnostic({
  response,
  visibleText,
  attachmentCount = 0,
}: EmptyResponseDiagnosticInput): string | undefined {
  if (visibleText.trim()) return undefined;

  const hasGeneratedMedia =
    attachmentCount > 0 ||
    (response.images?.length ?? 0) > 0 ||
    (response.videos?.length ?? 0) > 0 ||
    (response.audios?.length ?? 0) > 0 ||
    !!response.audio ||
    !!response.audioData;

  if (hasGeneratedMedia) return undefined;

  const toolCallCount = response.toolCalls?.length ?? 0;
  const completionTokens = response.usage?.completionTokens;
  const finishReason = response.finishReason;
  const isStream = response.isStream === true;

  const details: string[] = [];

  // 启发式扫描未展示的文本内容
  const hiddenFields = scanForHiddenText(response, visibleText);
  if (hiddenFields.length > 0) {
    for (const field of hiddenFields) {
      const len = field.value.length;
      const preview =
        field.value.length > 30
          ? `${field.value.slice(0, 30)}...`
          : field.value;

      if (
        field.path.endsWith("thought") ||
        field.path.endsWith("reasoningContent")
      ) {
        details.push(
          `检测到约 ${len} 字的未展示思考/推理内容（位于字段 \`${field.path}\`），预览: "${preview}"。模型可能把本次输出放在当前未展示的 thought/reasoning 字段中。`
        );
      } else {
        details.push(
          `检测到约 ${len} 字的未展示文本内容（位于字段 \`${field.path}\`），预览: "${preview}"。这可能是返回在当前适配器尚未支持的字段中。`
        );
      }
    }
  }

  if (toolCallCount > 0) {
    details.push(
      `检测到 ${toolCallCount} 个原生工具调用字段，但没有正文；当前聊天正文只会直接显示文本内容。`
    );
  }

  if (response.refusal) {
    details.push(`模型返回了拒绝字段: ${response.refusal}`);
  }

  if (finishReason === "content_filter") {
    details.push("停止原因是内容过滤，正文可能被上游过滤为空。");
  } else if (finishReason === "max_tokens" || finishReason === "length") {
    details.push(
      "停止原因是输出长度限制，模型可能在生成正文前耗尽了输出预算。"
    );
  } else if (
    finishReason === "tool_calls" ||
    finishReason === "function_call"
  ) {
    details.push(
      "停止原因是工具调用，模型本轮可能只返回了工具调用而没有自然语言正文。"
    );
  } else if (finishReason) {
    details.push(`停止原因: ${finishReason}。`);
  }

  if (completionTokens && completionTokens > 0) {
    details.push(
      `API 报告输出 ${completionTokens} tokens，但未解析到正文；可能是返回在当前适配器尚未支持的字段中。`
    );
  }

  if (isStream) {
    details.push(
      "这是流式响应，流已结束但正文为空；如果上游确实有文本，请检查流式 delta 字段格式是否被当前解析器支持。"
    );
  } else {
    details.push(
      "这是非流式响应，接口返回成功但 message/content 正文字段为空。"
    );
  }

  const uniqueDetails = Array.from(new Set(details));
  return `空回复诊断：${uniqueDetails.join(" ")}`;
}

