import type { LlmRequest } from "../types/request";

type SamplingContext = Pick<
  LlmRequest,
  "model" | "reasoningEffort" | "thinkingEnabled"
> & {
  supportedParameters?: readonly string[];
};

/** Modern OpenAI chat models use the completion budget, including reasoning tokens. */
export function usesOpenAiCompletionTokens(modelId: string): boolean {
  const model = modelId.split("/").pop()!.split(":")[0];
  return /^(?:o[134](?:-|$)|gpt-[56](?:[.-]|$))/i.test(model);
}

/** Recognize routed IDs without treating every thinking-capable model alike. */
export function usesOpenAiReasoning(request: SamplingContext): boolean {
  const model = request.model.split("/").pop()!.split(":")[0];
  if (/^o[134](?:-|$)/i.test(model)) return true;
  if (/^gpt-5(?:-(?:mini|nano|pro))?(?:-\d{4}-\d{2}-\d{2})?$/i.test(model))
    return true;
  if (/-chat(?:-latest)?$/i.test(model)) return false;
  return (
    /^gpt-(?:5\.\d+|6(?:\.\d+)?)(?:-|$)/i.test(model) &&
    request.reasoningEffort?.toLowerCase() !== "none"
  );
}

export function usesAnthropicThinking(request: SamplingContext): boolean {
  return (
    /(?:^|[./])claude-/i.test(request.model) &&
    (request.thinkingEnabled === true ||
      request.reasoningEffort !== undefined ||
      /claude-opus-5-5(?:[-@:]|$)/i.test(request.model))
  );
}

/** Fields rejected by the selected model/mode, in the public parameter vocabulary. */
export function isSamplingParameterUnsupported(
  key: string,
  request: SamplingContext
): boolean {
  const samplingWireKeys: Record<string, string> = {
    temperature: "temperature",
    topP: "top_p",
    topK: "top_k",
    logprobs: "logprobs",
    topLogprobs: "top_logprobs",
  };
  const wireKey = samplingWireKeys[key];
  if (
    wireKey &&
    request.supportedParameters !== undefined &&
    !request.supportedParameters.includes(wireKey)
  )
    return true;
  if (usesOpenAiReasoning(request))
    return ["temperature", "topP", "logprobs", "topLogprobs"].includes(key);
  if (usesAnthropicThinking(request))
    return ["temperature", "topP", "topK"].includes(key);
  return false;
}
