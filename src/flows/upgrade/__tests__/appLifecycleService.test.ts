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
  AppLifecycleService,
  migrateAppLifecycleState,
  type AppLifecyclePersistence,
} from "../appLifecycleService";
import {
  detectUpgradeTransition,
  ReleaseNotesRegistry,
} from "../releaseNotesRegistry";
import type { AppLifecycleState, ReleaseNoteManifest } from "../types";

class MemoryLifecyclePersistence implements AppLifecyclePersistence {
  constructor(
    private state: AppLifecycleState = {
      schemaVersion: 1,
      releaseNotes: {},
    }
  ) {}

  async load(): Promise<AppLifecycleState> {
    return structuredClone(this.state);
  }

  async save(state: AppLifecycleState): Promise<void> {
    this.state = structuredClone(state);
  }

  snapshot(): AppLifecycleState {
    return structuredClone(this.state);
  }
}

describe("AppLifecycleService", () => {
  it("migrates an unversioned lifecycle file through the ordered schema path", () => {
    expect(
      migrateAppLifecycleState({
        lastLaunchedVersion: "0.6.9",
        releaseNotes: {},
      })
    ).toEqual({
      schemaVersion: 1,
      lastLaunchedVersion: "0.6.9",
      releaseNotes: {},
    });
  });

  it("preserves recognized fields from a newer lifecycle schema", () => {
    expect(
      migrateAppLifecycleState({
        schemaVersion: 2,
        lastLaunchedVersion: "0.8.0",
        releaseNotes: {
          "0.7.0": {
            status: "completed",
            acknowledgedAt: "2026-07-26T00:00:00.000Z",
          },
        },
      })
    ).toMatchObject({
      schemaVersion: 1,
      lastLaunchedVersion: "0.8.0",
      releaseNotes: {
        "0.7.0": { status: "completed" },
      },
    });
  });

  it("treats the first launch as unknown baseline, shows the current note once, and records the version", async () => {
    const persistence = new MemoryLifecyclePersistence();
    const service = new AppLifecycleService(persistence);
    const registry = new ReleaseNotesRegistry();
    const manifest: ReleaseNoteManifest = {
      version: "0.7.0",
      revision: 1,
      channel: "stable",
      title: "0.7.0",
      summary: "Guided Flow first release",
      publishedAt: "2026-07-26",
      body: "# 0.7.0",
      unknownBaselinePolicy: "show-current",
    };
    registry.register(manifest);

    const beforeLaunch = await service.load();
    expect(
      detectUpgradeTransition("0.7.0", beforeLaunch.lastLaunchedVersion)
    ).toBe("unknown-baseline");
    expect(registry.selectAutomatic("0.7.0", beforeLaunch)).toEqual([manifest]);

    await service.markLaunched("0.7.0");

    const afterLaunch = persistence.snapshot();
    expect(afterLaunch.lastLaunchedVersion).toBe("0.7.0");
    expect(registry.selectAutomatic("0.7.0", afterLaunch)).toEqual([]);
  });

  it("records launched versions separately from release-note acknowledgement", async () => {
    const persistence = new MemoryLifecyclePersistence();
    const service = new AppLifecycleService(persistence);

    await service.markLaunched("0.7.0-alpha.1");

    expect(persistence.snapshot()).toMatchObject({
      lastLaunchedVersion: "0.7.0-alpha.1",
      releaseNotes: {},
    });
  });

  it("acknowledges all displayed release notes with one terminal status", async () => {
    const persistence = new MemoryLifecyclePersistence();
    const service = new AppLifecycleService(persistence);

    await service.acknowledgeReleaseNotes(
      ["0.6.9", "0.7.0-alpha.1"],
      "completed"
    );

    expect(persistence.snapshot().releaseNotes).toMatchObject({
      "0.6.9": { status: "completed" },
      "0.7.0-alpha.1": { status: "completed" },
    });
  });
});
