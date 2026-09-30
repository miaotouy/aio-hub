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

/**
 * 自动重试状态码号段工具。
 *
 * 配置形如 `100-199,300-399,401-407`，逗号分隔的区间或单值。
 * 约定：2xx（成功）、504、524 始终排除，不参与自动重试。
 */

export interface RetryStatusRange {
  start: number;
  end: number;
}

/** 始终排除、不允许出现在白名单中的号段 */
export const RETRY_STATUS_EXCLUDED_RANGES: RetryStatusRange[] = [
  { start: 200, end: 299 },
  { start: 504, end: 504 },
  { start: 524, end: 524 },
];

export const DEFAULT_RETRY_STATUS_CODES =
  "100-199,300-399,401-407,409-499,500-503,505-523,525-599";

export interface ParsedRetryStatusCodes {
  /** 解析成功的号段，已按起始值排序 */
  ranges: RetryStatusRange[];
  /** 非法片段（含解析错误原因） */
  errors: string[];
  /** 区间重叠 / 包含冲突提示 */
  overlaps: string[];
  /** 与排除规则（2xx / 504 / 524）冲突的号段提示 */
  excluded: string[];
}

function isStatusInRanges(status: number, ranges: RetryStatusRange[]): boolean {
  return ranges.some((range) => status >= range.start && status <= range.end);
}

function rangesOverlap(a: RetryStatusRange, b: RetryStatusRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

function formatRange(range: RetryStatusRange): string {
  return range.start === range.end
    ? String(range.start)
    : `${range.start}-${range.end}`;
}

/**
 * 解析号段配置，附带非法输入、重叠与排除规则校验结果。
 * 只解析出可用号段，错误信息供 UI 提示，不阻断整体解析。
 */
export function parseRetryStatusCodes(input: string): ParsedRetryStatusCodes {
  const ranges: RetryStatusRange[] = [];
  const errors: string[] = [];
  const overlaps: string[] = [];
  const excluded: string[] = [];

  const segments = (input ?? "")
    .split(/[,\n;，；]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  for (const segment of segments) {
    const match = segment.match(/^(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/);
    if (!match) {
      errors.push(`无法解析「${segment}」（应为 100-199 或 404 形式）`);
      continue;
    }
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start > end) {
      errors.push(`区间起点大于终点「${segment}」`);
      continue;
    }
    if (start < 100 || end > 599) {
      errors.push(`状态码超出 100-599 范围「${segment}」`);
      continue;
    }
    ranges.push({ start, end });
  }

  ranges.sort((a, b) => a.start - b.start);

  for (let i = 1; i < ranges.length; i++) {
    if (rangesOverlap(ranges[i - 1], ranges[i])) {
      overlaps.push(
        `号段重叠：${formatRange(ranges[i - 1])} 与 ${formatRange(ranges[i])}`
      );
    }
  }

  for (const range of ranges) {
    const hitExcluded = RETRY_STATUS_EXCLUDED_RANGES.some((excludedRange) =>
      rangesOverlap(range, excludedRange)
    );
    if (hitExcluded) {
      excluded.push(`号段 ${formatRange(range)} 命中排除规则（2xx / 504 / 524）`);
    }
  }

  return { ranges, errors, overlaps, excluded };
}

/**
 * 判断某个 HTTP 状态码是否允许自动重试。
 * - 命中排除规则（2xx / 504 / 524）→ 不重试；
 * - 命中白名单号段 → 重试；
 * - 其余 → 不重试。
 */
export function isRetryableStatusCode(
  status: number,
  ranges: RetryStatusRange[]
): boolean {
  if (isStatusInRanges(status, RETRY_STATUS_EXCLUDED_RANGES)) return false;
  return isStatusInRanges(status, ranges);
}

/**
 * 从配置字符串判断状态码是否可重试。
 */
export function isRetryableStatusCodeFromConfig(
  status: number,
  config: string
): boolean {
  return isRetryableStatusCode(status, parseRetryStatusCodes(config).ranges);
}
