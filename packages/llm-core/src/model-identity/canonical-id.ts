import type {
  ModelIdentity,
  ModelIdentityValidationResult,
} from "./types";

const CANONICAL_ID_PATTERN = /^[a-z0-9._-]+\/[a-z0-9._-]+$/;

export function normalizeCanonicalModelId(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, "/").toLowerCase();
  return CANONICAL_ID_PATTERN.test(normalized) ? normalized : null;
}

export function validateModelIdentity(
  identity: ModelIdentity
): ModelIdentityValidationResult {
  const errors: string[] = [];
  const canonicalId = normalizeCanonicalModelId(identity.canonicalId);
  if (!canonicalId) {
    errors.push(
      "canonicalId 必须为 developer/model，且两段只能包含字母、数字、点、下划线和连字符"
    );
  }
  const revision = identity.revision?.trim();
  if (identity.revision !== undefined && !revision) {
    errors.push("revision 不能为空字符串");
  }
  if (!(["builtin", "provider", "user"] as const).includes(identity.source)) {
    errors.push("source 必须为 builtin、provider 或 user");
  }

  return {
    valid: errors.length === 0,
    normalizedIdentity:
      errors.length === 0 && canonicalId
        ? {
            canonicalId,
            ...(revision ? { revision } : {}),
            source: identity.source,
          }
        : undefined,
    errors,
  };
}
