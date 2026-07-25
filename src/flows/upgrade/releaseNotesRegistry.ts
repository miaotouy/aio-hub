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

import { compareVersions, validate } from "compare-versions";
import type {
  AppLifecycleState,
  ReleaseNoteManifest,
  UpgradeTransition,
} from "./types";

export function normalizeAppVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

export function detectUpgradeTransition(
  currentVersion: string,
  previousVersion?: string
): UpgradeTransition {
  if (!previousVersion) return "unknown-baseline";

  const current = normalizeAppVersion(currentVersion);
  const previous = normalizeAppVersion(previousVersion);
  if (!validate(current) || !validate(previous)) return "unknown-baseline";

  const result = compareVersions(current, previous);
  if (result > 0) return "upgrade";
  if (result < 0) return "downgrade";
  return "same-version";
}

export class ReleaseNotesRegistry {
  private readonly manifests = new Map<string, ReleaseNoteManifest>();

  register(manifest: ReleaseNoteManifest): void {
    const version = normalizeAppVersion(manifest.version);
    if (!version || !validate(version)) {
      throw new Error(`无效的版本说明版本号: ${manifest.version}`);
    }
    if (this.manifests.has(version)) {
      throw new Error(`版本说明已注册: ${version}`);
    }
    this.manifests.set(version, { ...manifest, version });
  }

  get(version: string): ReleaseNoteManifest | undefined {
    return this.manifests.get(normalizeAppVersion(version));
  }

  getAll(): ReleaseNoteManifest[] {
    return [...this.manifests.values()].sort((left, right) =>
      compareVersions(left.version, right.version)
    );
  }

  selectAutomatic(
    currentVersion: string,
    lifecycle: AppLifecycleState
  ): ReleaseNoteManifest[] {
    const current = normalizeAppVersion(currentVersion);
    const currentManifest = this.get(current);
    const transition = detectUpgradeTransition(
      current,
      lifecycle.lastLaunchedVersion
    );

    if (transition === "unknown-baseline") {
      if (
        currentManifest?.unknownBaselinePolicy === "show-current" &&
        !lifecycle.releaseNotes[current]
      ) {
        return [currentManifest];
      }
      return [];
    }

    if (transition !== "upgrade") return [];
    const previous = normalizeAppVersion(lifecycle.lastLaunchedVersion ?? "");
    return this.getAll().filter(
      (manifest) =>
        compareVersions(manifest.version, previous) > 0 &&
        compareVersions(manifest.version, current) <= 0 &&
        !lifecycle.releaseNotes[manifest.version]
    );
  }

  clear(): void {
    this.manifests.clear();
  }
}

export const releaseNotesRegistry = new ReleaseNotesRegistry();
