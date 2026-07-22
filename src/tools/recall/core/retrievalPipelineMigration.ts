// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type {
  RecallPipelineErrorCode,
  RecallPresetId,
} from "../types/pipeline";

export const RECALL_PIPELINE_MIGRATION_VERSION =
  "recall-retrieval-migration-v1" as const;

export type LegacyRetrievalSource =
  | "workspace-playground"
  | "agent-settings"
  | "agent-binding"
  | "placeholder"
  | "agent-tool"
  | "retrieval-cache";

export interface LegacyRetrievalMigrationInput {
  source: LegacyRetrievalSource;
  selectorField: string;
  targetField?: string;
  legacyId: string;
  fields: Record<string, unknown>;
}

export interface LegacyRetrievalMigrationIssue {
  code: RecallPipelineErrorCode;
  fieldPath: string;
  message: string;
  recoverable: true;
}

export interface LegacyRetrievalMigrationReport {
  migrationVersion: typeof RECALL_PIPELINE_MIGRATION_VERSION;
  source: LegacyRetrievalSource;
  status: "migrated" | "invalidated" | "requires-user-choice";
  legacyId: string;
  targetPresetId?: RecallPresetId;
  convertedFields: Record<string, string>;
  preservedFields: Record<string, unknown>;
  discardedFields: string[];
  invalidatedFields: string[];
  semanticDifferences: string[];
  issue?: LegacyRetrievalMigrationIssue;
}

export const LEGACY_RETRIEVAL_PRESET_MAP: Readonly<
  Record<string, RecallPresetId>
> = {
  keyword: "algorithmic",
  vector: "comprehensive",
  lens: "comprehensive",
  blender: "comprehensive",
  semantic: "comprehensive",
  associative: "comprehensive",
};

const PRESERVED_FIELDS: Record<LegacyRetrievalSource, ReadonlySet<string>> = {
  "workspace-playground": new Set([
    "query",
    "globalQuery",
    "selectedRecallIds",
    "slots",
    "limit",
  ]),
  "agent-settings": new Set([
    "enabled",
    "defaultLimit",
    "maxRecallChars",
    "gateScanDepth",
    "enableCache",
    "resultTemplate",
    "emptyText",
  ]),
  "agent-binding": new Set([
    "recallId",
    "recallName",
    "enabled",
    "when",
    "whenParams",
    "limit",
    "group",
  ]),
  placeholder: new Set([
    "collection",
    "limit",
    "when",
    "gateTags",
    "everyTurns",
    "entries",
  ]),
  "agent-tool": new Set([
    "recallNames",
    "recallIds",
    "query",
    "limit",
    "tags",
    "enabledOnly",
  ]),
  "retrieval-cache": new Set(),
};

const INVALIDATED_FIELDS: Record<LegacyRetrievalSource, ReadonlySet<string>> = {
  "workspace-playground": new Set([
    "results",
    "trace",
    "loading",
    "error",
    "slots[].results",
  ]),
  "agent-settings": new Set(),
  "agent-binding": new Set(),
  placeholder: new Set(),
  "agent-tool": new Set(),
  "retrieval-cache": new Set(["cacheKey", "results", "trace", "vector"]),
};

function semanticDifferences(legacyId: string): string[] {
  const differences = [
    "legacy-score-domain-not-preserved",
    "legacy-candidate-order-not-preserved",
  ];
  if (legacyId === "keyword") {
    differences.push("legacy-keyword-ranking-not-preserved");
  } else if (legacyId === "vector" || legacyId === "semantic") {
    differences.push("legacy-vector-weighting-not-preserved");
  } else if (["lens", "blender", "associative"].includes(legacyId)) {
    differences.push("legacy-fusion-semantics-not-preserved");
  }
  return differences;
}

function migratePlaygroundSlots(
  slots: unknown[]
): {
  slots: unknown[];
  presetIds: RecallPresetId[];
  unknownIds: string[];
  invalidatedResults: boolean;
} {
  const presetIds = new Set<RecallPresetId>();
  const unknownIds: string[] = [];
  let invalidatedResults = false;
  const migratedSlots = slots.map((slot) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      unknownIds.push("<invalid-slot>");
      return slot;
    }
    const record = slot as Record<string, unknown>;
    const engineId = typeof record.engineId === "string" ? record.engineId : undefined;
    const presetId = engineId ? LEGACY_RETRIEVAL_PRESET_MAP[engineId] : undefined;
    if (!presetId) unknownIds.push(engineId ?? "<missing-engineId>");
    else presetIds.add(presetId);
    if ("results" in record) invalidatedResults = true;
    const { engineId: _engineId, results: _results, ...rest } = record;
    return {
      ...rest,
      ...(presetId ? { presetId } : {}),
    };
  });
  return {
    slots: migratedSlots,
    presetIds: [...presetIds],
    unknownIds,
    invalidatedResults,
  };
}

export function migrateLegacyRetrievalSelection(
  input: LegacyRetrievalMigrationInput
): LegacyRetrievalMigrationReport {
  const targetPresetId = LEGACY_RETRIEVAL_PRESET_MAP[input.legacyId];
  if (!targetPresetId) {
    return {
      migrationVersion: RECALL_PIPELINE_MIGRATION_VERSION,
      source: input.source,
      status: "requires-user-choice",
      legacyId: input.legacyId,
      convertedFields: {},
      preservedFields: {},
      discardedFields: Object.keys(input.fields).sort(),
      invalidatedFields: [],
      semanticDifferences: [],
      issue: {
        code: "legacy-id-unknown",
        fieldPath: input.selectorField,
        message: `Unknown legacy retrieval ID: ${input.legacyId}`,
        recoverable: true,
      },
    };
  }

  const preservedFields: Record<string, unknown> = {};
  const discardedFields: string[] = [];
  const invalidatedFields: string[] = [];
  const preserved = PRESERVED_FIELDS[input.source];
  const invalidated = INVALIDATED_FIELDS[input.source];

  if (
    input.source === "workspace-playground" &&
    Array.isArray(input.fields.slots)
  ) {
    const migrated = migratePlaygroundSlots(input.fields.slots);
    preservedFields.globalQuery = input.fields.globalQuery ?? "";
    if (Array.isArray(input.fields.selectedRecallIds)) {
      preservedFields.selectedRecallIds = input.fields.selectedRecallIds;
    }
    preservedFields.slots = migrated.slots;
    if (migrated.invalidatedResults) invalidatedFields.push("slots[].results");
    if (migrated.unknownIds.length > 0) {
      return {
        migrationVersion: RECALL_PIPELINE_MIGRATION_VERSION,
        source: input.source,
        status: "requires-user-choice",
        legacyId: input.legacyId,
        convertedFields: input.targetField
          ? { "slots[].engineId": "slots[].presetId" }
          : {},
        preservedFields,
        discardedFields: Object.keys(input.fields)
          .filter((key) => !preserved.has(key) && key !== "slots")
          .sort(),
        invalidatedFields: invalidatedFields.sort(),
        semanticDifferences: [],
        issue: {
          code: "legacy-id-unknown",
          fieldPath: "slots[].engineId",
          message: `Unknown legacy retrieval ID(s): ${migrated.unknownIds.join(", ")}`,
          recoverable: true,
        },
      };
    }
    for (const key of Object.keys(input.fields)) {
      if (!preserved.has(key) && !invalidated.has(key)) discardedFields.push(key);
    }
    return {
      migrationVersion: RECALL_PIPELINE_MIGRATION_VERSION,
      source: input.source,
      status: "migrated",
      legacyId: input.legacyId,
      targetPresetId:
        migrated.presetIds.length === 1 ? migrated.presetIds[0] : undefined,
      convertedFields: input.targetField
        ? { "slots[].engineId": "slots[].presetId" }
        : {},
      preservedFields,
      discardedFields: discardedFields.sort(),
      invalidatedFields: invalidatedFields.sort(),
      semanticDifferences: semanticDifferences(input.legacyId),
    };
  }

  for (const [key, value] of Object.entries(input.fields)) {
    if (invalidated.has(key)) {
      invalidatedFields.push(key);
    } else if (preserved.has(key)) {
      preservedFields[key] = value;
    } else {
      discardedFields.push(key);
    }
  }

  return {
    migrationVersion: RECALL_PIPELINE_MIGRATION_VERSION,
    source: input.source,
    status: input.source === "retrieval-cache" ? "invalidated" : "migrated",
    legacyId: input.legacyId,
    targetPresetId,
    convertedFields: input.targetField
      ? { [input.selectorField]: input.targetField }
      : {},
    preservedFields,
    discardedFields: discardedFields.sort(),
    invalidatedFields: invalidatedFields.sort(),
    semanticDifferences: semanticDifferences(input.legacyId),
  };
}
