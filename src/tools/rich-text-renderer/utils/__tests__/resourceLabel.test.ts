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
import { resolveResourceLabel } from "../resourceLabel";

describe("resolveResourceLabel", () => {
  it("prefers alt text when present", () => {
    expect(resolveResourceLabel("https://example.com/a.png", "图片说明")).toBe(
      "图片说明"
    );
  });

  it("extracts the file name from a URL", () => {
    expect(resolveResourceLabel("https://example.com/dir/photo.webp", "")).toBe(
      "photo.webp"
    );
  });

  it("drops query strings and decodes percent-encoding", () => {
    expect(
      resolveResourceLabel("https://example.com/%E8%A1%A8%E6%83%85%E5%8C%85.png?token=1", "")
    ).toBe("表情包.png");
  });

  it("handles local and windows-style paths", () => {
    expect(resolveResourceLabel("appdata://assets/2026/holiday.png", "")).toBe(
      "holiday.png"
    );
    expect(resolveResourceLabel("C:\\pics\\sea.jpg", "")).toBe("sea.jpg");
  });

  it("falls back to unknown or truncated source", () => {
    expect(resolveResourceLabel("", "")).toBe("未知资源");
    const long = `https://example.com/${"x".repeat(120)}`;
    expect(resolveResourceLabel(long, "").endsWith("...")).toBe(true);
  });
});
