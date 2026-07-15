// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import type { LlmConfigImportDocument } from "./types";

interface JsonRange {
  start: number;
  end: number;
  content: string;
}

const NAMED_DOCUMENT_LINE =
  /^\s*(?:#{1,6}\s*)?(?:\*\*|`)?(config\.toml|auth\.json)(?:\*\*|`)?\s*:?\s*$/i;
const CODE_FENCE_LINE = /^\s*```(?:toml|json)?\s*$/i;

function stripCodeFences(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => !CODE_FENCE_LINE.test(line))
    .join("\n")
    .trim();
}

function splitNamedDocuments(
  document: LlmConfigImportDocument
): LlmConfigImportDocument[] | null {
  const lines = document.content.split(/\r?\n/);
  const markers = lines.flatMap((line, index) => {
    const match = line.match(NAMED_DOCUMENT_LINE);
    return match ? [{ index, name: match[1].toLowerCase() }] : [];
  });
  if (markers.length < 2) return null;

  return markers.flatMap((marker, index) => {
    const nextMarker = markers[index + 1];
    const content = stripCodeFences(
      lines.slice(marker.index + 1, nextMarker?.index).join("\n")
    );
    return content
      ? [
          {
            id: `${document.id}::${marker.name}:${index}`,
            name: marker.name,
            content,
          },
        ]
      : [];
  });
}

function findBalancedJsonEnd(content: string, start: number): number | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack.pop() !== expected) return null;
      if (!stack.length) return index + 1;
    }
  }
  return null;
}

function extractJsonRanges(content: string): JsonRange[] {
  const ranges: JsonRange[] = [];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "{" && content[index] !== "[") continue;
    const lineStart = content.lastIndexOf("\n", index - 1) + 1;
    if (content.slice(lineStart, index).trim()) continue;
    const end = findBalancedJsonEnd(content, index);
    if (!end) continue;
    const candidate = content.slice(index, end);
    try {
      JSON.parse(candidate);
      ranges.push({ start: index, end, content: candidate });
      index = end - 1;
    } catch {
      // TOML section headers and inline tables can share JSON delimiters.
    }
  }
  return ranges;
}

function splitEmbeddedJson(
  document: LlmConfigImportDocument
): LlmConfigImportDocument[] | null {
  const ranges = extractJsonRanges(document.content);
  if (!ranges.length) return null;

  let remainder = "";
  let cursor = 0;
  for (const range of ranges) {
    remainder += document.content.slice(cursor, range.start);
    remainder += "\n".repeat(
      (document.content.slice(range.start, range.end).match(/\n/g) || []).length
    );
    cursor = range.end;
  }
  remainder += document.content.slice(cursor);
  remainder = stripCodeFences(remainder);

  if (ranges.length === 1 && !remainder) return null;

  const expanded: LlmConfigImportDocument[] = ranges.map((range, index) => ({
    id: `${document.id}::json:${index}`,
    name: index === 0 ? "auth.json" : `pasted-${index + 1}.json`,
    content: range.content,
  }));
  if (remainder) {
    expanded.unshift({
      id: `${document.id}::remainder`,
      name: "config.toml",
      content: remainder,
    });
  }
  return expanded;
}

export function expandCompoundImportDocuments(
  documents: LlmConfigImportDocument[]
): LlmConfigImportDocument[] {
  return documents.flatMap((document) => {
    const namedDocuments = splitNamedDocuments(document);
    if (namedDocuments) return namedDocuments;
    return splitEmbeddedJson(document) || [document];
  });
}
