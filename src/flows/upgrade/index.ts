// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { getAppContext } from "@/config/appContext";
import {
  knowledgeMigrationService,
  registerKnowledgeMigrationContribution,
} from "@/flows/knowledge-migration";
import {
  guidedFlowManager,
  guidedFlowRegistry,
  type GuidedFlowState,
} from "@/services/guided-flow";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { appLifecycleService } from "./appLifecycleService";
import {
  detectUpgradeTransition,
  normalizeAppVersion,
  releaseNotesRegistry,
} from "./releaseNotesRegistry";
import { registerBuiltInReleaseNotes } from "./releases";
import type {
  ReleaseNoteManifest,
  UpgradeCenterStatus,
  UpgradeContributionState,
  UpgradeFlowContext,
} from "./types";
import { APP_UPGRADE_FLOW_ID } from "./types";
import {
  composeUpgradeFlowDefinition,
  createManualReplayContext,
} from "./upgradeFlowComposer";
import { upgradeContributionRegistry } from "./upgradeContributionRegistry";

const logger = createModuleLogger("flows/upgrade");
const errorHandler = createModuleErrorHandler("flows/upgrade");
const RECOVERABLE_STATUSES = new Set([
  "pending",
  "in-progress",
  "deferred",
  "failed",
]);

let initializationPromise: Promise<void> | null = null;
let initializedVersion: string | null = null;

function isRecoverableState(
  state: GuidedFlowState | undefined,
  currentVersion: string
): state is GuidedFlowState<UpgradeFlowContext> {
  const context = state?.context as UpgradeFlowContext | undefined;
  return Boolean(
    state &&
    RECOVERABLE_STATUSES.has(state.status) &&
    context?.currentVersion === currentVersion
  );
}

function manifestsFromState(
  state: GuidedFlowState<UpgradeFlowContext>
): ReleaseNoteManifest[] {
  return state
    .context!.releaseVersions.map((version) =>
      releaseNotesRegistry.get(version)
    )
    .filter((manifest) => manifest !== undefined);
}

async function detectContributions(
  manifests: ReleaseNoteManifest[],
  currentVersion: string,
  previousLaunchedVersion?: string
): Promise<Record<string, UpgradeContributionState>> {
  const contributions: Record<string, UpgradeContributionState> = {};
  for (const definition of upgradeContributionRegistry.getAll()) {
    if (!definition.appliesTo(manifests)) continue;
    try {
      const detected = await definition.detect({
        currentVersion,
        previousLaunchedVersion,
      });
      if (!detected) continue;
      contributions[definition.id] = {
        ...detected,
        revision: definition.revision,
        title: definition.title,
        description: definition.description,
        status: detected.status ?? "pending",
      };
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: `检测升级事项“${definition.title}”失败`,
        showToUser: false,
        context: { contributionId: definition.id },
      });
      contributions[definition.id] = {
        instanceKey: `unavailable:${definition.id}:${definition.revision}`,
        revision: definition.revision,
        title: definition.title,
        description: definition.description,
        blockingScope: "module",
        status: "unavailable",
        snapshot: null,
      };
    }
  }
  return contributions;
}

async function initializeUpgradeFlowInternal(): Promise<void> {
  registerBuiltInReleaseNotes();
  registerKnowledgeMigrationContribution();
  await guidedFlowManager.initialize();

  const currentVersion = normalizeAppVersion(getAppContext().appVersion);
  const lifecycle = await appLifecycleService.load();
  const transition = detectUpgradeTransition(
    currentVersion,
    lifecycle.lastLaunchedVersion
  );
  const existingState = guidedFlowManager.getState(APP_UPGRADE_FLOW_ID);
  const recoverable = isRecoverableState(existingState, currentVersion);
  const automaticManifests = recoverable
    ? manifestsFromState(existingState)
    : releaseNotesRegistry.selectAutomatic(currentVersion, lifecycle);
  const currentManifest = releaseNotesRegistry.get(currentVersion);
  const compositionManifests =
    automaticManifests.length > 0
      ? automaticManifests
      : currentManifest
        ? [currentManifest]
        : [];
  const contributions = await detectContributions(
    compositionManifests,
    currentVersion,
    lifecycle.lastLaunchedVersion
  );
  const contributionDefinitions = upgradeContributionRegistry
    .getAll()
    .filter((definition) => Boolean(contributions[definition.id]));

  if (compositionManifests.length > 0 || contributionDefinitions.length > 0) {
    const definition = composeUpgradeFlowDefinition({
      currentVersion,
      previousLaunchedVersion: lifecycle.lastLaunchedVersion,
      transition,
      manifests: compositionManifests,
      contributions,
      contributionDefinitions,
    });
    if (guidedFlowRegistry.get(APP_UPGRADE_FLOW_ID)) {
      guidedFlowRegistry.replace(definition);
    } else {
      guidedFlowRegistry.register(definition);
    }
  }

  const hasPendingContribution = Object.values(contributions).some(
    (item) => item.status !== "completed"
  );
  const shouldTrigger =
    recoverable || automaticManifests.length > 0 || hasPendingContribution;

  if (shouldTrigger && guidedFlowRegistry.get(APP_UPGRADE_FLOW_ID)) {
    await guidedFlowManager.trigger(APP_UPGRADE_FLOW_ID);
  }

  await appLifecycleService.markLaunched(currentVersion);
  initializedVersion = currentVersion;
  logger.info("版本升级引导初始化完成", {
    currentVersion,
    transition,
    releaseCount: automaticManifests.length,
    contributionCount: Object.keys(contributions).length,
    triggered: shouldTrigger,
  });
}

export async function initializeUpgradeFlow(): Promise<void> {
  const currentVersion = normalizeAppVersion(getAppContext().appVersion);
  if (initializedVersion === currentVersion) return;
  if (!initializationPromise) {
    initializationPromise = initializeUpgradeFlowInternal().finally(() => {
      initializationPromise = null;
    });
  }
  await initializationPromise;
}

export async function refreshUpgradeFlow(): Promise<void> {
  initializedVersion = null;
  await initializeUpgradeFlow();
}

export type UpgradeFlowDebugMode = "restart" | "redetect" | "reset-migration";

export async function openUpgradeFlowForDebug(
  mode: UpgradeFlowDebugMode
): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error("更新引导调试入口仅在开发环境可用");
  }

  if (mode === "reset-migration") {
    await knowledgeMigrationService.resetMigrationStateForDebug();
  }
  if (mode !== "restart") {
    await refreshUpgradeFlow();
  } else {
    await initializeUpgradeFlow();
  }

  if (!guidedFlowRegistry.get(APP_UPGRADE_FLOW_ID)) {
    throw new Error("当前没有可调试的更新引导");
  }
  await guidedFlowManager.open(APP_UPGRADE_FLOW_ID, { mode: "restart" });
}

export async function openCurrentReleaseNotes(): Promise<void> {
  await initializeUpgradeFlow();
  const currentVersion = normalizeAppVersion(getAppContext().appVersion);
  if (!releaseNotesRegistry.get(currentVersion)) {
    throw new Error("此构建未包含当前版本的本地版本说明");
  }
  if (!guidedFlowRegistry.get(APP_UPGRADE_FLOW_ID)) {
    throw new Error("当前版本说明流程尚未注册");
  }
  await guidedFlowManager.open(APP_UPGRADE_FLOW_ID, {
    mode: "replay",
    context: createManualReplayContext(currentVersion),
  });
}

export async function resumePendingUpgrade(): Promise<void> {
  await initializeUpgradeFlow();
  const state = guidedFlowManager.getState(APP_UPGRADE_FLOW_ID);
  if (!state || !RECOVERABLE_STATUSES.has(state.status)) {
    throw new Error("当前没有待继续的升级事项");
  }
  await guidedFlowManager.open(APP_UPGRADE_FLOW_ID, { mode: "resume" });
}

function readUpgradeCenterStatus(): UpgradeCenterStatus {
  const currentVersion = normalizeAppVersion(getAppContext().appVersion);
  const state = guidedFlowManager.getState(APP_UPGRADE_FLOW_ID);
  const pending = Boolean(state && RECOVERABLE_STATUSES.has(state.status));
  return {
    currentVersion,
    releaseNotesAvailable: Boolean(releaseNotesRegistry.get(currentVersion)),
    pending,
    status: pending
      ? (state!.status as UpgradeCenterStatus["status"])
      : undefined,
  };
}

export async function getUpgradeCenterStatus(): Promise<UpgradeCenterStatus> {
  await initializeUpgradeFlow();
  return readUpgradeCenterStatus();
}

export function subscribeUpgradeCenterStatus(
  listener: (status: UpgradeCenterStatus) => void
): () => void {
  return guidedFlowManager.subscribe(() => {
    listener(readUpgradeCenterStatus());
  });
}
