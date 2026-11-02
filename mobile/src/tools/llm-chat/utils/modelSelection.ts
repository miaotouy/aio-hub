import type { LlmProfile } from "../../llm-api/types";

export function parseSelectedModelValue(value: string): [string, string] {
  const delimiterIndex = value.indexOf(":");
  if (delimiterIndex < 0) return ["", ""];
  return [value.slice(0, delimiterIndex), value.slice(delimiterIndex + 1)];
}

/**
 * Preserve an explicit binding, including stale references that need repair.
 * An empty selection may inherit the user-configured default.
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
        profile.models.some(
          (model) => model.id === modelId && !model.capabilities?.decision
        )
    );
  };

  if (currentValue) return currentValue;
  return isAvailable(defaultValue) ? defaultValue : "";
}
