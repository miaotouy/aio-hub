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

import type { GuidedFlowStep } from "@/services/guided-flow";

export const APP_UPGRADE_FLOW_ID = "app-upgrade";
export const UPGRADE_FLOW_SCHEMA_VERSION = 1;

export type ReleaseChannel = "stable" | "prerelease";
export type UnknownBaselinePolicy = "manual-only" | "show-current";
export type UpgradeTransition =
  "upgrade" | "downgrade" | "same-version" | "unknown-baseline";

export interface ReleaseNoteManifest {
  version: string;
  revision: number;
  channel: ReleaseChannel;
  title: string;
  summary: string;
  publishedAt: string;
  body: string;
  highlights?: string[];
  contributionIds?: string[];
  unknownBaselinePolicy?: UnknownBaselinePolicy;
}

export interface ReleaseNoteAcknowledgement {
  status: "completed" | "skipped";
  acknowledgedAt: string;
}

export interface AppLifecycleState {
  version?: string;
  schemaVersion: 1;
  lastLaunchedVersion?: string;
  releaseNotes: Record<string, ReleaseNoteAcknowledgement>;
}

export interface UpgradeContributionSnapshot<TSnapshot = unknown> {
  instanceKey: string;
  snapshot: TSnapshot;
  blockingScope: "none" | "module" | "application";
  status?: "pending" | "completed" | "unavailable";
  reportRef?: string;
}

export interface UpgradeContributionState extends UpgradeContributionSnapshot {
  revision: number;
  title: string;
  description?: string;
}

export interface UpgradeFlowContext extends Record<string, unknown> {
  mode: "automatic" | "manual-replay";
  currentVersion: string;
  previousLaunchedVersion?: string;
  releaseVersions: string[];
  primaryReleaseVersion: string;
  transition: UpgradeTransition;
  contributions: Record<string, UpgradeContributionState>;
}

export interface UpgradeContributionDefinition<TSnapshot = unknown> {
  id: string;
  revision: number;
  title: string;
  description?: string;
  order: number;
  appliesTo(releases: ReleaseNoteManifest[]): boolean;
  detect(input: {
    currentVersion: string;
    previousLaunchedVersion?: string;
  }): Promise<UpgradeContributionSnapshot<TSnapshot> | null>;
  steps: GuidedFlowStep<UpgradeFlowContext>[];
}

export interface UpgradeCenterStatus {
  currentVersion: string;
  releaseNotesAvailable: boolean;
  pending: boolean;
  status?: "pending" | "in-progress" | "deferred" | "failed";
}
