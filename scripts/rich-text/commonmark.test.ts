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
import type { AstNode } from "../../src/tools/rich-text-renderer/types";
import fixture from "./fixtures/commonmark-0.31.2/spec.json";
import { firstDifference, normalizeAst, normalizeHtml } from "./semantics";
import { createReference } from "./reference";
import {
  countResults,
  createReport,
  evaluateExample,
  renderMarkdown,
  type ParseOutcome,
  type SpecExample,
} from "./report";

const meta = { range: { start: 0, end: 0 } };
function text(content: string): AstNode {
  return { id: "runtime-id", type: "text", props: { content }, meta };
}
function paragraph(children: AstNode[]): AstNode {
  return { id: "p", type: "paragraph", props: {}, children, meta };
}
function html(content: string) {
  const template = document.createElement("template");
  template.innerHTML = content;
  return normalizeHtml(template.content);
}
const example: SpecExample = {
  example: 1,
  section: "Textual content",
  markdown: "hello",
  html: "<p>hello</p>\n",
  start_line: 1,
  end_line: 3,
};

// Protect semantic comparison and report accounting, independent of parser internals.
describe("CommonMark semantic comparison", () => {
  it("compares split/quoted text and runtime metadata as the same visible content", () => {
    const ast: AstNode[] = [
      paragraph([
        { ...text("say "), _fp: "runtime-fingerprint" },
        {
          id: "q",
          type: "quote",
          props: { startMarker: '"', endMarker: '"' },
          children: [text("hello")],
          meta,
        },
        text(" "),
        { id: "s", type: "strong", props: {}, children: [text("world")], meta },
      ]),
    ];
    expect(normalizeAst(ast)).toEqual(
      html("<p>say &quot;hello&quot; <strong>world</strong></p>\n")
    );
  });

  it("ignores structural HTML formatting while retaining nested block structure", () => {
    const ast: AstNode[] = [
      {
        id: "b",
        type: "blockquote",
        props: {},
        children: [paragraph([text("a")])],
        meta,
      },
    ];
    expect(normalizeAst(ast)).toEqual(
      html("<blockquote>\n<p>a</p>\n</blockquote>\n")
    );
    expect(
      firstDifference(
        html("<ul><li>a</li></ul>"),
        html("<ul><li><p>a</p></li></ul>")
      )
    ).toBeDefined();
  });

  it.each([
    ["trailing hard break", "<p>a</p>", "<p>a<br></p>"],
    ["soft versus hard break", "<p>a\nb</p>", "<p>a<br>\nb</p>"],
    [
      "code trailing LF",
      "<pre><code>a\n</code></pre>",
      "<pre><code>a</code></pre>",
    ],
    ["list start", '<ol start="3"><li>a</li></ol>', "<ol><li>a</li></ol>"],
    [
      "link destination",
      '<p><a href="/a">a</a></p>',
      '<p><a href="/b">a</a></p>',
    ],
    ["inline spaces", "<p>a  b</p>", "<p>a b</p>"],
  ])("preserves meaningful difference: %s", (_label, expected, actual) => {
    const difference = firstDifference(html(expected), html(actual));
    expect(difference?.path).toMatch(/^\$\[/);
    expect(difference?.expected).not.toEqual(difference?.actual);
  });

  it("matches hard-break writer formatting and default list start on both sides", () => {
    const ast: AstNode[] = [
      paragraph([
        text("a"),
        { id: "br", type: "hard_break", props: {}, meta },
        text("b"),
      ]),
    ];
    expect(normalizeAst(ast)).toEqual(html("<p>a<br />\nb</p>\n"));
    expect(html('<ol start="1"><li>a</li></ol>')).toEqual(
      html("<ol><li>a</li></ol>")
    );
    // Only one writer LF is normalized; further whitespace remains observable.
    expect(html("<p>a<br>\n\nb</p>")).not.toEqual(normalizeAst(ast));
  });
});

describe("CommonMark report", () => {
  it("accounts for differences, parser failures, timeouts and unsupported adapters separately", () => {
    const expected = html(example.html);
    const outcomes: ParseOutcome[] = [
      { status: "parsed", ast: [paragraph([text("hello")])] },
      { status: "parsed", ast: [paragraph([text("changed")])] },
      { status: "parse-error", error: "RangeError: maximum call stack" },
      { status: "timeout", error: "Parsing exceeded limit" },
      {
        status: "parsed",
        ast: [
          { id: "math", type: "katex_inline", props: { content: "x" }, meta },
        ],
      },
    ];
    const results = outcomes.map((outcome, index) =>
      evaluateExample({ ...example, example: index + 1 }, expected, outcome)
    );
    expect(countResults(results)).toEqual({
      total: 5,
      match: 1,
      mismatch: 1,
      "parse-error": 1,
      timeout: 1,
      "adapter-unsupported": 1,
    });
    expect(results[1].difference).toEqual({
      path: "$[0].children[0].value",
      expected: "hello",
      actual: "changed",
    });
    expect(results[4].rawAst).toEqual(
      outcomes[4].status === "parsed" ? outcomes[4].ast : []
    );
    const report = createReport(
      results,
      { bun: "test", timeoutMs: 2000 },
      "2026-10-25T00:00:00.000Z"
    );
    expect(report.sections[0]).toEqual({
      section: example.section,
      ...report.summary,
      classifications: report.classifications,
    });
    expect(renderMarkdown(report)).toContain("20.00%");
  });

  it.each([43, 62])(
    "compares actual parser output with official example %s",
    (number) => {
      const item = fixture.find((item) => item.example === number)!;
      const outcome = evaluateExample(item, html(item.html), {
        status: "parsed",
        ast: new CustomParser().parse(item.markdown),
      });
      expect(outcome.difference).toBeUndefined();
      expect(outcome.status).toBe("match");
    }
  );
});

// Protect public classification boundaries: a known option must never hide content loss.
describe("CommonMark configured reference", () => {
  const fragment = (input: string) => {
    const template = document.createElement("template");
    template.innerHTML = input;
    return template.content;
  };
  const reference = createReference(fragment);
  it.each([
    { markdown: "hello", classification: "match" },
    { markdown: "first\nsecond", classification: "product-convention" },
    { markdown: "hello\n", classification: "pending-contract" },
  ])(
    "classifies $classification without changing the strict comparison",
    ({ markdown, classification }) => {
      const outputs = reference.compare(markdown);
      const result = evaluateExample(
        { ...example, markdown },
        outputs.commonmark.semantics,
        { status: "parsed", ast: new CustomParser().parse(markdown) },
        outputs
      );
      expect(result.classification).toBe(classification);
      expect(result.status).toBe(
        classification === "match" ? "match" : "mismatch"
      );
      expect(result.rawAst).toBeDefined();
      expect(result.reference).toEqual(outputs);
      if (classification === "pending-contract")
        expect(result.projectDifference).toBeDefined();
    }
  );

  it("retains mixed content differences and never excuses earlier paragraph breaks as terminal whitespace", () => {
    const markdown = "first\nsecond\n";
    const outputs = reference.compare(markdown);
    const changed = new CustomParser().parse("changed\nsecond\n");
    const mixed = evaluateExample(
      { ...example, markdown },
      outputs.commonmark.semantics,
      { status: "parsed", ast: changed },
      outputs
    );
    expect(mixed.classification).toBe("parser-difference");
    expect(mixed.productConfigurationDifference).toBeDefined();
    expect(mixed.projectDifference?.path).toBe("$[0].children[0].value");
    const paragraphs = "first\n\nlast\n";
    const other = reference.compare(paragraphs);
    const ast = [
      paragraph([
        text("first"),
        { id: "br", type: "hard_break" as const, props: {}, meta },
      ]),
      ...new CustomParser().parse("last\n"),
    ];
    expect(
      evaluateExample(
        { ...example, markdown: paragraphs },
        other.commonmark.semantics,
        { status: "parsed", ast },
        other
      ).classification
    ).toBe("parser-difference");
  });

  it("keeps reference-library disagreement separate and preserves the project comparison", () => {
    const outputs = reference.compare("hello");
    const result = evaluateExample(
      example,
      html("<p>official</p>"),
      { status: "parsed", ast: [paragraph([text("hello")])] },
      outputs
    );
    expect(result.classification).toBe("reference-difference");
    expect(result.officialDefaultDifference?.path).toBe(
      "$[0].children[0].value"
    );
    expect(result.projectDifference).toBeUndefined();
    const report = createReport([result], {
      bun: "test",
      timeoutMs: 2000,
      markdownIt: "test",
    });
    expect(report.comparisonSummary).toMatchObject({
      officialDefaultDifferences: 1,
      projectMatches: 1,
    });
  });
});
