// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeKnowledgeMigration } from "../knowledgeMigrationOperations";
import {
  createRecallMigrationFlowDefinition,
  detectRecallMigration,
} from "../recallMigrationFlow";
import {
  initializeRecallMigrationFlow,
  openRecallMigrationFlow,
} from "../recallMigrationCoordinator";
import {
  RECALL_MIGRATION_FLOW_ID,
  type RecallMigrationPreview,
  type RecallMigrationReport,
} from "../types";

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
const guidedFlowMocks = vi.hoisted(() => {
  const definitions = new Map<string, unknown>();
  return {
    definitions,
    initialize: vi.fn(),
    trigger: vi.fn(),
    open: vi.fn(),
    get: vi.fn((id: string) => definitions.get(id)),
    register: vi.fn((definition: { id: string }) => {
      definitions.set(definition.id, definition);
    }),
    replace: vi.fn((definition: { id: string }) => {
      definitions.set(definition.id, definition);
    }),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriMocks.invoke }));
vi.mock("@/services/guided-flow", () => ({
  guidedFlowManager: {
    initialize: guidedFlowMocks.initialize,
    trigger: guidedFlowMocks.trigger,
    open: guidedFlowMocks.open,
  },
  guidedFlowRegistry: {
    get: guidedFlowMocks.get,
    register: guidedFlowMocks.register,
    replace: guidedFlowMocks.replace,
  },
}));

const preview: RecallMigrationPreview = {
  migrationId: "knowledge-to-recall-v2",
  sourceFingerprint: "fingerprint-1",
  sourcePath: "C:/legacy/bases",
  legacyDataPath: "C:/legacy",
  targetDescription: "Recall SQLite",
  sourceCollections: 2,
  sourceEntries: 10,
  sourceVectors: 8,
  preservedFields: ["entries"],
  rebuiltFields: ["cache"],
  unsupportedFields: ["broken files"],
  warnings: [],
  requiresBackup: true,
  mainStatus: "not_started",
  vectorStatus: "not_started",
  pendingVectors: 0,
  issueCount: 0,
};

const completeReport: RecallMigrationReport = {
  sourcePath: preview.sourcePath,
  legacyDataPath: preview.legacyDataPath,
  sourceFingerprint: preview.sourceFingerprint,
  mainStatus: "completed",
  vectorStatus: "completed",
  sourceCollections: 2,
  migratedCollections: 2,
  sourceEntries: 10,
  migratedEntries: 10,
  skippedEntries: 0,
  sourceVectors: 8,
  migratedVectors: 8,
  pendingVectors: 0,
  sourceVectorModels: 1,
  migratedVectorModels: 1,
  tagVectorCount: 0,
  recoveryInstructions: [],
  issues: [],
};

beforeEach(() => {
  tauriMocks.invoke.mockReset();
  guidedFlowMocks.initialize.mockReset();
  guidedFlowMocks.trigger.mockReset();
  guidedFlowMocks.open.mockReset();
  guidedFlowMocks.get.mockClear();
  guidedFlowMocks.register.mockClear();
  guidedFlowMocks.replace.mockClear();
  guidedFlowMocks.definitions.clear();
});

describe("Recall migration GuidedFlow", () => {
  it("does not define a migration flow when no legacy source exists", async () => {
    tauriMocks.invoke.mockResolvedValueOnce(null);

    await expect(detectRecallMigration()).resolves.toBeNull();
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "recall_preview_legacy_migration"
    );
  });

  it("defines and triggers a Recall-owned pending-migration flow", async () => {
    tauriMocks.invoke.mockResolvedValueOnce(preview);

    await initializeRecallMigrationFlow();

    expect(guidedFlowMocks.initialize).toHaveBeenCalledOnce();
    expect(guidedFlowMocks.register).toHaveBeenCalledOnce();
    expect(guidedFlowMocks.trigger).toHaveBeenCalledWith(
      RECALL_MIGRATION_FLOW_ID
    );

    const definition = guidedFlowMocks.definitions.get(
      RECALL_MIGRATION_FLOW_ID
    ) as ReturnType<typeof createRecallMigrationFlowDefinition>;
    expect(definition.trigger).toBe("pending-migration");
    expect(definition.blockingScope).toBe("module");
    expect(definition.steps).toHaveLength(1);

    const context = await definition.createContext!();
    expect(context.migration.preview.sourceFingerprint).toBe(
      preview.sourceFingerprint
    );
    expect(await definition.steps[0].validate?.(context)).toBe(false);
  });

  it("opens the standalone Recall flow from the module entry point", async () => {
    tauriMocks.invoke.mockResolvedValueOnce(preview);

    await openRecallMigrationFlow();

    expect(guidedFlowMocks.open).toHaveBeenCalledWith(
      RECALL_MIGRATION_FLOW_ID,
      { mode: "resume" }
    );
  });

  it("runs again after a partial report and completes the module flow context", async () => {
    const detection = {
      preview,
      snapshot: {
        preview,
        backupConfirmed: true,
        executionStatus: "pending" as const,
        cleanupChoice: "keep" as const,
        cleanupConfirmation: "",
      },
    };
    const definition = createRecallMigrationFlowDefinition(detection);
    const context = await definition.createContext!();
    const partialReport = {
      ...completeReport,
      mainStatus: "partial",
      vectorStatus: "not_started",
    };

    tauriMocks.invoke
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(partialReport)
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(completeReport);

    await executeKnowledgeMigration(context);
    expect(context.migration.executionStatus).toBe("partial");
    expect(await definition.steps[0].validate?.(context)).toBe(false);

    await executeKnowledgeMigration(context);
    expect(context.migration.executionStatus).toBe("completed");
    expect(await definition.steps[0].validate?.(context)).toBe(true);
  });

  it("keeps cleanup as a separate explicit confirmation after a complete report", async () => {
    const definition = createRecallMigrationFlowDefinition({
      preview: {
        ...preview,
        mainStatus: "completed",
        vectorStatus: "completed",
      },
      report: completeReport,
      snapshot: {
        preview: {
          ...preview,
          mainStatus: "completed",
          vectorStatus: "completed",
        },
        backupConfirmed: false,
        executionStatus: "completed",
        report: completeReport,
        cleanupChoice: "cleanup",
        cleanupConfirmation: "DELETE",
      },
    });
    const context = await definition.createContext!();

    await definition.steps[0].onNext?.(context);

    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "recall_confirm_legacy_cleanup",
      {
        sourceFingerprint: preview.sourceFingerprint,
        confirmed: true,
      }
    );
  });
});
