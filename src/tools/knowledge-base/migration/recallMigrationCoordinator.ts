// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import {
  guidedFlowManager,
  guidedFlowRegistry,
  type GuidedFlowOpenOptions,
} from "@/services/guided-flow";
import { knowledgeMigrationService } from "./knowledgeMigrationService";
import {
  createRecallMigrationFlowDefinition,
  detectRecallMigration,
  isRecallMigrationPending,
  type RecallMigrationDetection,
} from "./recallMigrationFlow";
import { RECALL_MIGRATION_FLOW_ID } from "./types";

let initializationPromise: Promise<void> | null = null;

function registerRecallMigrationFlow(
  detection: RecallMigrationDetection
): void {
  const definition = createRecallMigrationFlowDefinition(detection);
  if (guidedFlowRegistry.get(RECALL_MIGRATION_FLOW_ID)) {
    guidedFlowRegistry.replace(definition);
  } else {
    guidedFlowRegistry.register(definition);
  }
}

export async function refreshRecallMigrationFlow(options?: {
  trigger?: boolean;
}): Promise<RecallMigrationDetection | null> {
  await guidedFlowManager.initialize();
  const detection = await detectRecallMigration();
  if (!detection) return null;

  registerRecallMigrationFlow(detection);
  if (options?.trigger && isRecallMigrationPending(detection)) {
    await guidedFlowManager.trigger(RECALL_MIGRATION_FLOW_ID);
  }
  return detection;
}

export async function initializeRecallMigrationFlow(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = refreshRecallMigrationFlow({ trigger: true })
      .then(() => undefined)
      .finally(() => {
        initializationPromise = null;
      });
  }
  await initializationPromise;
}

export async function openRecallMigrationFlow(
  options: GuidedFlowOpenOptions = { mode: "resume" }
): Promise<void> {
  const detection = await refreshRecallMigrationFlow();
  if (!detection) {
    throw new Error("当前未检测到可查看的旧 Recall 数据迁移记录");
  }
  await guidedFlowManager.open(RECALL_MIGRATION_FLOW_ID, options);
}

export async function openRecallMigrationFlowForDebug(): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error("Recall 迁移调试入口仅在开发环境可用");
  }
  await knowledgeMigrationService.resetMigrationStateForDebug();
  await refreshRecallMigrationFlow();
  await guidedFlowManager.open(RECALL_MIGRATION_FLOW_ID, { mode: "restart" });
}
