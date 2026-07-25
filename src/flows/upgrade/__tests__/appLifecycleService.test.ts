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
  type AppLifecyclePersistence,
} from "../appLifecycleService";
import type { AppLifecycleState } from "../types";

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
