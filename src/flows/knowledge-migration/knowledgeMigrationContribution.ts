// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type { UpgradeContributionDefinition } from "@/flows/upgrade/types";
import { upgradeContributionRegistry } from "@/flows/upgrade/upgradeContributionRegistry";
import MigrationCleanupStep from "./components/MigrationCleanupStep.vue";
import MigrationPlanStep from "./components/MigrationPlanStep.vue";
import MigrationResultStep from "./components/MigrationResultStep.vue";
import { knowledgeMigrationService } from "./knowledgeMigrationService";
import {
  getKnowledgeMigrationSnapshot,
  KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
  isKnowledgeMigrationReportComplete,
  type KnowledgeMigrationSnapshot,
} from "./types";

const definition: UpgradeContributionDefinition<KnowledgeMigrationSnapshot> = {
  id: KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
  revision: 2,
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
      id: "plan",
      title: "迁移方案与确认",
      description: "核对旧数据、处理方案和风险，并在写入前集中确认。",
      component: MigrationPlanStep,
      validate: (context) => {
        const snapshot = getKnowledgeMigrationSnapshot(context);
        return (
          snapshot.preview.mainStatus === "completed" ||
          (snapshot.backupConfirmed && snapshot.riskConfirmed)
        );
      },
      nextLabel: "确认并开始迁移",
    },
    {
      id: "result",
      title: "迁移与校验",
      description: "执行迁移并在同一页展示最终校验报告。",
      component: MigrationResultStep,
      async onEnter(context) {
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
      },
      validate: (context) =>
        getKnowledgeMigrationSnapshot(context).report?.mainStatus ===
        "completed",
      nextLabel: "继续",
    },
    {
      id: "cleanup",
      title: "旧数据清理",
      description: "清理是独立操作；默认保留旧目录。",
      component: MigrationCleanupStep,
      when: (context) => {
        const snapshot = getKnowledgeMigrationSnapshot(context);
        const report = snapshot.report;
        return Boolean(
          isKnowledgeMigrationReportComplete(report) && !snapshot.removedPaths
        );
      },
      validate: (context) => {
        const snapshot = getKnowledgeMigrationSnapshot(context);
        return (
          snapshot.cleanupChoice === "keep" ||
          snapshot.cleanupConfirmation === "DELETE"
        );
      },
      async onNext(context) {
        const snapshot = getKnowledgeMigrationSnapshot(context);
        if (snapshot.cleanupChoice !== "cleanup") return;
        snapshot.removedPaths = await knowledgeMigrationService.cleanup(
          snapshot.preview.sourceFingerprint
        );
      },
      nextLabel: "确认清理选择",
    },
  ],
};

export function registerKnowledgeMigrationContribution(): void {
  if (upgradeContributionRegistry.get(definition.id)) return;
  upgradeContributionRegistry.register(definition);
}
