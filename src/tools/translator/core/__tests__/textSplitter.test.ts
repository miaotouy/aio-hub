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
import { recursiveSplitText } from "../textSplitter";

function expectWithinLimit(chunks: string[], limit: number) {
  for (const chunk of chunks) {
    expect(Array.from(chunk).length).toBeLessThanOrEqual(limit);
  }
}

describe("recursiveSplitText", () => {
  it("keeps paragraph and sentence separators while splitting", () => {
    const text = [
      "第一段第一句。第一段第二句。",
      "",
      "Second paragraph has a sentence. Another sentence follows.",
    ].join("\n");

    const chunks = recursiveSplitText(text, { chunkSize: 28 });

    expect(chunks.join("")).toBe(text);
    expectWithinLimit(chunks, 28);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("falls back to hard character chunks for text without separators", () => {
    const text = "甲".repeat(35);
    const chunks = recursiveSplitText(text, { chunkSize: 10 });

    expect(chunks).toHaveLength(4);
    expect(chunks.join("")).toBe(text);
    expectWithinLimit(chunks, 10);
  });

  it("does not split latin sentences at abbreviation dots when space is absent", () => {
    const text = "Use e.g.examples carefully. Then translate the rest.";
    const chunks = recursiveSplitText(text, { chunkSize: 30 });

    expect(chunks.join("")).toBe(text);
    expectWithinLimit(chunks, 30);
    expect(chunks[0]).toContain("e.g.examples");
  });
});
