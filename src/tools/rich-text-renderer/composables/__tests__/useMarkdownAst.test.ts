import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarkdownAst } from "../useMarkdownAst";
import type { AstNode } from "../../types";

const meta = { range: { start: 0, end: 0 } };

function text(id: string, content: string): AstNode {
  return {
    id,
    type: "text",
    props: { content },
    meta,
  };
}

function paragraph(id: string, children: AstNode[]): AstNode {
  return {
    id,
    type: "paragraph",
    props: {},
    children,
    meta,
  };
}

describe("useMarkdownAst", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(performance.now());
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("applies path-targeted patches and refreshes indexes inside a batch", () => {
    const markdownAst = useMarkdownAst({ throttleEnabled: false });

    markdownAst.enqueuePatch([
      {
        op: "replace-root",
        newRoot: [paragraph("p1", [text("a", "A")])],
      },
      {
        op: "insert-after",
        id: "a",
        newNode: text("b", "B"),
      },
      {
        op: "text-append",
        id: "b",
        text: "!",
      },
      {
        op: "replace-node",
        id: "a",
        newNode: text("a2", "AA"),
      },
      {
        op: "remove-node",
        id: "a2",
      },
    ]);

    expect(markdownAst.ast.value).toEqual([paragraph("p1", [text("b", "B!")])]);
    expect(markdownAst.nodeMap.get("b")?.path).toEqual([0, 0]);
  });
});
