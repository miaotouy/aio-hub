import type { LlmProfile } from "../../llm-api/types";

export function parseSelectedModelValue(value: string): [string, string] {
  const delimiterIndex = value.indexOf(":");
  if (delimiterIndex < 0) return ["", ""];
  return [value.slice(0, delimiterIndex), value.slice(delimiterIndex + 1)];
}

/**
 * Resolves a usable chat model without overriding a still-valid user selection.
 * The saved default model is used only when the current selection is empty or stale.
 */
export function resolveSelectedModelValue(
  currentValue: string,
  defaultValue: string,
  enabledProfiles: LlmProfile[]
): string {
  const isAvailable = (value: string): boolean => {
    const [profileId, modelId] = parseSelectedModelValue(value);
    return enabledProfiles.some(
      (profile) =>
        profile.id === profileId &&
        profile.models.some((model) => model.id === modelId)
    );
  };

  if (isAvailable(currentValue)) return currentValue;
  if (isAvailable(defaultValue)) return defaultValue;

  const fallbackProfile = enabledProfiles.find(
    (profile) => profile.models.length > 0
  );
  const fallbackModel = fallbackProfile?.models[0];
  return fallbackProfile && fallbackModel
    ? `${fallbackProfile.id}:${fallbackModel.id}`
    : "";
}
