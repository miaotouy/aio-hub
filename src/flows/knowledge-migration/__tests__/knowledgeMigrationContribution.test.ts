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
import {
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

describe("knowledge migration contribution", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    upgradeContributionRegistry.clear();
    registerKnowledgeMigrationContribution();
  });

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
    const backupStep = definition.steps.find((step) => step.id === "backup")!;
    expect(await backupStep.validate?.(context)).toBe(false);
    const snapshot = context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID]
      .snapshot as any;
    snapshot.backupConfirmed = true;
    snapshot.riskConfirmed = true;
    expect(await backupStep.validate?.(context)).toBe(true);

    mocks.invoke.mockResolvedValueOnce(report);
    const executeStep = definition.steps.find((step) => step.id === "execute")!;
    await executeStep.onEnter?.(context);

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
    expect(snapshot.executionStatus).toBe("completed");
    expect(snapshot.report.pendingVectors).toBe(2);
    expect(
      context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID].status
    ).toBe("completed");
  });
});
