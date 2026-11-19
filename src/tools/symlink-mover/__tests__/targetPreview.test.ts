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
import { getTargetPreview } from "../targetPreview";

describe("expected target paths", () => {
  it.each([
    [
      "C:/Program Files/Topaz Labs LLC",
      "E:/Archive",
      undefined,
      true,
      "E:/Archive/Topaz Labs LLC",
    ],
    [
      "C:/Program Files/Topaz Labs LLC",
      "E:/Archive",
      "C:/",
      true,
      "E:/Archive/Program Files/Topaz Labs LLC",
    ],
    [
      "C:\\App\\src\\Button.vue",
      "E:\\Archive\\",
      "C:/App/",
      true,
      "E:\\Archive\\src\\Button.vue",
    ],
    ["C:/App/", "E:/", undefined, true, "E:/App"],
    ["C:/App", "E:/Archive", "C:/App", true, "E:/Archive"],
    [
      "\\\\server\\share\\App\\src",
      "\\\\backup\\archive",
      "\\\\server\\share",
      true,
      "\\\\backup\\archive\\App\\src",
    ],
    ["/home/me/App/src", "/archive/", "/home/me/App/", false, "/archive/src"],
    ["/home/me/App/src", "/", "/home/me/", false, "/App/src"],
    [
      "/home/me/parent\\child",
      "/archive",
      "/home/me",
      false,
      "/archive/parent\\child",
    ],
  ] as const)(
    "maps %s into %s with base %s",
    (source, target, base, windows, expected) => {
      expect(getTargetPreview(source, target, base, windows)).toEqual({
        targetPath: expected,
      });
    }
  );

  it.each([
    ["C:/App/a.txt", "", undefined, true],
    ["C:/App/a.txt", "E:/Archive", "", true],
    ["C:/Application/a.txt", "E:/Archive", "C:/App", true],
    ["D:/App/a.txt", "E:/Archive", "C:/", true],
    ["C:/App/a.txt", "Archive", undefined, true],
    ["C:/App/../a.txt", "E:/Archive", "C:/App", true],
    ["C:/App/a.txt", "E:/Archive/../Other", undefined, true],
    ["/home/me/parent\\child", "/archive", "/home/me/parent", false],
    ["/home/me/App/a.txt", "/archive", "/home/me/app", false],
  ] as const)(
    "requests correction for %s, target %s and base %s",
    (source, target, base, windows) => {
      const preview = getTargetPreview(source, target, base, windows);
      expect(preview.targetPath).toBeUndefined();
      expect(preview.issue).toEqual(expect.any(String));
    }
  );
});
