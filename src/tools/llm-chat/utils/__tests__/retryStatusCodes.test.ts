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

import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETRY_STATUS_CODES,
  isRetryableStatusCodeFromConfig,
  parseRetryStatusCodes,
} from "../retryStatusCodes";

describe("parseRetryStatusCodes", () => {
  it("parses default ranges", () => {
    const parsed = parseRetryStatusCodes(DEFAULT_RETRY_STATUS_CODES);
    expect(parsed.errors).toEqual([]);
    expect(parsed.overlaps).toEqual([]);
    expect(parsed.excluded).toEqual([]);
    expect(parsed.ranges[0]).toEqual({ start: 100, end: 199 });
    expect(parsed.ranges).toContainEqual({ start: 409, end: 499 });
  });

  it("accepts single values mixed with ranges", () => {
    const parsed = parseRetryStatusCodes("500-503, 520 ,\n429");
    expect(parsed.ranges).toEqual([
      { start: 429, end: 429 },
      { start: 500, end: 503 },
      { start: 520, end: 520 },
    ]);
  });

  it("flags invalid segments", () => {
    const parsed = parseRetryStatusCodes("abc, 200-100, 99-100, 700");
    expect(parsed.errors).toHaveLength(4);
    expect(parsed.ranges).toEqual([]);
  });

  it("flags overlapping ranges", () => {
    const parsed = parseRetryStatusCodes("500-510,505-520");
    expect(parsed.overlaps).toHaveLength(1);
    expect(parsed.ranges).toHaveLength(2);
  });

  it("flags excluded ranges", () => {
    const parsed = parseRetryStatusCodes("200-204,504,524");
    expect(parsed.excluded).toHaveLength(3);
  });
});

describe("isRetryableStatusCodeFromConfig", () => {
  const config = DEFAULT_RETRY_STATUS_CODES;

  it("retries whitelisted ranges", () => {
    expect(isRetryableStatusCodeFromConfig(500, config)).toBe(true);
    expect(isRetryableStatusCodeFromConfig(429, config)).toBe(true);
    expect(isRetryableStatusCodeFromConfig(503, config)).toBe(true);
  });

  it("never retries excluded statuses", () => {
    expect(isRetryableStatusCodeFromConfig(200, config)).toBe(false);
    expect(isRetryableStatusCodeFromConfig(201, config)).toBe(false);
    expect(isRetryableStatusCodeFromConfig(504, config)).toBe(false);
    expect(isRetryableStatusCodeFromConfig(524, config)).toBe(false);
  });

  it("does not retry statuses outside the whitelist", () => {
    expect(isRetryableStatusCodeFromConfig(400, config)).toBe(false);
    expect(isRetryableStatusCodeFromConfig(408, config)).toBe(false);
  });

  it("does not retry anything when the config is empty", () => {
    expect(isRetryableStatusCodeFromConfig(500, "")).toBe(false);
  });
});
