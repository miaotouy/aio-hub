// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type { RecallProfile, RetrievalEngineInfo } from "../types/search";

export const RECALL_ALGORITHM_VERSION = "recall-profile-v1";

const EMBEDDING_ENGINE_FALLBACK = new Set([
  "vector",
  "lens",
  "blender",
  "semantic",
  "associative",
]);

export function engineRequiresEmbedding(
  engineId: string,
  engines: RetrievalEngineInfo[] = []
): boolean {
  const registered = engines.find((engine) => engine.id === engineId);
  return (
    registered?.requiresEmbedding ?? EMBEDDING_ENGINE_FALLBACK.has(engineId)
  );
}

export function profileDefaults(profile: RecallProfile | undefined) {
  return profile === "associative"
    ? { limit: 4, minScore: 0.45 }
    : { limit: 5, minScore: 0.3 };
}
