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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
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

  it("keeps indexed nodes and immutable snapshots current across subtree edits", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    const state = useMarkdownAst({ throttleEnabled: false });
    state.enqueuePatch({
      op: "replace-root",
      newRoot: [
        paragraph("p", [text("a", "A")]),
        paragraph("q", [text("z", "Z")]),
      ],
    });
    frames.shift()?.(performance.now());
    const snapshot = state.ast.value;
    state.enqueuePatch([
      { op: "text-append", id: "a", text: "!" },
      { op: "set-prop", id: "p", key: "title", value: "edited" },
    ]);
    frames.shift()?.(performance.now());
    expect(snapshot[0]).toEqual(paragraph("p", [text("a", "A")]));
    expect(state.nodeMap.get("p")?.node).toBe(state.ast.value[0]);
    expect(state.nodeMap.get("a")?.node).toBe(state.ast.value[0].children?.[0]);
    expect(state.nodeMap.get("a")?.node.props).toMatchObject({ content: "A!" });
    expect(state.ast.value[1]).toBe(snapshot[1]);

    state.enqueuePatch([
      {
        op: "replace-node",
        id: "p",
        newNode: paragraph("p2", [text("b", "B")]),
      },
      { op: "text-append", id: "b", text: "!" },
      { op: "insert-before", id: "z", newNode: text("y", "Y") },
      {
        op: "replace-children-range",
        parentId: "q",
        start: 0,
        deleteCount: 1,
        newChildren: [text("c", "C")],
      },
      { op: "text-append", id: "c", text: "!" },
    ]);
    frames.shift()?.(performance.now());
    expect(state.ast.value).toEqual([
      paragraph("p2", [text("b", "B!")]),
      paragraph("q", [text("c", "C!"), text("z", "Z")]),
    ]);
    expect([...state.nodeMap.keys()].sort()).toEqual([
      "b",
      "c",
      "p2",
      "q",
      "z",
    ]);
    for (const [i, parent] of state.ast.value.entries()) {
      expect(state.nodeMap.get(parent.id)?.node).toBe(parent);
      parent.children?.forEach((node, j) => {
        expect(state.nodeMap.get(node.id)).toEqual({
          node,
          parentId: parent.id,
          path: [i, j],
        });
        expect(state.nodeMap.get(node.id)?.node).toBe(node);
      });
    }
    state.dispose();
  });

  // Structural batches must keep new/shifted descendants addressable and old snapshots intact.
  it("addresses descendants after root and nested sibling splices in one batch", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    const state = useMarkdownAst({ throttleEnabled: false });
    const original = [
      paragraph("before", [text("keep", "K")]),
      paragraph("group", [
        paragraph("a", [text("a-text", "A")]),
        paragraph("b", [text("b-text", "B")]),
      ]),
      paragraph("after", [text("last", "Z")]),
    ];
    state.enqueuePatch({ op: "replace-root", newRoot: original });
    frames.shift()?.(performance.now());
    state.enqueuePatch([
      {
        op: "insert-before",
        id: "group",
        newNode: paragraph("middle", [text("m", "M")]),
      },
      {
        op: "insert-before",
        id: "b",
        newNode: paragraph("c", [text("c-text", "C")]),
      },
      { op: "text-append", id: "c-text", text: "!" },
      { op: "remove-node", id: "a" },
      { op: "text-append", id: "b-text", text: "!" },
      {
        op: "replace-children-range",
        parentId: "group",
        start: -1,
        deleteCount: 99,
        newChildren: [paragraph("d", [text("d-text", "D")])],
      },
      { op: "text-append", id: "d-text", text: "!" },
      {
        op: "insert-after",
        id: "d",
        newNode: paragraph("e", [text("e-text", "E")]),
      },
      { op: "remove-node", id: "middle" },
      { op: "text-append", id: "last", text: "!" },
    ]);
    frames.shift()?.(performance.now());
    expect(state.ast.value).toEqual([
      original[0],
      paragraph("group", [
        paragraph("c", [text("c-text", "C!")]),
        paragraph("d", [text("d-text", "D!")]),
        paragraph("e", [text("e-text", "E")]),
      ]),
      paragraph("after", [text("last", "Z!")]),
    ]);
    expect(original[1]).toEqual(
      paragraph("group", [
        paragraph("a", [text("a-text", "A")]),
        paragraph("b", [text("b-text", "B")]),
      ])
    );
    expect(original[2]).toEqual(paragraph("after", [text("last", "Z")]));
    const ids: string[] = [];
    const checkIndexes = (
      nodes: AstNode[],
      parentId?: string,
      path: number[] = []
    ) => {
      nodes.forEach((node, i) => {
        ids.push(node.id);
        expect(state.nodeMap.get(node.id)).toEqual({
          node,
          parentId,
          path: [...path, i],
        });
        expect(state.nodeMap.get(node.id)?.node).toBe(node);
        if (node.children) checkIndexes(node.children, node.id, [...path, i]);
      });
    };
    checkIndexes(state.ast.value);
    expect([...state.nodeMap.keys()].sort()).toEqual(ids.sort());
    state.dispose();
  });

  it("replaces the sole root subtree before addressing its new descendants", () => {
    const state = useMarkdownAst({ throttleEnabled: false });
    state.enqueuePatch([
      {
        op: "replace-root",
        newRoot: [paragraph("old", [text("old-child", "old")])],
      },
      {
        op: "replace-node",
        id: "old",
        newNode: paragraph("new", [text("new-child", "new")]),
      },
      { op: "text-append", id: "new-child", text: "!" },
      { op: "remove-node", id: "old-child" },
    ]);
    expect(state.ast.value).toEqual([
      paragraph("new", [text("new-child", "new!")]),
    ]);
    expect([...state.nodeMap.keys()].sort()).toEqual(["new", "new-child"]);
    state.dispose();
  });

  it("uses the latest throttle setting instead of an initialization snapshot", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      animationFrames.push(cb);
      return animationFrames.length;
    });

    const throttleEnabled = ref(true);
    const markdownAst = useMarkdownAst({
      throttleEnabled,
      throttleMs: 10_000,
    });

    markdownAst.enqueuePatch({
      op: "replace-root",
      newRoot: [text("dynamic", "updated")],
    });

    expect(markdownAst.ast.value).toEqual([]);
    expect(animationFrames).toHaveLength(1);

    throttleEnabled.value = false;
    animationFrames.shift()?.(performance.now());

    expect(markdownAst.ast.value).toEqual([text("dynamic", "updated")]);
  });
});
