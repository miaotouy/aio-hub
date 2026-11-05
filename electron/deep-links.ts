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

/** Only external application links may enter the command/event bridge. */
export function readDeepLinks(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const links = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    const candidate = /^(".*"|'.*')$/.test(trimmed)
      ? trimmed.slice(1, -1)
      : trimmed;
    if (candidate.length > 65536 || /[\u0000-\u001f\u007f]/.test(candidate))
      continue;
    try {
      const url = new URL(candidate);
      if (
        url.protocol !== "aiohub:" ||
        !url.hostname ||
        url.hostname.toLowerCase().replace(/\.$/, "") === "app" ||
        url.username ||
        url.password ||
        url.port
      )
        continue;
      links.add(candidate);
    } catch {
      // Invalid launch arguments are ignored without logging potentially secret URLs.
    }
  }
  return [...links];
}

/** Retain links only until the main window can consume them, including the getCurrent/listen gap. */
export class PendingDeepLinks {
  private pending = new Set<string>();
  constructor(values: unknown = []) {
    this.add(values);
  }
  add(values: unknown) {
    for (const value of readDeepLinks(values)) {
      this.pending.add(value);
      if (this.pending.size > 32)
        this.pending.delete(this.pending.values().next().value!);
    }
  }
  take(): string[] | null {
    if (!this.pending.size) return null;
    const values = [...this.pending];
    this.pending.clear();
    return values;
  }
}
