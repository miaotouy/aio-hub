import type { ProbeValidationInput, ProbeValidationResult } from "./types";

const PREVIEW_LENGTH = 160;

export function validateProbeResponse(
  input: ProbeValidationInput
): ProbeValidationResult {
  switch (input.capability) {
    case "chat":
      return validateChat(input);
    case "embedding":
      return validateEmbedding(input);
    case "rerank":
      return validateRerank(input);
    case "image":
      return validateImage(input);
    case "audio":
      return validateAudio(input);
    case "video":
    case "music":
      return { valid: false, errorMessage: "该能力不支持自动检查" };
  }
}

function validateChat(input: ProbeValidationInput): ProbeValidationResult {
  if (input.stream && !input.streamDeltaReceived) {
    return { valid: false, errorMessage: "流式响应未产生有效增量" };
  }

  const content = input.response?.content?.trim() ?? "";
  const hasOutput =
    content.length > 0 ||
    (input.response?.toolCalls?.length ?? 0) > 0 ||
    (input.response?.images?.length ?? 0) > 0 ||
    (input.response?.audios?.length ?? 0) > 0;
  return hasOutput
    ? { valid: true, preview: truncate(content || "已返回结构化输出") }
    : { valid: false, errorMessage: "响应已完成，但没有有效输出" };
}

function validateEmbedding(input: ProbeValidationInput): ProbeValidationResult {
  const vectors = input.embedding?.data ?? [];
  const valid = vectors.some(
    (item) =>
      Array.isArray(item.embedding) &&
      item.embedding.length > 0 &&
      item.embedding.every(Number.isFinite)
  );
  return valid
    ? {
        valid: true,
        preview: `向量维度 ${vectors[0]?.embedding?.length ?? 0}`,
      }
    : { valid: false, errorMessage: "响应中没有合法的有限数值向量" };
}

function validateRerank(input: ProbeValidationInput): ProbeValidationResult {
  const results = input.rerank?.results ?? [];
  const documentCount = input.rerankDocumentCount ?? 0;
  const valid =
    results.length > 0 &&
    results.every(
      (item) =>
        Number.isInteger(item.index) &&
        (item.index ?? -1) >= 0 &&
        (item.index ?? documentCount) < documentCount
    );
  return valid
    ? { valid: true, preview: `返回 ${results.length} 条排序结果` }
    : { valid: false, errorMessage: "重排结果为空或包含越界索引" };
}

function validateImage(input: ProbeValidationInput): ProbeValidationResult {
  const valid = (input.response?.images ?? []).some(
    (item) => Boolean(item.url) || hasData(item.b64_json)
  );
  return valid
    ? { valid: true, preview: "已返回图片资产" }
    : { valid: false, errorMessage: "响应中没有可用的图片资产" };
}

function validateAudio(input: ProbeValidationInput): ProbeValidationResult {
  const valid =
    hasData(input.response?.audio?.data) ||
    hasData(input.response?.audioData) ||
    (input.response?.audios ?? []).some(
      (item) => Boolean(item.url) || hasData(item.b64_json)
    );
  return valid
    ? { valid: true, preview: "已返回音频资产" }
    : { valid: false, errorMessage: "响应中没有可用的音频资产" };
}

function hasData(value: string | ArrayBuffer | undefined): boolean {
  return typeof value === "string"
    ? value.length > 0
    : value instanceof ArrayBuffer && value.byteLength > 0;
}

function truncate(value: string): string {
  return value.length > PREVIEW_LENGTH
    ? `${value.slice(0, PREVIEW_LENGTH)}...`
    : value;
}
