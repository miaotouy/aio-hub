// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import type { AstNode } from "../../types";
import { createAstImageIndex } from "../astImageIndex";

const image = (src: string): AstNode => ({
  id: src,
  type: "image",
  props: { src },
  meta: { range: { start: 0, end: 0 } },
});
const paragraph = (
  children: AstNode[]
): Extract<AstNode, { type: "paragraph" }> => ({
  id: "p",
  type: "paragraph",
  props: {},
  children,
  meta: { range: { start: 0, end: 0 } },
});

// Gallery order, duplicates and changed/removed descendants must follow each immutable AST revision.
it("updates gallery URLs through immutable edits, reorder, removal and reset", () => {
  const index = createAstImageIndex();
  const fixed = paragraph([image("first"), image("first")]);
  const tail = paragraph([image("tail")]);
  expect(index.collect([fixed, tail]).images).toEqual([
    "first",
    "first",
    "tail",
  ]);
  const changed = { ...tail, children: [image("changed")] };
  expect(index.collect([changed, fixed]).images).toEqual([
    "changed",
    "first",
    "first",
  ]);
  expect(index.collect([fixed]).images).toEqual(["first", "first"]);
  expect(index.collect([]).images).toEqual([]);
  index.clear();
  expect(index.collect([tail]).images).toEqual(["tail"]);
});

// A cached subtree still consumes the same traversal allowance; a truncated result cannot poison later reads.
it("preserves the traversal limit for cached and partially visited subtrees", () => {
  const index = createAstImageIndex(3);
  const pair = paragraph([image("a"), image("b")]);
  expect(index.collect([pair])).toEqual({
    images: ["a", "b"],
    truncated: false,
  });
  expect(index.collect([image("prefix"), pair])).toEqual({
    images: ["prefix", "a"],
    truncated: true,
  });
  expect(index.collect([pair])).toEqual({
    images: ["a", "b"],
    truncated: false,
  });
  const fresh = paragraph([image("c"), image("d")]);
  expect(index.collect([image("prefix"), fresh]).truncated).toBe(true);
  expect(index.collect([fresh])).toEqual({
    images: ["c", "d"],
    truncated: false,
  });
});
