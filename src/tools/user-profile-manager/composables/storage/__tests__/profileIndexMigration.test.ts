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

import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({
    load: vi.fn(),
    save: vi.fn(),
  }),
}));

import { mergeProfilesIndexes } from "../useUserProfileStorage";

const profile = (id: string, name: string) => ({
  id,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("user profile index migration", () => {
  it("restores an empty target index from the legacy index", () => {
    const result = mergeProfilesIndexes(
      {
        version: "1.1.0",
        profiles: [profile("legacy", "Legacy")],
        globalProfileId: "legacy",
      },
      { version: "1.1.0", profiles: [], globalProfileId: null }
    );

    expect(result.profiles).toEqual([profile("legacy", "Legacy")]);
    expect(result.globalProfileId).toBe("legacy");
  });

  it("preserves target conflicts and only appends missing legacy entries", () => {
    const result = mergeProfilesIndexes(
      {
        version: "1.1.0",
        profiles: [
          profile("shared", "Legacy"),
          profile("legacy-only", "Legacy only"),
        ],
        globalProfileId: "legacy-only",
      },
      {
        version: "1.1.0",
        profiles: [profile("shared", "Current")],
        globalProfileId: "missing",
      }
    );

    expect(result.profiles).toEqual([
      profile("shared", "Current"),
      profile("legacy-only", "Legacy only"),
    ]);
    expect(result.globalProfileId).toBe("legacy-only");
  });
});
