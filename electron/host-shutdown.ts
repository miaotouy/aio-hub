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

interface ShutdownActions {
  snapshot(): void;
  stop(): readonly (() => void | Promise<unknown>)[];
  report(error: unknown): void;
  exit(code: number): void;
}
/** One drain for tray/menu quit, explicit exit and relaunch, even with concurrent requests. */
export class HostShutdown {
  private pending?: Promise<void>;
  constructor(private actions: ShutdownActions) {}
  get started(): boolean {
    return !!this.pending;
  }
  request(code = 0): Promise<void> {
    if (this.pending) return this.pending;
    // Assign before any action executes, so reentrant requests join the same drain.
    this.pending = Promise.resolve().then(async () => {
      try {
        this.actions.snapshot();
      } catch (error) {
        this.actions.report(error);
      }
      let tasks: readonly (() => void | Promise<unknown>)[] = [];
      try {
        tasks = this.actions.stop();
      } catch (error) {
        this.actions.report(error);
      }
      const results = await Promise.allSettled(
        tasks.map((task) => Promise.resolve().then(task))
      );
      for (const result of results)
        if (result.status === "rejected") this.actions.report(result.reason);
      this.actions.exit(code);
    });
    return this.pending;
  }
}
