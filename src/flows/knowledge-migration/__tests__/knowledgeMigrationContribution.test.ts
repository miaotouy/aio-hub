// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { beforeEach, describe, expect, it, vi } from "vitest";
import { upgradeContributionRegistry } from "@/flows/upgrade/upgradeContributionRegistry";
import type {
  ReleaseNoteManifest,
  UpgradeFlowContext,
} from "@/flows/upgrade/types";
import { registerKnowledgeMigrationContribution } from "../knowledgeMigrationContribution";
import { executeKnowledgeMigration } from "../knowledgeMigrationOperations";
import {
  isKnowledgeMigrationReportComplete,
  KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
  type RecallMigrationPreview,
  type RecallMigrationReport,
} from "../types";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

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

const report: RecallMigrationReport = {
  sourcePath: preview.sourcePath,
  legacyDataPath: preview.legacyDataPath,
  sourceFingerprint: preview.sourceFingerprint,
  mainStatus: "completed",
  vectorStatus: "partial",
  sourceCollections: 2,
  migratedCollections: 2,
  sourceEntries: 10,
  migratedEntries: 10,
  skippedEntries: 0,
  sourceVectors: 8,
  migratedVectors: 6,
  pendingVectors: 2,
  sourceVectorModels: 1,
  migratedVectorModels: 1,
  tagVectorCount: 3,
  recoveryInstructions: ["keep source"],
  issues: [],
};

const release: ReleaseNoteManifest = {
  version: "0.7.0-alpha.1",
  revision: 2,
  channel: "prerelease",
  title: "release",
  summary: "release",
  publishedAt: "2026-07-25",
  body: "# release",
  contributionIds: [KNOWLEDGE_MIGRATION_CONTRIBUTION_ID],
};

describe("knowledge migration completion", () => {
  it.each([
    [
      "partial vector status",
      { vectorStatus: "partial", pendingVectors: 0, issues: [] },
    ],
    [
      "pending vectors",
      { vectorStatus: "completed", pendingVectors: 1, issues: [] },
    ],
    [
      "reported issues",
      {
        vectorStatus: "completed",
        pendingVectors: 0,
        issues: [{ path: "legacy.json", message: "invalid" }],
      },
    ],
  ])("rejects %s", (_name, overrides) => {
    expect(
      isKnowledgeMigrationReportComplete({
        ...report,
        ...overrides,
        mainStatus: "completed",
      })
    ).toBe(false);
  });
});

describe("knowledge migration contribution", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    upgradeContributionRegistry.clear();
    registerKnowledgeMigrationContribution();
  });

  it("groups migration work into one user-facing step", () => {
    const definition = upgradeContributionRegistry.get(
      KNOWLEDGE_MIGRATION_CONTRIBUTION_ID
    )!;

    expect(definition.steps.map((step) => step.id)).toEqual(["migration"]);
    expect(definition.steps[0].footer).toBe("step");
  });

  it.each([
    ["unknown-baseline fresh install", undefined],
    ["existing user without legacy data", "0.6.9"],
  ])(
    "does not create migration work for %s when domain detection finds no source",
    async (_scenario, previousLaunchedVersion) => {
      mocks.invoke.mockResolvedValueOnce(null);
      const definition = upgradeContributionRegistry.get(
        KNOWLEDGE_MIGRATION_CONTRIBUTION_ID
      )!;

      const detected = await definition.detect({
        currentVersion: release.version,
        previousLaunchedVersion,
      });

      expect(detected).toBeNull();
      expect(mocks.invoke).toHaveBeenCalledOnce();
      expect(mocks.invoke).toHaveBeenCalledWith(
        "recall_preview_legacy_migration"
      );
    }
  );

  it("detects legacy data as a module-blocking pending contribution", async () => {
    mocks.invoke.mockResolvedValueOnce(preview);
    const definition = upgradeContributionRegistry.get(
      KNOWLEDGE_MIGRATION_CONTRIBUTION_ID
    )!;

    expect(definition.appliesTo([release])).toBe(true);
    const detected = await definition.detect({
      currentVersion: release.version,
    });

    expect(detected).toMatchObject({
      instanceKey:
        "knowledge-to-recall-v2:fingerprint-1:not_started:not_started:0",
      blockingScope: "module",
      status: "pending",
    });
    expect(mocks.invoke).toHaveBeenCalledWith(
      "recall_preview_legacy_migration"
    );
  });

  it("executes only after confirmation and records partial vector results", async () => {
    mocks.invoke.mockResolvedValueOnce(preview);
    const definition = upgradeContributionRegistry.get(
      KNOWLEDGE_MIGRATION_CONTRIBUTION_ID
    )!;
    const detected = await definition.detect({
      currentVersion: release.version,
    });
    const context: UpgradeFlowContext = {
      mode: "automatic",
      currentVersion: release.version,
      releaseVersions: [release.version],
      primaryReleaseVersion: release.version,
      transition: "upgrade",
      contributions: {
        [KNOWLEDGE_MIGRATION_CONTRIBUTION_ID]: {
          ...detected!,
          revision: definition.revision,
          title: definition.title,
        },
      },
    };
    const migrationStep = definition.steps[0];
    expect(await migrationStep.validate?.(context)).toBe(false);
    const snapshot = context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID]
      .snapshot as any;
    snapshot.backupConfirmed = true;
    snapshot.riskConfirmed = true;

    mocks.invoke.mockResolvedValueOnce(preview);
    mocks.invoke.mockResolvedValueOnce(report);
    await executeKnowledgeMigration(context);

    expect(mocks.invoke).toHaveBeenLastCalledWith(
      "recall_run_legacy_migration",
      {
        confirmation: {
          migrationId: "knowledge-to-recall-v2",
          sourceFingerprint: "fingerprint-1",
          confirmed: true,
        },
      }
    );
    expect(snapshot.executionStatus).toBe("partial");
    expect(snapshot.report.pendingVectors).toBe(2);
    expect(await migrationStep.validate?.(context)).toBe(true);
    expect(
      context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID].status
    ).toBe("pending");
  });

  it("requires DELETE only when a complete report is selected for cleanup", async () => {
    mocks.invoke.mockResolvedValueOnce(preview);
    const definition = upgradeContributionRegistry.get(
      KNOWLEDGE_MIGRATION_CONTRIBUTION_ID
    )!;
    const detected = await definition.detect({
      currentVersion: release.version,
    });
    const context: UpgradeFlowContext = {
      mode: "automatic",
      currentVersion: release.version,
      releaseVersions: [release.version],
      primaryReleaseVersion: release.version,
      transition: "upgrade",
      contributions: {
        [KNOWLEDGE_MIGRATION_CONTRIBUTION_ID]: {
          ...detected!,
          revision: definition.revision,
          title: definition.title,
        },
      },
    };
    const snapshot = context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID]
      .snapshot as any;
    snapshot.report = {
      ...report,
      vectorStatus: "completed",
      pendingVectors: 0,
      issues: [],
    };
    snapshot.cleanupChoice = "cleanup";

    expect(definition.steps[0].validate?.(context)).toBe(false);
    snapshot.cleanupConfirmation = "DELETE";
    expect(definition.steps[0].validate?.(context)).toBe(true);
  });

  it("re-runs migration after a partial main-data report", async () => {
    const definition = upgradeContributionRegistry.get(
      KNOWLEDGE_MIGRATION_CONTRIBUTION_ID
    )!;
    const detected = {
      instanceKey: "migration:fingerprint:not_started:not_started:0",
      blockingScope: "module" as const,
      status: "pending" as const,
      snapshot: {
        preview,
        backupConfirmed: true,
        riskConfirmed: true,
        executionStatus: "pending" as const,
        cleanupChoice: "keep" as const,
        cleanupConfirmation: "",
      },
    };
    const context: UpgradeFlowContext = {
      mode: "automatic",
      currentVersion: release.version,
      releaseVersions: [release.version],
      primaryReleaseVersion: release.version,
      transition: "upgrade",
      contributions: {
        [KNOWLEDGE_MIGRATION_CONTRIBUTION_ID]: {
          ...detected,
          revision: definition.revision,
          title: definition.title,
        },
      },
    };
    const partial = {
      ...report,
      mainStatus: "partial",
      vectorStatus: "not_started",
    };
    const complete = {
      ...report,
      mainStatus: "completed",
      vectorStatus: "completed",
      pendingVectors: 0,
      issues: [],
    };
    mocks.invoke
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(partial)
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(complete);
    const migrationStep = definition.steps[0];

    await executeKnowledgeMigration(context);
    expect(migrationStep.validate?.(context)).toBe(false);
    await executeKnowledgeMigration(context);

    expect(mocks.invoke).toHaveBeenCalledTimes(4);
    expect(migrationStep.validate?.(context)).toBe(true);
    expect(
      context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID].status
    ).toBe("completed");
  });
});
