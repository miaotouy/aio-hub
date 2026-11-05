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
import { allowLocalFonts, normalizeFontFamilies } from "./system-fonts";
describe("local font access", () => {
  it("returns sorted unique visible family names and reports query failures", () => {
    expect(
      normalizeFontFamilies([
        "微软雅黑",
        "Arial",
        ".Hidden",
        "",
        "Arial",
        "宋体",
      ])
    ).toEqual(["Arial", "宋体", "微软雅黑"]);
    expect(() => normalizeFontFamilies(null)).toThrow();
    expect(() => normalizeFontFamilies(["Arial", 1])).toThrow();
  });
  it("grants only font access to owned trusted main frames in production and development", () => {
    const app = "aiohub://app/sketch-pad";
    expect(allowLocalFonts("local-fonts", true, true, app, app)).toBe(true);
    expect(
      allowLocalFonts(
        "local-fonts",
        true,
        true,
        "http://127.0.0.1:1430/sketch-pad",
        "http://127.0.0.1:1430/",
        "http://127.0.0.1:1430"
      )
    ).toBe(true);
    for (const input of [
      ["media", true, true, app, app],
      ["local-fonts", false, true, app, app],
      ["local-fonts", true, false, app, app],
      ["local-fonts", true, true, "aiohub://canvas-preview/a/document", app],
      ["local-fonts", true, true, "https://example.com", app],
      ["local-fonts", true, true, app, "https://example.com"],
    ] as const)
      expect(allowLocalFonts(...input)).toBe(false);
  });
});
