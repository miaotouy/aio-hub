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
