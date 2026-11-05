import type { ProviderProfile } from "../types/provider";
import type { WireJsonValue } from "../types/json";

interface DeepSeekConnection {
  type?: string;
  provider?: string;
  baseUrl: string;
  options?: Record<string, unknown>;
}

/** Stable connection root shared by model listing, chat and web tools. */
export function getDeepSeekStableBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/beta(?:\/v1)?$/, "");
}

/** Migrate legacy Beta URLs without changing other providers or explicit flags. */
export function normalizeDeepSeekProfile<T extends DeepSeekConnection>(
  profile: T
): T {
  if ((profile.type ?? profile.provider) !== "deepseek") return profile;
  const original = profile.baseUrl.trim().replace(/\/+$/, "");
  const baseUrl = getDeepSeekStableBaseUrl(profile.baseUrl);
  if (
    baseUrl === original &&
    typeof profile.options?.deepseekBeta === "boolean"
  )
    return profile;
  return {
    ...profile,
    baseUrl: baseUrl === original ? profile.baseUrl : baseUrl,
    options: {
      ...profile.options,
      deepseekBeta:
        typeof profile.options?.deepseekBeta === "boolean"
          ? profile.options.deepseekBeta
          : true,
    },
  };
}

/** Only documented Beta features change the Chat Completions route. */
export function resolveDeepSeekBetaChatUrl(
  profile: ProviderProfile,
  body: Record<string, WireJsonValue>
): string | undefined {
  if (profile.provider !== "deepseek") return undefined;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = record(messages[messages.length - 1]);
  const prefix = last?.role === "assistant" && last.prefix === true;
  const strict =
    Array.isArray(body.tools) &&
    body.tools.some((tool) => {
      const entry = record(tool);
      return (
        entry?.type === "function" && record(entry.function)?.strict === true
      );
    });
  if (!prefix && !strict) return undefined;
  if (profile.options?.deepseekBeta === false) return undefined;
  // Explicit endpoint overrides retain the shared adapter's normal precedence.
  if (
    profile.endpoints?.chatCompletions ||
    profile.endpoints?.["chat/completions"]
  )
    return undefined;
  const base = getDeepSeekStableBaseUrl(profile.baseUrl).replace(/\/v1$/, "");
  return base + "/beta/chat/completions";
}

function record(
  value: WireJsonValue | undefined
): Record<string, WireJsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, WireJsonValue>)
    : undefined;
}
