// Copyright 2025-2026 miaotouy(Github@miaotouy)

import { describe, expect, it } from "vitest";
import {
  ContinuationTextFilter,
  mergeContinuationText,
} from "../continuationText";

const tail = "他推开旧宅的门，借着闪电看见桌上放着一封信。";
const prefix = "雨水顺着袖口淌下。\n" + tail;

// Public contract: packet boundaries, finalization and cancellation produce the same append-only text.
describe("continuation text reconciliation", () => {
  it.each([
    {
      label: "new text",
      prefix,
      output: "他拆开了信。",
      expected: prefix + "他拆开了信。",
    },
    {
      label: "replayed tail",
      prefix,
      output: tail + "他拆开了信。",
      expected: prefix + "他拆开了信。",
    },
    {
      label: "full replay",
      prefix,
      output: prefix + "他拆开了信。",
      expected: prefix + "他拆开了信。",
    },
    {
      label: "short full replay",
      prefix: "Start",
      output: "Start again",
      expected: "Start again",
    },
    {
      label: "short legitimate repeat",
      prefix: prefix + "看到",
      output: "看到也不敢相信。",
      expected: prefix + "看到看到也不敢相信。",
    },
    {
      label: "code whitespace",
      prefix: "def square(n):\n    return n * ",
      output: " n\n",
      expected: "def square(n):\n    return n *  n\n",
    },
    {
      label: "whitespace-only overlap",
      prefix: " ".repeat(32),
      output: " ".repeat(32) + "text",
      expected: " ".repeat(64) + "text",
    },
    {
      label: "later repeated content",
      prefix,
      output: "他拆开了信。" + tail,
      expected: prefix + "他拆开了信。" + tail,
    },
    {
      label: "full replay larger than tail window",
      prefix: "a".repeat(5000) + tail,
      output: "a".repeat(5000) + tail + "next",
      expected: "a".repeat(5000) + tail + "next",
    },
    {
      label: "nested code delimiters",
      prefix: "payload=" + "}".repeat(20),
      output: "}".repeat(20),
      expected: "payload=" + "}".repeat(40),
    },
    {
      label: "short word padded with whitespace",
      prefix: "previous text: return" + " ".repeat(20),
      output: "return" + " ".repeat(20) + "value",
      expected:
        "previous text: return" +
        " ".repeat(20) +
        "return" +
        " ".repeat(20) +
        "value",
    },
  ])(
    "reconciles $label identically for complete and chunked responses",
    ({ prefix, output, expected }) => {
      expect(mergeContinuationText(prefix, output)).toBe(expected);
      for (const size of [1, 7, output.length]) {
        const filter = new ContinuationTextFilter(prefix);
        let text = prefix;
        for (let index = 0; index < output.length; index += size) {
          text += filter.push(output.slice(index, index + size));
          expect(expected.startsWith(text)).toBe(true);
        }
        text += filter.finish();
        expect(text).toBe(expected);
        expect(filter.finish()).toBe("");
      }
    }
  );

  it("releases ambiguous partial text once when a stream stops", () => {
    const filter = new ContinuationTextFilter(prefix);
    const partial = tail.slice(0, 8);
    expect(filter.push(partial)).toBe("");
    expect(filter.finish()).toBe(partial);
    expect(filter.finish()).toBe("");
  });
});

it("preserves every returned character immediately when deduplication is disabled", () => {
  const filter = new ContinuationTextFilter(prefix, false);
  const output = prefix + "接着写。";
  expect([...output].map((chunk) => filter.push(chunk)).join("")).toBe(output);
  expect(filter.finish()).toBe("");
  expect(mergeContinuationText(prefix, output, false)).toBe(prefix + output);
});
