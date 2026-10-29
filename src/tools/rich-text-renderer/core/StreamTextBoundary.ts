// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  isCodeFenceClosing,
  readCodeFenceOpening,
  type CodeFence,
} from "../parser/utils/code-fence";

interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}
const Segmenter = (
  Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: "grapheme" }
    ) => GraphemeSegmenter;
  }
).Segmenter;
const segmenter = Segmenter
  ? new Segmenter(undefined, { granularity: "grapheme" })
  : undefined;
const BASIC_TEXT = /^[\x00-\x7f\u3400-\u9fff]*$/u;

/** Holds only the unfinished grapheme or candidate fence line across upstream chunks. */
export class StreamTextBoundary {
  private fence: CodeFence | null = null;
  private candidate: string | undefined = "";
  private tail = "";
  private carriageReturn = "";
  private indent = 0;
  private marker = "";
  private markerLength = 0;
  private info = false;

  push(chunk: string, bypass = false): string[] {
    const input = this.carriageReturn + chunk;
    this.carriageReturn = input.endsWith("\r") ? "\r" : "";
    return this.scan(this.carriageReturn ? input.slice(0, -1) : input, bypass);
  }

  private scan(chunk: string, bypass: boolean): string[] {
    const output: string[] = [];
    let start = 0;
    while (start < chunk.length) {
      const lf = chunk.indexOf("\n", start);
      const cr = chunk.indexOf("\r", start);
      const newline = lf < 0 ? cr : cr < 0 ? lf : Math.min(lf, cr);
      const end =
        newline < 0
          ? chunk.length
          : newline +
            (chunk[newline] === "\r" && chunk[newline + 1] === "\n" ? 2 : 1);
      const part = chunk.slice(start, end);
      if (this.candidate !== undefined) {
        this.candidate += part;
        if (!this.possibleFence(part)) {
          this.appendText(this.candidate, bypass, output);
          this.candidate = undefined;
          if (/[\r\n]$/.test(part)) this.resetLine();
        } else if (/[\r\n]$/.test(part)) {
          const raw = this.candidate;
          const line = raw
            .replace(/(?:\r\n|\r|\n)$/, "")
            .replace(/^ {0,3}/, "");
          const opening = this.fence ? null : readCodeFenceOpening(line);
          if (opening || (this.fence && isCodeFenceClosing(line, this.fence))) {
            output.push(raw);
            this.fence = opening;
          } else {
            this.appendText(raw, bypass, output);
          }
          this.resetLine();
        }
      } else {
        this.appendText(part, bypass, output);
        if (/[\r\n]$/.test(part)) this.resetLine();
      }
      start = end;
    }
    return output;
  }

  finish(): string[] {
    const output = this.carriageReturn
      ? this.scan(this.carriageReturn, false)
      : [];
    this.carriageReturn = "";
    const remaining = this.tail + (this.candidate ?? "");
    this.tail = "";
    this.candidate = undefined;
    if (remaining) output.push(remaining);
    return output;
  }

  reset() {
    this.fence = null;
    this.tail = "";
    this.carriageReturn = "";
    this.resetLine();
  }

  private resetLine() {
    this.candidate = "";
    this.indent = 0;
    this.marker = "";
    this.markerLength = 0;
    this.info = false;
  }

  private possibleFence(part: string): boolean {
    const required = this.fence?.length ?? 3;
    for (const char of part) {
      if (char === "\n" || char === "\r") return this.markerLength >= required;
      if (!this.marker) {
        if (char === " " && this.indent < 3) {
          this.indent++;
          continue;
        }
        if (
          (char !== "`" && char !== "~") ||
          (this.fence && char !== this.fence.marker)
        )
          return false;
        this.marker = char;
        this.markerLength = 1;
      } else if (!this.info && char === this.marker) {
        this.markerLength++;
      } else {
        if (this.markerLength < required) return false;
        this.info = true;
        if (
          this.fence
            ? !/[ \t\r]/.test(char)
            : this.marker === "`" && char === "`"
        )
          return false;
      }
    }
    return true;
  }

  private appendText(part: string, bypass: boolean, output: string[]) {
    const text = this.tail + part;
    const basic = BASIC_TEXT.test(text);
    const newline = /[\r\n]$/.test(text);
    let units: string[];
    if (basic) {
      this.tail = newline ? "" : text.slice(-1);
      const ready = newline ? text : text.slice(0, -1);
      if (bypass) {
        if (ready) output.push(ready);
        return;
      }
      units = ready.match(/\r\n|[\s\S]/gu) ?? [];
    } else {
      units = segmenter
        ? Array.from(segmenter.segment(text), (item) => item.segment)
        : Array.from(text);
      this.tail = newline ? "" : (units.pop() ?? "");
      // A split surrogate may become a modifier or ZWJ continuation of the preceding grapheme.
      if (!newline && /[\ud800-\udbff]$/.test(text) && units.length)
        this.tail = units.pop()! + this.tail;
      if (bypass) {
        if (units.length) output.push(units.join(""));
        return;
      }
    }
    if (this.fence) {
      for (const unit of units) output.push(unit);
      return;
    }
    let kind = "";
    for (const unit of units) {
      const next = /^[a-zA-Z0-9]$/.test(unit)
        ? "word"
        : /^\s+$/.test(unit)
          ? "space"
          : /^[\u4e00-\u9fa5]$/.test(unit)
            ? "cjk"
            : "other";
      const last = output.length - 1;
      if (
        last >= 0 &&
        next === kind &&
        (next === "word" ||
          next === "space" ||
          (next === "cjk" && output[last].length < 2))
      )
        output[last] += unit;
      else output.push(unit);
      kind = next;
    }
  }
}
