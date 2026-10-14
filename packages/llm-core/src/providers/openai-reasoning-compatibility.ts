import type { LlmRequest } from "../types/request";

/** GPT-6 defaults to reasoning; sampling and log probabilities require effort none. */
export function usesGpt6Reasoning(
  request: Pick<LlmRequest, "model" | "reasoningEffort">
): boolean {
  return (
    /^(?:gpt-6-(?:astra|sol|luna)|gpt-6\.1-sol)(?:-|$)/i.test(request.model) &&
    request.reasoningEffort?.toLowerCase() !== "none"
  );
}
