import type { LlmMessage, LlmReasoningArtifact } from "@/llm-apis/common";

export const GEMINI_PROVIDER = "gemini";
export const GEMINI_MODEL_PARTS_KIND = "model.parts";

function hasGeminiReasoningState(part: any): boolean {
  return !!(
    part &&
    typeof part === "object" &&
    (part.thought === true ||
      part.thoughtSignature ||
      part.thought_signature ||
      part.signature)
  );
}

export function extractGeminiReasoningArtifacts(
  parts: unknown
): LlmReasoningArtifact[] | undefined {
  if (!Array.isArray(parts) || parts.length === 0) return undefined;
  if (!parts.some(hasGeminiReasoningState)) return undefined;

  const visibleText = parts
    .filter((part) => part?.thought === true && typeof part.text === "string")
    .map((part) => part.text)
    .join("");

  return [
    {
      provider: GEMINI_PROVIDER,
      kind: GEMINI_MODEL_PARTS_KIND,
      replayPolicy: "always",
      payload: {
        parts,
      },
      visibleText: visibleText || undefined,
    },
  ];
}

export function getGeminiReplayParts(message: LlmMessage): any[] | undefined {
  const artifact = message.reasoningArtifacts?.find(
    (item) =>
      item.provider === GEMINI_PROVIDER &&
      item.kind === GEMINI_MODEL_PARTS_KIND &&
      item.replayPolicy === "always"
  );
  const parts = (artifact?.payload as any)?.parts;
  return Array.isArray(parts) && parts.length > 0 ? parts : undefined;
}

export function mergeGeminiReasoningArtifacts(
  current: LlmReasoningArtifact[] | undefined,
  next: LlmReasoningArtifact[] | undefined
): LlmReasoningArtifact[] | undefined {
  if (!next?.length) return current;
  if (!current?.length) return next;
  return [...current, ...next];
}
