// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

import stringWidth from "string-width";

interface Segment {
  row: number;
  start: number;
  end: number;
  left: number;
  right: number;
  opening: string;
  closing: string;
}

interface Frame {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Mark {
  index: number;
  column: number;
  glyph: string;
  corner: boolean;
}

interface Cell {
  left: number;
  right: number;
  content: string;
  fill?: string;
}

interface Row {
  marks: Mark[];
  cells: Cell[];
  suffix: string;
}

export interface DiagramResult {
  text: string;
  changed: boolean;
  /** Present when a box-like block was left intact for manual review. */
  skipped?: string;
}

const MAX_DRIFT = 8;
const MAX_LINES = 300;
const MAX_COLUMNS = 800;
const MAX_AXES = 60;
const MAX_MARKS = 100;

function cellText(raw: string): string {
  const text = raw.trimEnd();
  // Keep one existing right-padding space when a frame needs to grow.
  return text && text.length < raw.length ? text + " " : text;
}

/** Ordered minimum-distance assignment; tied assignments are left for review. */
function matchMarks(
  expected: { column: number; corner: boolean }[],
  candidates: Mark[]
): Mark[] | undefined {
  const costs = Array.from({ length: expected.length + 1 }, () =>
    Array<number>(candidates.length + 1).fill(Infinity)
  );
  const ways = costs.map((row) => row.map(() => 0));
  const steps = costs.map((row) => row.map(() => ""));
  costs[0][0] = 0;
  ways[0][0] = 1;
  function update(
    e: number,
    c: number,
    cost: number,
    count: number,
    step: string
  ) {
    if (cost < costs[e][c]) {
      costs[e][c] = cost;
      ways[e][c] = count;
      steps[e][c] = step;
    } else if (cost === costs[e][c]) {
      ways[e][c] = Math.min(2, ways[e][c] + count);
    }
  }
  for (let e = 0; e <= expected.length; e++) {
    for (let c = 0; c < candidates.length; c++) {
      if (!ways[e][c]) continue;
      // A horizontal corner always belongs to a frame; text pipes may be skipped.
      if (!candidates[c].corner) {
        update(e, c + 1, costs[e][c], ways[e][c], "skip");
      }
      if (e === expected.length) continue;
      const drift = Math.abs(expected[e].column - candidates[c].column);
      if (expected[e].corner === candidates[c].corner && drift <= MAX_DRIFT) {
        update(e + 1, c + 1, costs[e][c] + drift, ways[e][c], "match");
      }
    }
  }
  if (ways[expected.length][candidates.length] !== 1) return;
  let e = expected.length;
  let c = candidates.length;
  const matched: Mark[] = [];
  while (c > 0) {
    if (steps[e][c] === "match") {
      matched.push({ ...candidates[c - 1], column: expected[e - 1].column });
      e--;
    }
    c--;
  }
  return matched.reverse();
}

/**
 * Recover rectangular frames from intact horizontal anchors, then solve minimum
 * column distances. Content glyphs and their order are preserved; only frame
 * fills and whitespace preceding structural edges change. Widths use terminal
 * columns, so font fallback can still affect individual glyphs in a renderer.
 */
export function formatAsciiDiagram(source: string): DiagramResult {
  const unchanged = (skipped?: string): DiagramResult => ({
    text: source,
    changed: false,
    ...(skipped ? { skipped } : {}),
  });
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (!lines.some((line) => /[+┌└├┬┴┼][─-]{2,}[+┐┘┤┬┴┼]/u.test(line))) {
    return unchanged();
  }
  if (
    lines.length > MAX_LINES ||
    lines.some((line) => stringWidth(line) > MAX_COLUMNS)
  ) {
    return unchanged("字符画超出自动整理范围");
  }
  if (/[\t\r\u001b]/u.test(lines.join("\n"))) {
    return unchanged("字符画含 Tab 或控制字符，请先转换为空格");
  }
  const segments: Segment[] = [];
  const groups = new Map<string, Segment[]>();
  for (const [row, line] of lines.entries()) {
    const pattern = /[+┌└├┬┴┼][─-]{2,}[+┐┘┤┬┴┼]/gu;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      const start = match.index;
      const end = start + match[0].length - 1;
      const segment: Segment = {
        row,
        start,
        end,
        left: stringWidth(line.slice(0, start)),
        right: stringWidth(line.slice(0, end)),
        opening: line[start],
        closing: line[end],
      };
      segments.push(segment);
      const key = `${segment.left}:${segment.right}`;
      const group = groups.get(key) ?? [];
      group.push(segment);
      groups.set(key, group);
      // Adjacent table cells can share the same corner.
      pattern.lastIndex = end;
    }
  }
  const frames: Frame[] = [];
  for (const group of groups.values()) {
    for (let i = 1; i < group.length; i++) {
      const top = group[i - 1];
      const bottom = group[i];
      if (
        bottom.row > top.row + 1 &&
        /[+┌├┬┼]/u.test(top.opening) &&
        /[+┐┤┬┼]/u.test(top.closing) &&
        /[+└├┴┼]/u.test(bottom.opening) &&
        /[+┘┤┴┼]/u.test(bottom.closing)
      ) {
        frames.push({
          top: top.row,
          bottom: bottom.row,
          left: top.left,
          right: top.right,
        });
      }
    }
  }
  if (!frames.length) return unchanged("未找到可配对的上下框线");
  const axes = [...new Set(frames.flatMap((f) => [f.left, f.right]))].sort(
    (a, b) => a - b
  );
  if (axes.length > MAX_AXES) return unchanged("字符画分栏过多，请分块整理");
  const constraints = axes.slice(1).map((right, i) => ({
    left: axes[i],
    right,
    width: right - axes[i],
  }));
  const rows: (Row | undefined)[] = [];
  for (const [rowIndex, line] of lines.entries()) {
    if (!line.trim()) {
      rows.push(undefined);
      continue;
    }
    const active = frames.filter(
      (f) => f.top <= rowIndex && rowIndex <= f.bottom
    );
    const columns = [...new Set(active.flatMap((f) => [f.left, f.right]))].sort(
      (a, b) => a - b
    );
    const rowSegments = segments.filter((s) => s.row === rowIndex);
    const corners = new Set(rowSegments.flatMap((s) => [s.start, s.end]));
    const candidates: Mark[] = [];
    for (let i = 0; i < line.length; i++) {
      if (/[|│]/u.test(line[i]) || corners.has(i)) {
        candidates.push({
          index: i,
          column: stringWidth(line.slice(0, i)),
          glyph: line[i],
          corner: corners.has(i),
        });
      }
    }
    if (!columns.length || candidates.length > MAX_MARKS) {
      return unchanged(`第 ${rowIndex + 1} 行含框外内容或过多边界`);
    }
    const marks = matchMarks(
      columns.map((column) => ({
        column,
        corner: rowSegments.some(
          (s) => s.left === column || s.right === column
        ),
      })),
      candidates
    );
    if (!marks)
      return unchanged(`第 ${rowIndex + 1} 行边界缺失或对应关系有歧义`);
    const prefix = line.slice(0, marks[0].index);
    const suffix = line.slice(marks[marks.length - 1].index + 1);
    if (prefix.trim() || suffix.trim()) {
      return unchanged(`第 ${rowIndex + 1} 行含框外标注或连接线`);
    }
    const cells: Cell[] = [];
    for (let i = 1; i < marks.length; i++) {
      const left = marks[i - 1];
      const right = marks[i];
      const content = line.slice(left.index + 1, right.index);
      const horizontal = rowSegments.some(
        (s) => s.start === left.index && s.end === right.index
      );
      cells.push({
        left: left.column,
        right: right.column,
        content,
        ...(horizontal ? { fill: content[0] } : {}),
      });
      if (!horizontal) {
        constraints.push({
          left: left.column,
          right: right.column,
          width: stringWidth(cellText(content)) + 1,
        });
      }
    }
    rows.push({ marks, cells, suffix });
  }
  const positions = new Map<number, number>([[axes[0], axes[0]]]);
  for (const right of axes.slice(1)) {
    positions.set(
      right,
      Math.max(
        ...constraints
          .filter((c) => c.right === right)
          .map((c) => positions.get(c.left)! + c.width)
      )
    );
  }
  if (positions.get(axes[axes.length - 1])! > MAX_COLUMNS) {
    return unchanged("整理后的字符画过宽，请拆分内容");
  }
  const output = rows.map((row, i) => {
    if (!row) return lines[i];
    let line =
      " ".repeat(positions.get(row.marks[0].column)!) + row.marks[0].glyph;
    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c];
      const width = positions.get(cell.right)! - positions.get(cell.left)! - 1;
      const content = cellText(cell.content);
      line += cell.fill
        ? cell.fill.repeat(width)
        : content + " ".repeat(width - stringWidth(content));
      line += row.marks[c + 1].glyph;
    }
    return line + row.suffix;
  });
  const text = output.join(source.includes("\r\n") ? "\r\n" : "\n");
  return { text, changed: text !== source };
}
