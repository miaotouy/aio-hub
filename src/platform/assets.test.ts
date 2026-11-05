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

import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ convertFileSrc: vi.fn() }));
vi.mock("./native/core", () => mocks);
import {
  getSubtitleFontSources,
  toLocalAssetUrl,
  isLocalAssetUrl,
  stripLocalAssetUrlPrefix,
} from "./modules/assets";
beforeEach(() => vi.resetAllMocks());

// Retain encoded filename bytes while adapting local URLs and remove the Windows-only origin literal.
it("normalizes host asset URLs without decoding escaped filename bytes", () => {
  mocks.convertFileSrc.mockReturnValueOnce(
    "https://asset.localhost/C%3A%5Ca%2520%23%3F.png"
  );
  expect(toLocalAssetUrl("C:\\a%20#?.png")).toBe(
    "https://asset.localhost/C%3A%5Ca%2520%23%3F.png"
  );
  expect(mocks.convertFileSrc).toHaveBeenCalledWith("C:\\a%20#?.png");
  mocks.convertFileSrc.mockReturnValueOnce("asset://localhost/a\\b.png");
  expect(toLocalAssetUrl("a\\b.png")).toBe("asset://localhost/a/b.png");
});

it("derives subtitle font URLs from the current host resource converter", () => {
  mocks.convertFileSrc.mockImplementation(
    (path) => `host-resource:${encodeURIComponent(path)}`
  );
  const fonts = getSubtitleFontSources();
  expect(fonts["microsoft yahei"]).toBe(
    `host-resource:${encodeURIComponent("C:\\Windows\\Fonts\\msyh.ttc")}`
  );
  expect(fonts.simhei).toBe(
    `host-resource:${encodeURIComponent("C:\\Windows\\Fonts\\simhei.ttf")}`
  );
});

// Keep display-path extraction and preview routing stable while changing resource hosts.
it("recognizes local resource schemes and strips only the host prefix for display", () => {
  expect(isLocalAssetUrl("asset://localhost/a%23b.mp4")).toBe(true);
  expect(isLocalAssetUrl("relative/a.mp4")).toBe(false);
  expect(
    stripLocalAssetUrlPrefix("https://asset.localhost/C:/a%20b.mp4?q=1")
  ).toBe("C:/a%20b.mp4?q=1");
  expect(stripLocalAssetUrlPrefix("asset://C:/a.mp4")).toBe("C:/a.mp4");
  expect(
    stripLocalAssetUrlPrefix("asset://local/C:/a%20b.mp4?token=window-secret")
  ).toBe("C:/a%20b.mp4");
  expect(stripLocalAssetUrlPrefix("https://example.com/a.mp4")).toBe(
    "https://example.com/a.mp4"
  );
});
