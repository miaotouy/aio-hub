// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { StreamTextBoundary } from "../StreamTextBoundary";

it.each([false, true])(
  "preserves graphemes and complete fence lines across every upstream code unit (bypass=%s)",
  (bypass) => {
    const source =
      "中文 e\u0301 👩🏽‍💻 🇨🇳\r\n```typescript\r\nconst x = '👨‍👩‍👧‍👦';\n```\n~~~python\nprint('好')\n~~~\n````js\n```\nend\n````\nfinish ✨";
    const segmenter = new (
      Intl as unknown as {
        Segmenter: new (
          locale: string,
          options: { granularity: string }
        ) => { segment(text: string): Iterable<{ segment: string }> };
      }
    ).Segmenter("en", { granularity: "grapheme" });
    const ends = new Set<number>([0]);
    let end = 0;
    for (const item of segmenter.segment(source)) {
      end += item.segment.length;
      ends.add(end);
    }
    const boundary = new StreamTextBoundary();
    const emitted: string[] = [];
    const atomicLines = [
      "```typescript\r\n",
      "```\n",
      "~~~python\n",
      "~~~\n",
      "````js\n",
      "````\n",
    ];
    const forbidden = new Set<number>();
    for (const line of atomicLines) {
      let start = source.indexOf(line);
      // The triple fence inside a four-character fence is body text, so only the first closing triple is atomic.
      if (start >= 0)
        for (let i = start + 1; i < start + line.length; i++) forbidden.add(i);
    }
    let length = 0;
    const receive = (parts: string[]) => {
      for (const part of parts) {
        emitted.push(part);
        length += part.length;
        expect(ends.has(length), `split grapheme at ${length}`).toBe(true);
        expect(forbidden.has(length), `split fence header at ${length}`).toBe(
          false
        );
      }
    };
    for (let i = 0; i < source.length; i++)
      receive(boundary.push(source[i], bypass));
    receive(boundary.finish());
    expect(emitted.join("")).toBe(source);
  }
);

it("flushes an unfinished candidate verbatim and resets fence and grapheme state", () => {
  const boundary = new StreamTextBoundary();
  const output = [...boundary.push("```unfinished"), ...boundary.finish()];
  expect(output.join("")).toBe("```unfinished");
  boundary.reset();
  expect([...boundary.push("plain\n"), ...boundary.finish()].join("")).toBe(
    "plain\n"
  );
});

it.each(["\n", "\r\n", "\r"])(
  "keeps indented tilde fences atomic with %j line endings",
  (newline) => {
    const source = `  ~~~~js${newline}body${newline}  ~~~~${newline}`;
    const boundary = new StreamTextBoundary();
    const parts: string[] = [];
    for (const char of source) parts.push(...boundary.push(char));
    parts.push(...boundary.finish());
    expect(parts.join("")).toBe(source);
    expect(parts[0]).toBe(`  ~~~~js${newline}`);
    expect(parts[parts.length - 1]).toBe(`  ~~~~${newline}`);
  }
);
