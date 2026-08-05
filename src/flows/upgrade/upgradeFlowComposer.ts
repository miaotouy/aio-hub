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
import UpgradeCompleteStep from "./components/UpgradeCompleteStep.vue";
import UpgradeSummaryStep from "./components/UpgradeSummaryStep.vue";
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
    title: "升级事项处理",
    description: `AIO Hub ${input.currentVersion} 检测到需要确认或执行的升级事项`,
    trigger: "version-changed",
    priority: blockingScope === "application" ? 100 : 50,
    resumable: true,
    dismissible: true,
    dismissLabel: "稍后处理",
    skippable: blockingScope === "none",
    skipLabel: "跳过可选事项",
    blockingScope,
    createContext,
    steps: [
      {
        id: "summary",
        title: "版本概览",
        description: "确认检测到的升级事项及其影响。",
        component: UpgradeSummaryStep,
        nextLabel: "继续",
        when: (context) => context.mode === "automatic",
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
