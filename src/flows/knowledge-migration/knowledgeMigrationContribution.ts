// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type { UpgradeContributionDefinition } from "@/flows/upgrade/types";
import { upgradeContributionRegistry } from "@/flows/upgrade/upgradeContributionRegistry";
import MigrationStep from "./components/MigrationStep.vue";
import { knowledgeMigrationService } from "./knowledgeMigrationService";
import {
  canCompleteKnowledgeMigration,
  getKnowledgeMigrationSnapshot,
  KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
  isKnowledgeMigrationReportComplete,
  type KnowledgeMigrationSnapshot,
} from "./types";

const definition: UpgradeContributionDefinition<KnowledgeMigrationSnapshot> = {
  id: KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
  revision: 4,
  title: "旧知识库数据迁移",
  description: "将旧文件目录中的 Recall 数据迁移到新的 SQLite 存储。",
  order: 100,
  appliesTo: () => true,
  async detect() {
    const preview = await knowledgeMigrationService.preview();
    if (!preview) return null;
    const report =
      preview.mainStatus === "not_started"
        ? null
        : await knowledgeMigrationService.inspect();
    const completed = isKnowledgeMigrationReportComplete(report);
    return {
      instanceKey: [
        preview.migrationId,
        preview.sourceFingerprint,
        preview.mainStatus,
        preview.vectorStatus,
        preview.issueCount,
      ].join(":"),
      blockingScope: completed ? "none" : "module",
      status: completed ? "completed" : "pending",
      reportRef: `${preview.migrationId}:${preview.sourceFingerprint}`,
      snapshot: {
        preview,
        backupConfirmed: false,
        riskConfirmed: false,
        executionStatus: completed
          ? "completed"
          : report
            ? "partial"
            : "pending",
        report: report ?? undefined,
        cleanupChoice: "keep",
        cleanupConfirmation: "",
      },
    };
  },
  steps: [
    {
      id: "migration",
      title: "旧知识库数据迁移",
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

export function registerKnowledgeMigrationContribution(): void {
  if (upgradeContributionRegistry.get(definition.id)) return;
  upgradeContributionRegistry.register(definition);
}
