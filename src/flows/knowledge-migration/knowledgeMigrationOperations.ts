// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import { knowledgeMigrationService } from "./knowledgeMigrationService";
import {
  getKnowledgeMigrationSnapshot,
  KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
  isKnowledgeMigrationReportComplete,
} from "./types";

export async function executeKnowledgeMigration(
  context: UpgradeFlowContext
): Promise<void> {
  const contribution =
    context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID];
  const snapshot = getKnowledgeMigrationSnapshot(context);
  if (isKnowledgeMigrationReportComplete(snapshot.report)) return;

  const preview = await knowledgeMigrationService.preview();
  if (!preview) {
    throw new Error("迁移源已不存在，请重新检测后再试");
  }
  if (
    preview.migrationId !== snapshot.preview.migrationId ||
    preview.sourceFingerprint !== snapshot.preview.sourceFingerprint
  ) {
    throw new Error("迁移源已发生变化，请重新检测并确认后再试");
  }

  const previousReport = snapshot.report;
  snapshot.preview = preview;
  snapshot.report = undefined;
  snapshot.removedPaths = undefined;
  snapshot.executionStatus = "running";

  try {
    const report = await knowledgeMigrationService.run(
      preview.migrationId,
      preview.sourceFingerprint
    );
    snapshot.report = report;
    const completed = isKnowledgeMigrationReportComplete(report);
    snapshot.executionStatus = completed ? "completed" : "partial";
    contribution.status = completed ? "completed" : "pending";
    contribution.blockingScope = completed ? "none" : "module";
  } catch (error) {
    snapshot.report = previousReport;
    snapshot.executionStatus = "failed";
    contribution.status = "pending";
    contribution.blockingScope = "module";
    throw error;
  }
}
