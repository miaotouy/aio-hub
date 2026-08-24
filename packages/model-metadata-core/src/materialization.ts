import { deepClone, stableFingerprint } from "./fingerprint";

export type ModelMetadataBindingMode =
  | "manual"
  | "fillMissing"
  | "followSource";

export interface ModelMetadataBindingLike {
  mode: ModelMetadataBindingMode;
  sourceId?: string;
  sourceRevision?: string;
  appliedRuleIds?: string[];
  managedPaths?: string[];
  appliedAt?: string;
  fingerprint?: string;
}

/** Minimal persisted model shape shared by desktop and mobile materialization. */
export interface MaterializableModel {
  id: string;
  provider?: string;
  group?: string;
  icon?: string;
  description?: string;
  tokenizerProfileId?: string;
  apiFamily?: string;
  capabilities?: object;
  tokenLimits?: { contextLength?: number };
  mediaGenParams?: unknown;
  metadataBinding?: ModelMetadataBindingLike;
}

/** Metadata fields with a defined model-object mapping. Unknown fields remain safely preserved on the rule. */
export interface MaterializableMetadataProperties {
  group?: string;
  icon?: string;
  description?: string;
  tokenizer?: string;
  apiFamily?: string;
  capabilities?: object;
  contextLength?: number;
  mediaGenParams?: unknown;
}

export interface ModelMetadataFieldChange {
  path: string;
  previous: unknown;
  next: unknown;
}

export interface MaterializeModelMetadataOptions {
  mode?: ModelMetadataBindingMode;
  sourceId?: string;
  sourceRevision?: string;
  appliedRuleIds?: string[];
  now?: string;
}

export interface MaterializeModelMetadataResult<TModel extends MaterializableModel> {
  model: TModel & MaterializableModel;
  changes: ModelMetadataFieldChange[];
  binding: ModelMetadataBindingLike;
}

function hasValue(value: unknown): boolean {
  return value !== undefined;
}

function canManage(
  model: MaterializableModel,
  path: string,
  mode: ModelMetadataBindingMode
): boolean {
  return (
    mode === "followSource" &&
    model.metadataBinding?.managedPaths?.includes(path) === true
  );
}

function inferApiFamily(
  properties: MaterializableMetadataProperties,
  provider?: string
): string | undefined {
  if (properties.apiFamily) return properties.apiFamily;
  const group = properties.group?.toLowerCase();
  if (group?.includes("claude")) return "claude";
  if (group?.includes("gemini") || group?.includes("gemma")) return "gemini";
  if (group?.includes("cohere")) return "cohere";
  if (group?.includes("deepseek")) return "deepseek";
  if (group?.includes("qwen")) return "qwen";
  if (group?.includes("grok") || group?.includes("xai")) return "xai";
  if (group?.includes("openai") || group?.includes("gpt")) return "openai";

  switch (provider?.toLowerCase()) {
    case "anthropic":
    case "claude":
      return "claude";
    case "google":
    case "gemini":
    case "vertexai":
      return "gemini";
    case "cohere":
      return "cohere";
    case "deepseek":
      return "deepseek";
    case "qwen":
    case "alibaba":
      return "qwen";
    case "xai":
      return "xai";
    case "openai":
      return "openai";
    default:
      return undefined;
  }
}

/**
 * The single model-write entry for matched metadata. It receives resolved
 * properties rather than consulting a global catalog, so runtime consumers
 * cannot silently rematerialize an already saved model.
 */
export function materializeModelMetadata<
  TModel extends MaterializableModel,
  TProperties extends MaterializableMetadataProperties,
>(
  sourceModel: TModel,
  properties: TProperties | undefined,
  options: MaterializeModelMetadataOptions = {}
): MaterializeModelMetadataResult<TModel> {
  const model = deepClone(sourceModel);
  const changes: ModelMetadataFieldChange[] = [];
  const mode = options.mode ?? sourceModel.metadataBinding?.mode ?? "fillMissing";
  const managedPaths = new Set(sourceModel.metadataBinding?.managedPaths ?? []);

  if (mode === "manual") {
    const binding = sourceModel.metadataBinding ?? { mode: "manual" as const };
    return { model, changes, binding };
  }

  if (!properties) {
    return {
      model,
      changes,
      binding: sourceModel.metadataBinding ?? { mode },
    };
  }

  const applyScalar = (
    path: "group" | "icon" | "description" | "tokenizerProfileId" | "apiFamily",
    next: string | undefined
  ) => {
    if (!hasValue(next)) return;
    const previous = model[path];
    if (!hasValue(previous) || canManage(sourceModel, path, mode)) {
      if (previous !== next) changes.push({ path, previous, next });
      model[path] = deepClone(next);
      managedPaths.add(path);
    }
  };

  applyScalar("group", properties.group);
  applyScalar("icon", properties.icon);
  applyScalar("description", properties.description);
  applyScalar("tokenizerProfileId", properties.tokenizer);
  applyScalar("apiFamily", inferApiFamily(properties, model.provider));

  if (properties.contextLength !== undefined) {
    const path = "tokenLimits.contextLength";
    const previous = model.tokenLimits?.contextLength;
    if (!hasValue(previous) || canManage(sourceModel, path, mode)) {
      if (previous !== properties.contextLength) {
        changes.push({ path, previous, next: properties.contextLength });
      }
      model.tokenLimits = {
        ...model.tokenLimits,
        contextLength: properties.contextLength,
      };
      managedPaths.add(path);
    }
  }

  for (const [key, value] of Object.entries(properties.capabilities ?? {})) {
    const path = `capabilities.${key}`;
    const previous = (model.capabilities as Record<string, unknown> | undefined)?.[
      key
    ];
    if (!hasValue(previous) || canManage(sourceModel, path, mode)) {
      if (previous !== value) changes.push({ path, previous, next: value });
      model.capabilities = {
        ...(model.capabilities as Record<string, unknown> | undefined),
        [key]: deepClone(value),
      };
      managedPaths.add(path);
    }
  }

  // Media parameters are a model-owned snapshot after first apply. They are
  // intentionally not refreshed from the global metadata catalog at runtime.
  if (properties.mediaGenParams && !model.mediaGenParams) {
    model.mediaGenParams = deepClone(properties.mediaGenParams);
    changes.push({
      path: "mediaGenParams",
      previous: undefined,
      next: model.mediaGenParams,
    });
  }

  const binding: ModelMetadataBindingLike = {
    mode,
    sourceId:
      options.sourceId ?? sourceModel.metadataBinding?.sourceId ?? "aiohub-builtin",
    sourceRevision:
      options.sourceRevision ?? sourceModel.metadataBinding?.sourceRevision,
    appliedRuleIds:
      options.appliedRuleIds ?? sourceModel.metadataBinding?.appliedRuleIds,
    managedPaths: [...managedPaths].sort(),
    appliedAt: options.now ?? new Date().toISOString(),
    fingerprint: stableFingerprint({
      properties,
      ruleIds: options.appliedRuleIds ?? [],
    }),
  };
  model.metadataBinding = binding;

  return { model, changes, binding };
}

function readPath(target: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[segment];
  }, target);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableFingerprint(left) === stableFingerprint(right);
}

/** Remove follow-source management for fields the user edited after materialization. */
export function detachModifiedMetadataPaths<TModel extends MaterializableModel>(
  baseline: TModel | undefined,
  editedModel: TModel
): TModel {
  const model = deepClone(editedModel);
  const binding = model.metadataBinding;
  if (!baseline || binding?.mode !== "followSource" || !binding.managedPaths) {
    return model;
  }

  const managedPaths = binding.managedPaths.filter((path) =>
    valuesEqual(readPath(baseline, path), readPath(model, path))
  );
  model.metadataBinding = { ...binding, managedPaths };
  return model;
}
