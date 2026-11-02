// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

import MarkdownIt from "markdown-it";
import { formatAsciiDiagram } from "./ascii-diagram";

const LANGUAGES = new Set([
  "",
  "text",
  "txt",
  "plain",
  "plaintext",
  "ascii",
  "ascii-art",
  "diagram",
]);

function isDiagramFence(info: string): boolean {
  return LANGUAGES.has(info.trim().split(/\s/)[0].toLowerCase());
}

/** Run before syntax highlighting so preview, SSR and copied code agree. */
export function installDiagramFormatting(md: MarkdownIt): void {
  md.core.ruler.after("block", "aiohub_ascii_diagrams", (state) => {
    for (const token of state.tokens) {
      if (token.type === "fence" && isDiagramFence(token.info)) {
        token.content = formatAsciiDiagram(token.content).text;
      }
    }
  });
}

export interface MarkdownDiagramResult {
  text: string;
  formatted: number;
  skipped: { line: number; reason: string }[];
}

const parser = new MarkdownIt({ html: true });

/** Edit only fence bodies, preserving prose, fence markers, BOM and line endings. */
export function formatMarkdownDiagrams(source: string): MarkdownDiagramResult {
  const lines = source.split(/(?<=\n)/);
  const result: MarkdownDiagramResult = {
    text: source,
    formatted: 0,
    skipped: [],
  };
  const replacements: { start: number; end: number; lines: string[] }[] = [];
  for (const token of parser.parse(source, {})) {
    if (token.type !== "fence" || !token.map || !isDiagramFence(token.info))
      continue;
    const [start, end] = token.map;
    // Container prefixes are removed by Markdown's parser. Recover them only
    // when the raw body has an unambiguous, uniform prefix on every line.
    const close = lines[end - 1]?.replace(/\r?\n$/, "");
    const closeMatch = close?.match(/^([ \t>]*)(`{3,}|~{3,})[ \t]*$/);
    if (
      !closeMatch ||
      closeMatch[2][0] !== token.markup[0] ||
      closeMatch[2].length < token.markup.length
    )
      continue;
    const contentLines = token.content.replace(/\n$/, "").split("\n");
    const rawLines = lines.slice(start + 1, end - 1);
    if (rawLines.length !== contentLines.length) continue;
    let prefix: string | undefined;
    let uniform = true;
    for (let i = 0; i < rawLines.length; i++) {
      const raw = rawLines[i].replace(/\r?\n$/, "");
      const content = contentLines[i];
      if (!content.trim()) continue;
      if (!raw.endsWith(content)) {
        uniform = false;
        break;
      }
      const current = raw.slice(0, raw.length - content.length);
      if (prefix === undefined) prefix = current;
      else if (prefix !== current) {
        uniform = false;
        break;
      }
    }
    if (!uniform) continue;
    const formatted = formatAsciiDiagram(token.content);
    if (formatted.skipped) {
      result.skipped.push({ line: start + 1, reason: formatted.skipped });
    }
    if (!formatted.changed) continue;
    const output = formatted.text.replace(/\n$/, "").split("\n");
    if (output.length !== rawLines.length) continue;
    replacements.push({
      start: start + 1,
      end: end - 1,
      lines: output.map((line, i) => {
        const newline = rawLines[i].match(/\r?\n$/)?.[0] ?? "";
        return line.trim() ? (prefix ?? "") + line + newline : rawLines[i];
      }),
    });
    result.formatted++;
  }
  for (const replacement of replacements.reverse()) {
    lines.splice(
      replacement.start,
      replacement.end - replacement.start,
      ...replacement.lines
    );
  }
  result.text = lines.join("");
  return result;
}
