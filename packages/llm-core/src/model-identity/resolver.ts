import { DEFAULT_MODEL_IDENTITY_PRESETS } from "./builtin-presets";
import {
  normalizeCanonicalModelId,
  validateModelIdentity,
} from "./canonical-id";
import type {
  ModelIdentity,
  ModelIdentityLike,
  ModelIdentityPresetRule,
  ModelIdentitySuggestion,
  ModelProfileLike,
  ModelRouteRef,
} from "./types";

export function validateModelIdentityPresets(
  presets: readonly ModelIdentityPresetRule[]
): void {
  const ids = new Set<string>();
  const routes = new Map<string, string>();
  for (const preset of presets) {
    if (!preset.id.trim() || ids.has(preset.id)) {
      throw new Error(`模型身份目录存在空 ID 或重复 ID: ${preset.id}`);
    }
    ids.add(preset.id);
    if (!preset.routeModelId.trim()) {
      throw new Error(`模型身份规则 ${preset.id} 缺少 routeModelId`);
    }
    const canonicalId = normalizeCanonicalModelId(preset.identity.canonicalId);
    if (!canonicalId) {
      throw new Error(`模型身份规则 ${preset.id} 的 canonicalId 非法`);
    }
    if (!preset.evidence.reference.trim()) {
      throw new Error(`模型身份规则 ${preset.id} 缺少证据引用`);
    }
    const routeKey = preset.routeModelId.toLowerCase();
    const existing = routes.get(routeKey);
    if (existing && existing !== canonicalId) {
      throw new Error(
        `模型身份目录对 routeModelId ${preset.routeModelId} 存在冲突映射`
      );
    }
    routes.set(routeKey, canonicalId);
  }
}

validateModelIdentityPresets(DEFAULT_MODEL_IDENTITY_PRESETS);

export function resolveBuiltinModelIdentity(
  routeModelId: string,
  options: {
    declaredOwner?: string;
    routeNamespace?: string;
    presets?: readonly ModelIdentityPresetRule[];
  } = {}
): ModelIdentitySuggestion | null {
  const presets = options.presets ?? DEFAULT_MODEL_IDENTITY_PRESETS;
  const normalizedRouteId = routeModelId.trim().toLowerCase();
  const declaredOwner = options.declaredOwner?.trim().toLowerCase();
  const routeNamespace = options.routeNamespace?.trim().toLowerCase();
  const preset = presets.find((candidate) => {
    if (candidate.routeModelId.toLowerCase() !== normalizedRouteId)
      return false;
    if (
      candidate.qualifiers?.declaredOwners &&
      (!declaredOwner ||
        !candidate.qualifiers.declaredOwners.some(
          (owner) => owner.toLowerCase() === declaredOwner
        ))
    ) {
      return false;
    }
    if (
      candidate.qualifiers?.routeNamespaces &&
      (!routeNamespace ||
        !candidate.qualifiers.routeNamespaces.some(
          (namespace) => namespace.toLowerCase() === routeNamespace
        ))
    ) {
      return false;
    }
    return true;
  });
  if (!preset) return null;

  return {
    identity: {
      canonicalId: normalizeCanonicalModelId(preset.identity.canonicalId)!,
      ...(preset.identity.revision
        ? { revision: preset.identity.revision.trim() }
        : {}),
      source: "builtin",
    },
    confidence: "exact",
    evidence: preset.evidence.note
      ? `${preset.evidence.reference} (${preset.evidence.note})`
      : preset.evidence.reference,
  };
}

export function suggestModelIdentityFromProvider(
  routeModelId: string,
  declaredOwner?: string
): ModelIdentitySuggestion | null {
  const owner = declaredOwner?.trim().toLowerCase();
  const modelSlug = routeModelId.trim().replace(/\\/g, "/").split("/").pop();
  if (!owner || !modelSlug) return null;
  const canonicalId = normalizeCanonicalModelId(`${owner}/${modelSlug}`);
  if (!canonicalId) return null;
  return {
    identity: { canonicalId, source: "provider" },
    confidence: "suggested",
    evidence: `Provider model catalog declared owner: ${declaredOwner}`,
  };
}

export function materializeModelIdentity<T extends ModelIdentityLike>(
  model: T,
  options: { declaredOwner?: string; routeNamespace?: string } = {}
): T {
  if (getModelIdentity(model)) return model;
  const suggestion = resolveBuiltinModelIdentity(model.id, options);
  return suggestion?.confidence === "exact"
    ? { ...model, modelIdentity: suggestion.identity }
    : model;
}

export function getModelIdentity(
  model: ModelIdentityLike
): ModelIdentity | null {
  if (!model.modelIdentity) return null;
  return validateModelIdentity(model.modelIdentity).normalizedIdentity ?? null;
}

export function getRouteRef(profileId: string, modelId: string): ModelRouteRef {
  return { profileId, modelId };
}

export function listRoutesByCanonicalId<
  TModel extends ModelIdentityLike,
  TProfile extends ModelProfileLike<TModel>,
>(profiles: readonly TProfile[], canonicalId: string) {
  const normalized = normalizeCanonicalModelId(canonicalId);
  if (!normalized) return [];
  return profiles.flatMap((profile) =>
    profile.models.flatMap((model) =>
      getModelIdentity(model)?.canonicalId === normalized
        ? [{ route: getRouteRef(profile.id, model.id), profile, model }]
        : []
    )
  );
}
