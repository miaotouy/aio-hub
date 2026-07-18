// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { KnowledgeAccessError, resolveAuthorizedLibraryIds } from "./access";
import {
  listKnowledgeForAgent,
  searchKnowledgeForAgent,
  type KnowledgeApplicationContext,
} from "./application";
import {
  KNOWLEDGE_REFERENCE_SCHEMA_VERSION,
  type KnowledgeLibrarySummary,
  type KnowledgeReference,
  type KnowledgeToolSearchResponse,
} from "./types";

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function normalizeKnowledgeReference(
  value: unknown
): KnowledgeReference | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<KnowledgeReference>;
  if (
    candidate.schemaVersion !== KNOWLEDGE_REFERENCE_SCHEMA_VERSION ||
    candidate.type !== "knowledge" ||
    (candidate.mode !== "search" && candidate.mode !== "research")
  ) {
    return null;
  }

  const libraryIds = uniqueIds(candidate.libraryIds);
  if (!libraryIds.length) return null;
  const snapshotById = new Map(
    (Array.isArray(candidate.libraries) ? candidate.libraries : [])
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          (item.availability === "available" ||
            item.availability === "unavailable" ||
            item.availability === "deleted")
      )
      .map((item) => [item.id, item] as const)
  );

  return {
    schemaVersion: KNOWLEDGE_REFERENCE_SCHEMA_VERSION,
    type: "knowledge",
    libraryIds,
    mode: candidate.mode,
    libraries: libraryIds.map((id) => {
      const snapshot = snapshotById.get(id);
      return {
        id,
        name: snapshot?.name || id,
        availability: snapshot?.availability || "unavailable",
      };
    }),
  };
}

export function createKnowledgeReference(
  libraries: KnowledgeLibrarySummary[],
  mode: KnowledgeReference["mode"] = "search"
): KnowledgeReference {
  return {
    schemaVersion: KNOWLEDGE_REFERENCE_SCHEMA_VERSION,
    type: "knowledge",
    libraryIds: libraries.map((library) => library.id),
    mode,
    libraries: libraries.map((library) => ({
      id: library.id,
      name: library.name,
      availability: library.availability,
    })),
  };
}

export async function validateKnowledgeReferenceForAgent(
  context: KnowledgeApplicationContext,
  value: unknown
): Promise<KnowledgeReference> {
  const reference = normalizeKnowledgeReference(value);
  if (!reference) {
    throw new KnowledgeAccessError(
      "INVALID_REQUEST",
      "Knowledge 引用格式无效或未选择资料库"
    );
  }
  if (reference.mode === "research") {
    throw new KnowledgeAccessError(
      "RESEARCH_UNAVAILABLE",
      "Knowledge 研究任务将在 Phase 4 开放，当前只能执行快速查询"
    );
  }

  resolveAuthorizedLibraryIds(context.access, reference.libraryIds);
  const summaries = await listKnowledgeForAgent(context);
  const summaryById = new Map(
    summaries.map((summary) => [summary.id, summary])
  );
  const resolved = reference.libraryIds.map((libraryId) => {
    const summary = summaryById.get(libraryId);
    if (!summary) {
      throw new KnowledgeAccessError(
        "LIBRARY_UNAUTHORIZED",
        `当前 Agent 未获授权访问资料库: ${libraryId}`,
        libraryId
      );
    }
    if (summary.availability === "deleted") {
      throw new KnowledgeAccessError(
        "LIBRARY_DELETED",
        `资料库已删除: ${summary.name}`,
        libraryId
      );
    }
    if (summary.availability !== "available") {
      throw new KnowledgeAccessError(
        "LIBRARY_UNAVAILABLE",
        `资料库当前不可用: ${summary.name}`,
        libraryId
      );
    }
    if (
      summary.indexStatus.keyword !== "ready" &&
      summary.indexStatus.semantic !== "ready"
    ) {
      throw new KnowledgeAccessError(
        "LIBRARY_INDEX_NOT_READY",
        `资料库索引尚未就绪: ${summary.name}`,
        libraryId
      );
    }
    return summary;
  });

  return createKnowledgeReference(resolved, reference.mode);
}

export async function executeKnowledgeReferenceSearch(
  context: KnowledgeApplicationContext,
  query: string,
  reference: KnowledgeReference
): Promise<KnowledgeToolSearchResponse> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new KnowledgeAccessError(
      "QUERY_REQUIRED",
      "显式 Knowledge 查询需要输入问题"
    );
  }
  return searchKnowledgeForAgent(context, {
    query: trimmedQuery,
    libraryIds: reference.libraryIds,
    strategy: "auto",
    topK: 8,
    includeAdjacent: true,
    maxChars: 12000,
  });
}

export function formatKnowledgeReferenceResult(
  response: KnowledgeToolSearchResponse
): string {
  return [
    "Knowledge 快速查询结果（结构化 JSON，回答时请保留来源路径与 chunk 定位）：",
    JSON.stringify(response, null, 2),
  ].join("\n");
}
