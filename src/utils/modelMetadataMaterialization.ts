// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { deepClone, stableFingerprint } from "@aiohub/model-metadata-core";
import type {
  LlmModelInfo,
  ModelApiFamily,
  ModelMetadataBinding,
} from "@/types/llm-profiles";
import type { ModelMetadataProperties } from "@/types/model-metadata";

export interface ModelMetadataFieldChange {
  path: string;
  previous: unknown;
  next: unknown;
}

export interface MaterializeModelMetadataOptions {
  mode?: ModelMetadataBinding["mode"];
  sourceId?: string;
  sourceRevision?: string;
  appliedRuleIds?: string[];
  now?: string;
}

export interface MaterializeModelMetadataResult {
  model: LlmModelInfo;
  changes: ModelMetadataFieldChange[];
  binding: ModelMetadataBinding;
}

function hasValue(value: unknown): boolean {
  return value !== undefined;
}

function canManage(
  model: LlmModelInfo,
  path: string,
  mode: ModelMetadataBinding["mode"]
): boolean {
  return (
    mode === "followSource" &&
    model.metadataBinding?.managedPaths?.includes(path) === true
  );
}

function inferApiFamily(
  properties: ModelMetadataProperties,
  provider?: string
): ModelApiFamily | undefined {
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
 * The only model-write entry for matched metadata. It deliberately receives
 * resolved properties instead of reading the global rule store, so runtime
 * consumers cannot accidentally re-materialize saved models.
 */
export function materializeModelMetadata(
  sourceModel: LlmModelInfo,
  properties: ModelMetadataProperties | undefined,
  options: MaterializeModelMetadataOptions = {}
): MaterializeModelMetadataResult {
  const model = deepClone(sourceModel);
  const changes: ModelMetadataFieldChange[] = [];
  const mode =
    options.mode ?? sourceModel.metadataBinding?.mode ?? "fillMissing";
  const managedPaths = new Set(sourceModel.metadataBinding?.managedPaths ?? []);

  // Manual models are entirely user-owned. Resolving rules for a manual model
  // must not add missing values or establish a new managed-field relationship.
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

  const applyScalar = <
    K extends
      "group" | "icon" | "description" | "tokenizerProfileId" | "apiFamily",
  >(
    path: K,
    next: LlmModelInfo[K] | undefined
  ) => {
    if (!hasValue(next)) return;
    const previous = model[path];
    if (!hasValue(previous) || canManage(sourceModel, path, mode)) {
      if (previous !== next) changes.push({ path, previous, next });
      model[path] = deepClone(next) as LlmModelInfo[K];
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
    const previous = (
      model.capabilities as Record<string, unknown> | undefined
    )?.[key];
    if (!hasValue(previous) || canManage(sourceModel, path, mode)) {
      if (previous !== value) changes.push({ path, previous, next: value });
      model.capabilities = { ...model.capabilities, [key]: deepClone(value) };
      managedPaths.add(path);
    }
  }

  // Media-generation parameters are a model-owned snapshot after first apply.
  if (properties.mediaGenParams && !model.mediaGenParams) {
    model.mediaGenParams = deepClone(properties.mediaGenParams);
    changes.push({
      path: "mediaGenParams",
      previous: undefined,
      next: model.mediaGenParams,
    });
  }

  const binding: ModelMetadataBinding = {
    mode,
    sourceId:
      options.sourceId ??
      sourceModel.metadataBinding?.sourceId ??
      "aiohub-builtin",
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

/**
 * Remove fields from a follow-source binding after the user changes them in a
 * model editor. Callers should pass the last materialized baseline, rather
 * than the model that existed before an explicit "apply preset" action.
 */
export function detachModifiedMetadataPaths(
  baseline: LlmModelInfo | undefined,
  editedModel: LlmModelInfo
): LlmModelInfo {
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
