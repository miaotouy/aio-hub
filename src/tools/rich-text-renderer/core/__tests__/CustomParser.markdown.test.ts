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
import { CustomParser } from "../CustomParser";
import type { AstNode } from "../../types";
import { actionButtonTestPreset } from "../../presets/action-button-test";

function flatten(nodes: AstNode[]): AstNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}
function text(nodes: AstNode[]): string {
  return flatten(nodes)
    .filter((node) => node.type === "text")
    .map((node) => node.props.content)
    .join("");
}
const parse = (input: string) => new CustomParser().parse(input);

describe("Markdown content preservation", () => {
  it.each(["c++", "c#", "objective-c"])(
    "keeps %s language information out of code content",
    (language) => {
      const [node] = parse(
        "\x60\x60\x60" + language + " extra metadata\nint n = 1;\n\x60\x60\x60"
      );
      expect(node.type).toBe("code_block");
      expect(node.props).toMatchObject({
        language,
        content: "int n = 1;",
        closed: true,
      });
    }
  );

  it.each(["\x60", "~"])(
    "keeps shorter %s fences inside the outer block and preserves following text",
    (marker) => {
      const input =
        marker.repeat(4) +
        "md\n" +
        marker.repeat(3) +
        "\ninside\n" +
        marker.repeat(3) +
        "\n" +
        marker.repeat(4) +
        "\nafter";
      const ast = parse(input);
      expect(ast.map((node) => node.type)).toEqual(["code_block", "paragraph"]);
      expect(ast[0].props).toMatchObject({
        language: "md",
        content: marker.repeat(3) + "\ninside\n" + marker.repeat(3),
        closed: true,
      });
      expect(text([ast[1]])).toBe("after");
    }
  );

  it("requires a matching fence-only closing line and handles empty/unclosed blocks", () => {
    expect(parse("~~~js\n~~~suffix\n\x60\x60\x60\n~~~")[0].props).toMatchObject(
      { content: "~~~suffix\n\x60\x60\x60", closed: true }
    );
    expect(parse("~~~\n~~~")[0].props).toMatchObject({
      content: "",
      closed: true,
    });
    expect(parse("~~~js\nbody")[0].props).toMatchObject({
      content: "body",
      closed: false,
    });
    expect(
      parse("\x60\x60\x60 a \x60\x60 b \x60\x60\x60")[0].children?.[0].type
    ).toBe("inline_code");
  });

  it("keeps multiple paragraphs and nested lists within their parent list item", () => {
    const ast = parse(
      "- first\n\n  continuation\n\n  - child\n\n- second\n\noutside"
    );
    expect(ast.map((node) => node.type)).toEqual(["list", "paragraph"]);
    const items = ast[0].children!;
    expect(items).toHaveLength(2);
    expect(items[0].children?.map((node) => node.type)).toEqual([
      "paragraph",
      "paragraph",
      "list",
    ]);
    expect(text(items[0].children!)).toBe("firstcontinuationchild");
    expect(text([items[1]])).toBe("second");
    expect(text([ast[1]])).toBe("outside");
  });

  it("retains the first ordered-list number and paragraph-internal visible line breaks", () => {
    const [list] = parse("3. third\n4. fourth");
    expect(list.props).toMatchObject({ ordered: true, start: 3 });
    expect(list.children).toHaveLength(2);
    expect(
      parse("first\nsecond")[0].children?.map((node) => node.type)
    ).toEqual(["text", "hard_break", "text"]);
  });

  it("decodes named/numeric entities once as text while preserving escaped and code literals", () => {
    expect(
      text(parse("&amp; &#35; &#x4e2d; &NotEqualTilde; &unknown; &#0;"))
    ).toBe("& # 中 ≂̸ &unknown; �");
    expect(text(parse("\\&amp; &amp;amp; &lt;script&gt;"))).toBe(
      "&amp; &amp; <script>"
    );
    expect(text(parse("<div>&amp;lt; &#35;</div>"))).toBe("&lt; #");
    expect(text(parse("<pre>&amp;lt;</pre>"))).toBe("&lt;");
    const think = parse("<think>&lt;div&gt; &amp;</think>").find(
      (node) => node.type === "llm_think"
    );
    expect(think?.props.rawContent).toBe("&lt;div&gt; &amp;");
    expect(parse("\x60&amp; &#35;\x60")[0].children?.[0].props).toMatchObject({
      content: "&amp; &#35;",
    });
    expect(parse("~~~\n&amp; &#35;\n~~~")[0].props).toMatchObject({
      content: "&amp; &#35;",
    });
  });
});

describe("Markdown reference links", () => {
  it("resolves forward/full/collapsed/shortcut references with normalized labels", () => {
    const ast = parse('[visible][ID] [id][] [id]\n\n[id]: /url "title"');
    const links = flatten(ast).filter((node) => node.type === "link");
    expect(links).toHaveLength(3);
    for (const link of links)
      expect(link.props).toEqual({ href: "/url", title: "title" });
    expect(text(ast)).toBe("visible id id");
  });

  it("supports reference images and multiline destinations/titles", () => {
    const ast = parse("![alt][asset]\n\n[asset]:\n  /image.png\n  'caption'");
    const image = flatten(ast).find((node) => node.type === "image");
    expect(image?.props).toEqual({
      src: "/image.png",
      alt: "alt",
      title: "caption",
    });
  });

  it.each([
    ['[id]: /url "single"', "single"],
    ["[id]: /url\n  'next line'", "next line"],
    ['[id]: /url "first\nsecond"', "first\nsecond"],
    ["[id]: /url (first\nsecond)", "first\nsecond"],
    ['[id]: /url "first\n \nsecond"', null],
    ['[id]: /url\n\n"separate paragraph"', ""],
  ])("preserves title boundaries in %j", (definition, title) => {
    const ast = parse("[id]\n\n" + definition);
    const link = flatten(ast).find((node) => node.type === "link");
    if (title === null) {
      expect(link).toBeUndefined();
      expect(text(ast)).toContain("[id]");
      expect(text(ast)).toContain("second");
    } else {
      expect(link?.props).toEqual({ href: "/url", title });
      if (title === "") expect(text(ast)).toContain("separate paragraph");
    }
  });

  it("keeps first definitions, isolates parse calls, and leaves unresolved text literal", () => {
    const parser = new CustomParser();
    const ast = parser.parse("[id]: /first\n[id]: /second\n\n[id]");
    expect(
      flatten(ast).find((node) => node.type === "link")?.props
    ).toMatchObject({ href: "/first" });
    expect(text(parser.parse("[id] [missing][x]"))).toBe("[id] [missing][x]");
    expect(
      flatten(parser.parse("~~~\n[id]: /fake\n~~~\n\n[id]")).filter(
        (node) => node.type === "link"
      )
    ).toHaveLength(0);
  });

  it("preserves unsafe definitions as text rather than introducing executable reference links", () => {
    const ast = parse("[id]: javascript:alert(1)\n\n[id]");
    expect(flatten(ast).filter((node) => node.type === "link")).toHaveLength(0);
    expect(text(ast)).toContain("[id]: javascript:alert(1)");
  });
});

// Protect project extensions exposed by the tester's own presets.
describe("project preset compatibility", () => {
  it("keeps action labels and payloads stable across formatted HTML", () => {
    const buttons = flatten(parse(actionButtonTestPreset.content)).filter(
      (node) => node.type === "action_button"
    );
    expect(
      buttons
        .filter((node) => String(node.props.content).startsWith("skill:"))
        .map((node) => ({
          label: node.props.label,
          content: node.props.content,
        }))
    ).toEqual([
      { label: "⚔️重斩", content: "skill:slash" },
      { label: "🛡️防御", content: "skill:guard" },
      { label: "🌿治愈", content: "skill:heal" },
    ]);
    const [paragraph] = parse("<p><strong>one</strong> <em>two</em></p>");
    expect(text([paragraph])).toBe("one two");
  });

  it("keeps footnote source visible and distinct from ordinary numbered references", () => {
    const ast = parse("[1]: /one\n\n[^1]: note\n\n[1] [^1]");
    const links = flatten(ast).filter((node) => node.type === "link");
    expect(
      links.map((node) => ({ href: node.props.href, text: text([node]) }))
    ).toEqual([{ href: "/one", text: "1" }]);
    expect(text(ast)).toBe("[^1]: note1 [^1]");
  });

  it("preserves extension delimiters when resolving reference labels", () => {
    const ast = parse(
      "[a^b] [a~b] [***a***]\n\n[a^b]: /sup\n[a~b]: /sub\n[***a***]: /triple\n[ab]: /other"
    );
    expect(
      flatten(ast)
        .filter((node) => node.type === "link")
        .map((node) => node.props.href)
    ).toEqual(["/sup", "/sub", "/triple"]);
  });
});
