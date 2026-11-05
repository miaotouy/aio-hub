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
import { PendingDeepLinks, readDeepLinks } from "./deep-links";

describe("Electron external protocol delivery", () => {
  it("accepts quoted launch URLs once and rejects internal routes and malformed/foreign URLs", () => {
    const link = "aiohub://add-profile/?name=Demo&key=example";
    expect(
      readDeepLinks([
        "electron.exe",
        `  "${link}"  `,
        link,
        "aiohub://app/",
        "aiohub://APP:123/",
        "aiohub://user@app/",
        "aiohub://app./",
        "https://example.com/",
        "aiohub://",
        "aiohub://user@add-profile/",
        "aiohub://add-profile:12/",
        "aiohub://add-profile/\n?name=Demo",
        null,
      ])
    ).toEqual([link]);
    expect(readDeepLinks(null)).toEqual([]);
  });
  it("consumes initial links once and queues links arriving before event subscription", () => {
    const first = "aiohub://add-profile/?name=First";
    const second = "aiohub://add-profile/?name=Second";
    const queue = new PendingDeepLinks([first]);
    expect(queue.take()).toEqual([first]);
    expect(queue.take()).toBeNull();
    queue.add([second, second]);
    expect(queue.take()).toEqual([second]);
    expect(queue.take()).toBeNull();
    queue.add([second]);
    expect(queue.take()).toEqual([second]);
  });
  it("bounds unconsumed protocol requests while keeping the latest distinct links", () => {
    const queue = new PendingDeepLinks(
      Array.from({ length: 40 }, (_, i) => `aiohub://add-profile/?name=${i}`)
    );
    const links = queue.take()!;
    expect(links).toHaveLength(32);
    expect(links[0]).toBe("aiohub://add-profile/?name=8");
    expect(links.at(-1)).toBe("aiohub://add-profile/?name=39");
  });
});
