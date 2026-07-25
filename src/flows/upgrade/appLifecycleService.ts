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

import type { AppLifecycleState, ReleaseNoteAcknowledgement } from "./types";

export interface AppLifecyclePersistence {
  load(): Promise<AppLifecycleState>;
  save(state: AppLifecycleState): Promise<void>;
}

class ConfigAppLifecyclePersistence implements AppLifecyclePersistence {
  private managerPromise: Promise<
    import("@/utils/configManager").ConfigManager<AppLifecycleState>
  > | null = null;

  async load(): Promise<AppLifecycleState> {
    return (await this.getManager()).load();
  }

  async save(state: AppLifecycleState): Promise<void> {
    await (await this.getManager()).save(state);
  }

  private getManager(): Promise<
    import("@/utils/configManager").ConfigManager<AppLifecycleState>
  > {
    this.managerPromise ??= import("@/utils/configManager").then(
      ({ createConfigManager }) =>
        createConfigManager<AppLifecycleState>({
          moduleName: "guided-flow",
          fileName: "app-lifecycle.json",
          version: "1.0.0",
          createDefault: () => ({
            schemaVersion: 1,
            releaseNotes: {},
          }),
          mergeConfig: (defaults, loaded) => ({
            ...defaults,
            ...loaded,
            schemaVersion: 1,
            releaseNotes: loaded.releaseNotes ?? {},
          }),
        })
    );
    return this.managerPromise;
  }
}

export class AppLifecycleService {
  private state: AppLifecycleState | null = null;
  private loadPromise: Promise<AppLifecycleState> | null = null;

  constructor(
    private readonly persistence: AppLifecyclePersistence = new ConfigAppLifecyclePersistence()
  ) {}

  async load(): Promise<AppLifecycleState> {
    if (this.state) return structuredClone(this.state);
    if (!this.loadPromise) {
      this.loadPromise = this.persistence
        .load()
        .then((loaded) => {
          this.state = {
            ...loaded,
            schemaVersion: 1,
            releaseNotes: loaded.releaseNotes ?? {},
          };
          return this.state;
        })
        .catch((error) => {
          this.loadPromise = null;
          throw error;
        });
    }
    const state = await this.loadPromise;
    return structuredClone(state);
  }

  async markLaunched(version: string): Promise<void> {
    const state = await this.requireState();
    if (state.lastLaunchedVersion === version) return;
    state.lastLaunchedVersion = version;
    await this.persistence.save(structuredClone(state));
  }

  async acknowledgeReleaseNotes(
    versions: string[],
    status: ReleaseNoteAcknowledgement["status"]
  ): Promise<void> {
    if (versions.length === 0) return;
    const state = await this.requireState();
    const acknowledgedAt = new Date().toISOString();
    for (const version of versions) {
      state.releaseNotes[version] = { status, acknowledgedAt };
    }
    await this.persistence.save(structuredClone(state));
  }

  getSnapshot(): AppLifecycleState | null {
    return this.state ? structuredClone(this.state) : null;
  }

  private async requireState(): Promise<AppLifecycleState> {
    if (!this.state) await this.load();
    return this.state!;
  }
}

export const appLifecycleService = new AppLifecycleService();
