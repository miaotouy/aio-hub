// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

const START_PREFIX = "<<<[VCP_TOOL_BATCH_START:";
const END_PREFIX = "<<<[VCP_TOOL_BATCH_END:";
const TIMESTAMP = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})`;

export interface VcpToolBatch {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
  closed: boolean;
}

/** Match the original timestamp verbatim; nested markers are payload text. */
export function findVcpToolBatch(
  text: string,
  from = 0
): VcpToolBatch | undefined {
  const scanner = new RegExp(
    String.raw`<<<\[VCP_TOOL_BATCH_START:(${TIMESTAMP})\]>>>`,
    "g"
  );
  scanner.lastIndex = from;
  const match = scanner.exec(text);
  if (!match) return;
  const contentStart = match.index + match[0].length;
  const endMarker = `${END_PREFIX}${match[1]}]>>>`;
  const endIndex = text.indexOf(endMarker, contentStart);
  let contentEnd = endIndex < 0 ? text.length : endIndex;
  if (endIndex < 0) {
    for (
      let length = Math.min(text.length - contentStart, endMarker.length - 1);
      length >= 4;
      length--
    ) {
      if (text.endsWith(endMarker.slice(0, length))) {
        contentEnd -= length;
        break;
      }
    }
  }
  return {
    start: match.index,
    contentStart,
    contentEnd,
    end: endIndex < 0 ? text.length : endIndex + endMarker.length,
    closed: endIndex >= 0,
  };
}

/** Locate an outer role boundary without interpreting anything inside a batch. */
export function findVcpRoleEnd(
  text: string,
  endMarker: string,
  from: number
): number {
  let cursor = from;
  while (cursor < text.length) {
    const end = text.indexOf(endMarker, cursor);
    const batch = findVcpToolBatch(text, cursor);
    if (!batch || (end >= 0 && end < batch.start)) return end;
    if (!batch.closed) return -1;
    cursor = batch.end;
  }
  return -1;
}

/** Apply presentation transforms only to text outside opaque batch ranges. */
export function transformVcpTextOutsideBatches(
  text: string,
  transform: (outside: string) => string
): string {
  const parts: string[] = [];
  let cursor = 0;
  let batch: VcpToolBatch | undefined;
  while ((batch = findVcpToolBatch(text, cursor))) {
    if (cursor < batch.start)
      parts.push(transform(text.slice(cursor, batch.start)));
    parts.push(text.slice(batch.start, batch.end));
    cursor = batch.end;
  }
  if (cursor < text.length) parts.push(transform(text.slice(cursor)));
  return parts.join("");
}

/** Keep offsets and line breaks stable for execution parsing. */
export function maskVcpToolBatches(text: string): string {
  const parts: string[] = [];
  let cursor = 0;
  let batch: VcpToolBatch | undefined;
  while ((batch = findVcpToolBatch(text, cursor))) {
    parts.push(
      text.slice(cursor, batch.start),
      text.slice(batch.start, batch.end).replace(/[^\r\n]/g, " ")
    );
    cursor = batch.end;
  }
  return parts.length ? parts.join("") + text.slice(cursor) : text;
}

/** Hold an in-flight start marker until its timestamp and terminator arrive. */
export function hideIncompleteVcpBatchStart(text: string): string {
  const start = text.lastIndexOf(START_PREFIX);
  if (
    start >= 0 &&
    /^[\dTZ:+.\-]*\]?>{0,2}$/.test(text.slice(start + START_PREFIX.length))
  ) {
    return text.slice(0, start);
  }
  for (
    let length = Math.min(text.length, START_PREFIX.length - 1);
    length >= 8;
    length--
  ) {
    if (text.endsWith(START_PREFIX.slice(0, length)))
      return text.slice(0, -length);
  }
  return text;
}
