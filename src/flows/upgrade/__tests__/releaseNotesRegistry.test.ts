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

import { describe, expect, it } from "vitest";
import {
  detectUpgradeTransition,
  ReleaseNotesRegistry,
} from "../releaseNotesRegistry";
import type { AppLifecycleState, ReleaseNoteManifest } from "../types";

function release(
  version: string,
  unknownBaselinePolicy: ReleaseNoteManifest["unknownBaselinePolicy"] = "manual-only"
): ReleaseNoteManifest {
  return {
    version,
    revision: 1,
    channel: version.includes("-") ? "prerelease" : "stable",
    title: version,
    summary: version,
    publishedAt: "2026-07-25",
    body: `# ${version}`,
    unknownBaselinePolicy,
  };
}

function lifecycle(
  lastLaunchedVersion?: string,
  acknowledged: string[] = []
): AppLifecycleState {
  return {
    schemaVersion: 1,
    lastLaunchedVersion,
    releaseNotes: Object.fromEntries(
      acknowledged.map((version) => [
        version,
        { status: "completed", acknowledgedAt: "2026-07-25T00:00:00.000Z" },
      ])
    ),
  };
}

describe("ReleaseNotesRegistry", () => {
  it("selects unacknowledged notes across a multi-version upgrade", () => {
    const registry = new ReleaseNotesRegistry();
    registry.register(release("0.6.9"));
    registry.register(release("0.7.0-alpha.1"));
    registry.register(release("0.7.0"));

    expect(
      registry
        .selectAutomatic("0.7.0", lifecycle("0.6.8", ["0.6.9"]))
        .map((item) => item.version)
    ).toEqual(["0.7.0-alpha.1", "0.7.0"]);
  });

  it("keeps an earlier deferred note in a later upgrade", () => {
    const registry = new ReleaseNotesRegistry();
    registry.register(release("0.7.0"));
    registry.register(release("0.8.0"));

    expect(
      registry
        .selectAutomatic("0.8.0", lifecycle("0.7.0"))
        .map((item) => item.version)
    ).toEqual(["0.7.0", "0.8.0"]);
  });

  it("uses the manifest policy when no lifecycle baseline exists", () => {
    const registry = new ReleaseNotesRegistry();
    registry.register(release("0.7.0-alpha.1", "show-current"));

    expect(
      registry
        .selectAutomatic("0.7.0-alpha.1", lifecycle())
        .map((item) => item.version)
    ).toEqual(["0.7.0-alpha.1"]);
  });

  it("does not auto-show release notes for a downgrade", () => {
    const registry = new ReleaseNotesRegistry();
    registry.register(release("0.6.9"));

    expect(registry.selectAutomatic("0.6.9", lifecycle("0.7.0"))).toEqual([]);
    expect(detectUpgradeTransition("0.6.9", "0.7.0")).toBe("downgrade");
  });
});
