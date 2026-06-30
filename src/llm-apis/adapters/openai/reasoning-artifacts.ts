import type {
  LlmMessage,
  LlmReasoningArtifact,
} from "@/llm-apis/common";

export const OPENAI_RESPONSES_PROVIDER = "openai-responses";
export const OPENAI_RESPONSE_OUTPUT_ITEM_KIND = "response.output_item";
export const OPENAI_REASONING_ENCRYPTED_CONTENT =
  "reasoning.encrypted_content";

export function extractOpenAiResponsesReasoningArtifacts(
  output: unknown,
  responseId?: string
): LlmReasoningArtifact[] | undefined {
  if (!Array.isArray(output) || output.length === 0) return undefined;

  return output.map((item, index) => ({
    provider: OPENAI_RESPONSES_PROVIDER,
    kind: OPENAI_RESPONSE_OUTPUT_ITEM_KIND,
    replayPolicy: "always" as const,
    payload: {
      responseId,
      index,
      item,
    },
  }));
}

export function getOpenAiResponsesReplayItems(message: LlmMessage): any[] {
  const artifacts = message.reasoningArtifacts || [];
  return artifacts
    .filter(
      (artifact) =>
        artifact.provider === OPENAI_RESPONSES_PROVIDER &&
        artifact.kind === OPENAI_RESPONSE_OUTPUT_ITEM_KIND &&
        artifact.replayPolicy === "always"
    )
    .sort((a, b) => {
      const aIndex = Number((a.payload as any)?.index ?? 0);
      const bIndex = Number((b.payload as any)?.index ?? 0);
      return aIndex - bIndex;
    })
    .map((artifact) => (artifact.payload as any)?.item)
    .filter((item) => item && typeof item === "object");
}

export function mergeReasoningEncryptedContentInclude(
  include?: string[]
): string[] {
  const result = new Set(include || []);
  result.add(OPENAI_REASONING_ENCRYPTED_CONTENT);
  return Array.from(result);
}
