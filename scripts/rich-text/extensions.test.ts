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
import { CustomParser } from "../../src/tools/rich-text-renderer/core/CustomParser";
import { extensionCorpus } from "./extension-corpus";
import { createReference } from "./reference";
import { firstDifference, normalizeAst, normalizeHtml } from "./semantics";

function fragment(input: string) {
  const template = document.createElement("template");
  template.innerHTML = input;
  return template.content;
}

// Public table columns/content and extension boundaries: stable across parser refactors.
// The task-list gap remains report data; its desired output is not changed to bless current behavior.
describe("authored Markdown extension contracts", () => {
  const reference = createReference(fragment);
  it.each(
    extensionCorpus.filter(
      (item) => !["task-list", "table-code-pipe"].includes(item.id)
    )
  )("preserves $id semantics", (item) => {
    const expected = item.expected ?? normalizeHtml(fragment(item.html!));
    const ast = new CustomParser().parse(item.markdown);
    expect(
      firstDifference(expected, normalizeAst(ast, true)),
      item.id
    ).toBeUndefined();
  });

  it("checks authored GFM expectations independently, including known V2 gaps", () => {
    for (const item of extensionCorpus.filter(
      (item) => item.family === "GFM" && item.librarySupport !== "unavailable"
    )) {
      const expected = normalizeHtml(fragment(item.html!));
      expect(
        firstDifference(
          expected,
          reference.extensions(item.markdown).semantics
        ),
        item.id
      ).toBeUndefined();
    }
  });

  it("preserves body rows at blank-line and following block boundaries", () => {
    for (const suffix of ["\n\nparagraph", "\n# heading"]) {
      const ast = new CustomParser().parse(
        "| A | B |\n| --- | --- |\n| 1 | 2 |" + suffix
      );
      expect(ast.map((node) => node.type)).toEqual([
        "table",
        suffix.includes("#") ? "heading" : "paragraph",
      ]);
      expect(normalizeAst([ast[0]])).toEqual(
        reference.extensions("| A | B |\n| --- | --- |\n| 1 | 2 |").semantics
      );
    }
  });
});
