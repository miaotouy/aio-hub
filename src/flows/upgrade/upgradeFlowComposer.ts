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

import type {
  GuidedFlowDefinition,
  GuidedFlowStep,
} from "@/services/guided-flow";
import UpgradeActionsStep from "./components/UpgradeActionsStep.vue";
import UpgradeCompleteStep from "./components/UpgradeCompleteStep.vue";
import UpgradeOverviewStep from "./components/UpgradeOverviewStep.vue";
import UpgradeReleaseNotesStep from "./components/UpgradeReleaseNotesStep.vue";
import { appLifecycleService } from "./appLifecycleService";
import type {
  ReleaseNoteManifest,
  UpgradeContributionDefinition,
  UpgradeContributionState,
  UpgradeFlowContext,
  UpgradeTransition,
} from "./types";
import { APP_UPGRADE_FLOW_ID, UPGRADE_FLOW_SCHEMA_VERSION } from "./types";

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildReleaseFingerprint(manifests: ReleaseNoteManifest[]): string {
  return stableHash(
    manifests.map((item) => `${item.version}:${item.revision}`).join("|") ||
      "none"
  );
}

function buildContributionFingerprint(
  contributions: Record<string, UpgradeContributionState>
): string {
  return stableHash(
    Object.entries(contributions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([id, item]) =>
          `${id}:${item.revision}:${item.instanceKey}:${item.status ?? "pending"}`
      )
      .join("|") || "none"
  );
}

function wrapContributionStep(
  contribution: UpgradeContributionDefinition,
  step: GuidedFlowStep<UpgradeFlowContext>
): GuidedFlowStep<UpgradeFlowContext> {
  const originalWhen = step.when;
  return {
    ...step,
    id: `contribution:${contribution.id}:${step.id}`,
    when: (context) => {
      const contributionState = context.contributions[contribution.id];
      return (
        context.mode === "automatic" &&
        Boolean(contributionState) &&
        contributionState.status !== "unavailable" &&
        (originalWhen?.(context) ?? true)
      );
    },
  };
}

export interface ComposeUpgradeFlowInput {
  currentVersion: string;
  previousLaunchedVersion?: string;
  transition: UpgradeTransition;
  manifests: ReleaseNoteManifest[];
  contributions: Record<string, UpgradeContributionState>;
  contributionDefinitions: UpgradeContributionDefinition[];
}

export function composeUpgradeFlowDefinition(
  input: ComposeUpgradeFlowInput
): GuidedFlowDefinition<UpgradeFlowContext> {
  const manifests = [...input.manifests];
  const primaryReleaseVersion =
    manifests.find((item) => item.version === input.currentVersion)?.version ??
    manifests[manifests.length - 1]?.version ??
    input.currentVersion;
  const releaseVersions = manifests.map((item) => item.version);
  const contributionSteps = input.contributionDefinitions.flatMap(
    (contribution) =>
      contribution.steps.map((step) => wrapContributionStep(contribution, step))
  );
  const blockingScopes = Object.values(input.contributions).map(
    (item) => item.blockingScope
  );
  const blockingScope = blockingScopes.includes("application")
    ? "application"
    : blockingScopes.includes("module")
      ? "module"
      : "none";
  const version = [
    `app-upgrade@${UPGRADE_FLOW_SCHEMA_VERSION}`,
    input.currentVersion,
    buildReleaseFingerprint(manifests),
    buildContributionFingerprint(input.contributions),
  ].join("/");

  const createContext = (): UpgradeFlowContext => ({
    mode: "automatic",
    currentVersion: input.currentVersion,
    previousLaunchedVersion: input.previousLaunchedVersion,
    releaseVersions,
    primaryReleaseVersion,
    transition: input.transition,
    contributions: structuredClone(input.contributions),
  });

  return {
    id: APP_UPGRADE_FLOW_ID,
    version,
    title: "版本升级说明",
    description: `AIO Hub ${input.currentVersion} 的版本变化与待处理事项`,
    trigger: "version-changed",
    priority: blockingScope === "application" ? 100 : 50,
    resumable: true,
    dismissible: true,
    dismissLabel: "稍后查看",
    skippable: blockingScope === "none",
    skipLabel: "跳过本版本说明",
    blockingScope,
    createContext,
    onCompleted: async (event) => {
      if (event.mode !== "persistent") return;
      await appLifecycleService.acknowledgeReleaseNotes(
        event.context.releaseVersions,
        "completed"
      );
    },
    onSkipped: async (event) => {
      if (event.mode !== "persistent") return;
      await appLifecycleService.acknowledgeReleaseNotes(
        event.context.releaseVersions,
        "skipped"
      );
    },
    steps: [
      {
        id: "overview",
        title: "升级概览",
        description: "先了解本次版本变化和需要处理的事项。",
        component: UpgradeOverviewStep,
        when: (context) => context.mode === "automatic",
      },
      {
        id: "release-notes",
        title: "版本说明",
        description: "以下内容来自当前安装包内置的离线版本说明。",
        component: UpgradeReleaseNotesStep,
        nextLabel: "我知道了",
        when: (context) => context.releaseVersions.length > 0,
      },
      {
        id: "upgrade-actions",
        title: "升级事项",
        description: "这些事项由对应模块只读检测，不会在打开页面时自动执行。",
        component: UpgradeActionsStep,
        when: (context) =>
          context.mode === "automatic" &&
          Object.keys(context.contributions).length > 0,
      },
      ...contributionSteps,
      {
        id: "complete",
        title: "完成",
        component: UpgradeCompleteStep,
        nextLabel: "完成",
        when: (context) => context.mode === "automatic",
      },
    ],
  };
}

export function createManualReplayContext(
  currentVersion: string
): Partial<UpgradeFlowContext> {
  return {
    mode: "manual-replay",
    currentVersion,
    releaseVersions: [currentVersion],
    primaryReleaseVersion: currentVersion,
    transition: "same-version",
    contributions: {},
  };
}
