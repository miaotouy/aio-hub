// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type { UpgradeFlowContext } from "@/flows/upgrade/types";

export const KNOWLEDGE_MIGRATION_CONTRIBUTION_ID = "knowledge-migration";
export const KNOWLEDGE_MIGRATION_ID = "knowledge-to-recall-v2";
export const KNOWLEDGE_MIGRATION_PROGRESS_EVENT =
  "recall://legacy-migration-progress";

export interface RecallMigrationIssue {
  path: string;
  message: string;
}

export interface RecallMigrationReport {
  sourcePath: string;
  legacyDataPath: string;
  sourceFingerprint: string;
  mainStatus: string;
  vectorStatus: string;
  sourceCollections: number;
  migratedCollections: number;
  sourceEntries: number;
  migratedEntries: number;
  skippedEntries: number;
  sourceVectors: number;
  migratedVectors: number;
  pendingVectors: number;
  sourceVectorModels: number;
  migratedVectorModels: number;
  tagVectorCount: number;
  recoveryInstructions: string[];
  issues: RecallMigrationIssue[];
}

export function isKnowledgeMigrationReportComplete(
  report: RecallMigrationReport | null | undefined
): report is RecallMigrationReport {
  return Boolean(
    report &&
    report.mainStatus === "completed" &&
    report.vectorStatus === "completed" &&
    report.pendingVectors === 0 &&
    report.issues.length === 0
  );
}

export interface RecallMigrationPreview {
  migrationId: string;
  sourceFingerprint: string;
  sourcePath: string;
  legacyDataPath: string;
  targetDescription: string;
  sourceCollections: number;
  sourceEntries: number;
  sourceVectors: number;
  preservedFields: string[];
  rebuiltFields: string[];
  unsupportedFields: string[];
  warnings: string[];
  requiresBackup: boolean;
  mainStatus: string;
  vectorStatus: string;
  pendingVectors: number;
  issueCount: number;
}

export interface RecallMigrationProgress {
  migrationId: string;
  phase: "main" | "vector" | "tag-pool" | "verify" | "completed";
  current: number;
  total: number;
  completedCollections: number;
  completedEntries: number;
  pendingVectors: number;
  issues: number;
}

export interface KnowledgeMigrationSnapshot {
  preview: RecallMigrationPreview;
  backupConfirmed: boolean;
  riskConfirmed: boolean;
  executionStatus: "pending" | "running" | "completed" | "partial" | "failed";
  report?: RecallMigrationReport;
  cleanupChoice: "keep" | "cleanup";
  cleanupConfirmation: string;
  removedPaths?: string[];
}

export function canCompleteKnowledgeMigration(
  snapshot: KnowledgeMigrationSnapshot
): boolean {
  if (snapshot.report?.mainStatus !== "completed") return false;
  if (
    isKnowledgeMigrationReportComplete(snapshot.report) &&
    snapshot.cleanupChoice === "cleanup"
  ) {
    return snapshot.cleanupConfirmation === "DELETE";
  }
  return true;
}

export function getKnowledgeMigrationSnapshot(
  context: UpgradeFlowContext
): KnowledgeMigrationSnapshot {
  const contribution =
    context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID];
  if (!contribution) throw new Error("知识库迁移事项上下文不存在");
  return contribution.snapshot as KnowledgeMigrationSnapshot;
}
