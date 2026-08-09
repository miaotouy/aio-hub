// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type { GuidedFlowDefinition } from "@/services/guided-flow";
import MigrationStep from "./components/MigrationStep.vue";
import { knowledgeMigrationService } from "./knowledgeMigrationService";
import {
  canCompleteKnowledgeMigration,
  getKnowledgeMigrationSnapshot,
  isKnowledgeMigrationReportComplete,
  RECALL_MIGRATION_FLOW_ID,
  RECALL_MIGRATION_FLOW_SCHEMA_VERSION,
  type KnowledgeMigrationSnapshot,
  type RecallMigrationFlowContext,
  type RecallMigrationPreview,
  type RecallMigrationReport,
} from "./types";

export interface RecallMigrationDetection {
  preview: RecallMigrationPreview;
  report?: RecallMigrationReport;
  snapshot: KnowledgeMigrationSnapshot;
}

function createSnapshot(
  preview: RecallMigrationPreview,
  report: RecallMigrationReport | null
): KnowledgeMigrationSnapshot {
  const completed = isKnowledgeMigrationReportComplete(report);
  return {
    preview,
    backupConfirmed: false,
    executionStatus: completed ? "completed" : report ? "partial" : "pending",
    report: report ?? undefined,
    cleanupChoice: "keep",
    cleanupConfirmation: "",
  };
}

export async function detectRecallMigration(): Promise<RecallMigrationDetection | null> {
  const preview = await knowledgeMigrationService.preview();
  if (!preview) return null;

  const report =
    preview.mainStatus === "not_started"
      ? null
      : await knowledgeMigrationService.inspect();
  return {
    preview,
    report: report ?? undefined,
    snapshot: createSnapshot(preview, report),
  };
}

export function isRecallMigrationPending(
  detection: RecallMigrationDetection
): boolean {
  return !isKnowledgeMigrationReportComplete(detection.report);
}

function buildFlowVersion(detection: RecallMigrationDetection): string {
  const { preview } = detection;
  return [
    `recall-migration@${RECALL_MIGRATION_FLOW_SCHEMA_VERSION}`,
    preview.migrationId,
    preview.sourceFingerprint,
    preview.mainStatus,
    preview.vectorStatus,
    preview.pendingVectors,
    preview.issueCount,
  ].join("/");
}

export function createRecallMigrationFlowDefinition(
  detection: RecallMigrationDetection
): GuidedFlowDefinition<RecallMigrationFlowContext> {
  return {
    id: RECALL_MIGRATION_FLOW_ID,
    version: buildFlowVersion(detection),
    title: "旧 Recall 数据迁移",
    description: "确认迁移方案，执行校验，并决定是否清理旧目录。",
    trigger: "pending-migration",
    priority: 30,
    resumable: true,
    dismissible: true,
    dismissLabel: "稍后处理",
    blockingScope: "module",
    createContext: () => ({
      migration: structuredClone(detection.snapshot),
    }),
    steps: [
      {
        id: "migration",
        title: "旧 Recall 数据迁移",
        description: "确认迁移方案，执行校验，并决定是否清理旧目录。",
        component: MigrationStep,
        footer: "step",
        validate: (context) =>
          canCompleteKnowledgeMigration(getKnowledgeMigrationSnapshot(context)),
        async onNext(context) {
          const snapshot = getKnowledgeMigrationSnapshot(context);
          if (
            snapshot.cleanupChoice !== "cleanup" ||
            !isKnowledgeMigrationReportComplete(snapshot.report)
          ) {
            return;
          }
          snapshot.removedPaths = await knowledgeMigrationService.cleanup(
            snapshot.preview.sourceFingerprint
          );
        },
        nextLabel: "完成迁移事项",
      },
    ],
  };
}
