// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type {
  EmbeddingAssetGeneration,
  WorkspaceConfig,
} from "../types/recall-collection";

export const EMBEDDING_ASSET_GENERATION_SCHEMA_VERSION = 1 as const;

function newGenerationId() {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `recall-embedding-assets-v1:${id}`;
}

export function createEmbeddingAssetGeneration(
  modelIdentity: string,
  now = Date.now(),
  generationId = newGenerationId()
): EmbeddingAssetGeneration {
  return {
    schemaVersion: EMBEDDING_ASSET_GENERATION_SCHEMA_VERSION,
    modelIdentity,
    generationId,
    activatedAt: now,
  };
}

export function withCurrentEmbeddingAssetGeneration(
  config: WorkspaceConfig,
  forceNew = false
): { config: WorkspaceConfig; changed: boolean } {
  const modelIdentity = config.defaultEmbeddingModel?.trim() ?? "";
  if (!modelIdentity) {
    if (!config.embeddingAssetGeneration) return { config, changed: false };
    const { embeddingAssetGeneration: _removed, ...rest } = config;
    return { config: rest as WorkspaceConfig, changed: true };
  }

  const current = config.embeddingAssetGeneration;
  if (
    !forceNew &&
    current?.schemaVersion === EMBEDDING_ASSET_GENERATION_SCHEMA_VERSION &&
    current.modelIdentity === modelIdentity &&
    current.generationId
  ) {
    return { config, changed: false };
  }

  return {
    config: {
      ...config,
      embeddingAssetGeneration: createEmbeddingAssetGeneration(modelIdentity),
    },
    changed: true,
  };
}

export function resolveEmbeddingAssetGeneration(
  config: WorkspaceConfig
): string {
  const modelIdentity = config.defaultEmbeddingModel?.trim() ?? "";
  const generation = config.embeddingAssetGeneration;
  if (generation?.modelIdentity === modelIdentity && generation.generationId) {
    return generation.generationId;
  }
  return modelIdentity
    ? `recall-embedding-assets-v1:legacy:${encodeURIComponent(modelIdentity)}`
    : "";
}
