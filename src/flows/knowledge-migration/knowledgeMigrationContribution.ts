// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import type { UpgradeContributionDefinition } from "@/flows/upgrade/types";
import { upgradeContributionRegistry } from "@/flows/upgrade/upgradeContributionRegistry";
import MigrationBackupStep from "./components/MigrationBackupStep.vue";
import MigrationCleanupStep from "./components/MigrationCleanupStep.vue";
import MigrationCompleteStep from "./components/MigrationCompleteStep.vue";
import MigrationDiscoveryStep from "./components/MigrationDiscoveryStep.vue";
import MigrationExecuteStep from "./components/MigrationExecuteStep.vue";
import MigrationPreviewStep from "./components/MigrationPreviewStep.vue";
import MigrationVerifyStep from "./components/MigrationVerifyStep.vue";
import { knowledgeMigrationService } from "./knowledgeMigrationService";
import {
  getKnowledgeMigrationSnapshot,
  KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
  type KnowledgeMigrationSnapshot,
} from "./types";

const definition: UpgradeContributionDefinition<KnowledgeMigrationSnapshot> = {
  id: KNOWLEDGE_MIGRATION_CONTRIBUTION_ID,
  revision: 1,
  title: "旧知识库数据迁移",
  description: "将旧文件目录中的 Recall 数据迁移到新的 SQLite 存储。",
  order: 100,
  appliesTo: () => true,
  async detect() {
    const preview = await knowledgeMigrationService.preview();
    if (!preview) return null;
    const completed = preview.mainStatus === "completed";
    const report =
      preview.mainStatus === "not_started"
        ? null
        : await knowledgeMigrationService.inspect();
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
      id: "discovery",
      title: "检测结果",
      description: "确认旧数据来源、规模和当前迁移状态。",
      component: MigrationDiscoveryStep,
    },
    {
      id: "preview",
      title: "迁移方案",
      description: "了解会保留、重建或无法自动处理的内容。",
      component: MigrationPreviewStep,
    },
    {
      id: "backup",
      title: "备份与确认",
      description: "执行前确认备份和不可逆写入风险。",
      component: MigrationBackupStep,
      when: (context) =>
        getKnowledgeMigrationSnapshot(context).preview.mainStatus !==
        "completed",
      validate: (context) => {
        const snapshot = getKnowledgeMigrationSnapshot(context);
        return snapshot.backupConfirmed && snapshot.riskConfirmed;
      },
      nextLabel: "确认并开始迁移",
    },
    {
      id: "execute",
      title: "执行迁移",
      description: "迁移期间请保持应用运行，不要修改旧数据目录。",
      component: MigrationExecuteStep,
      when: (context) =>
        getKnowledgeMigrationSnapshot(context).preview.mainStatus !==
        "completed",
      async onEnter(context) {
        const contribution =
          context.contributions[KNOWLEDGE_MIGRATION_CONTRIBUTION_ID];
        const snapshot = getKnowledgeMigrationSnapshot(context);
        if (snapshot.report?.mainStatus === "completed") return;
        snapshot.executionStatus = "running";
        try {
          const report = await knowledgeMigrationService.run(
            snapshot.preview.migrationId,
            snapshot.preview.sourceFingerprint
          );
          snapshot.report = report;
          snapshot.executionStatus =
            report.mainStatus === "completed" ? "completed" : "partial";
          contribution.status =
            report.mainStatus === "completed" ? "completed" : "pending";
          contribution.blockingScope =
            report.mainStatus === "completed" ? "none" : "module";
        } catch (error) {
          snapshot.executionStatus = "failed";
          contribution.status = "pending";
          throw error;
        }
      },
      validate: (context) =>
        Boolean(getKnowledgeMigrationSnapshot(context).report),
      nextLabel: "查看校验报告",
    },
    {
      id: "verify",
      title: "校验报告",
      description: "检查主数据、向量、待重建项和问题明细。",
      component: MigrationVerifyStep,
      validate: (context) =>
        getKnowledgeMigrationSnapshot(context).report?.mainStatus ===
        "completed",
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
          report &&
          report.mainStatus === "completed" &&
          report.vectorStatus === "completed" &&
          report.pendingVectors === 0 &&
          report.issues.length === 0 &&
          !snapshot.removedPaths
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
    {
      id: "complete",
      title: "完成",
      component: MigrationCompleteStep,
    },
  ],
};

export function registerKnowledgeMigrationContribution(): void {
  if (upgradeContributionRegistry.get(definition.id)) return;
  upgradeContributionRegistry.register(definition);
}
