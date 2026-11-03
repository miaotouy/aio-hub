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

import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUserDataPath } from "./data-path";

describe("Electron user data location", () => {
  it("keeps portable data next to the original executable and lets an explicit directory override it", () => {
    const original = path.resolve("portable-app");
    expect(
      resolveUserDataPath({ packaged: true, portableDirectory: original })
    ).toBe(path.join(original, "data"));
    const custom = path.resolve("custom-data");
    expect(
      resolveUserDataPath({
        packaged: true,
        portableDirectory: original,
        dataDirectory: custom,
      })
    ).toBe(custom);
  });

  it("uses the platform default for installed apps and ignores portable variables in development", () => {
    expect(resolveUserDataPath({ packaged: true })).toBeUndefined();
    expect(
      resolveUserDataPath({
        packaged: false,
        portableDirectory: path.resolve("portable-app"),
      })
    ).toBeUndefined();
  });
});
