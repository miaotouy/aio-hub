// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLICER_CONFIG,
  planImageSlicesFromVariances,
} from "../imageSlicing";

// Protect OCR/chat's shared continuous coverage and minimum-height contract.
// Synthetic row signals are independent of canvas encoding and component structure.
describe("image slice planning", () => {
  const config = { ...DEFAULT_SLICER_CONFIG, minCutHeight: 680 };
  const rows = (height: number, gaps: Array<[number, number]>) =>
    Array.from({ length: height }, (_, y) =>
      gaps.some(([start, end]) => y >= start && y < end) ? 0 : 1000
    );

  it("partitions at blank bands, covers every row once and merges a small tail", () => {
    const signal = rows(4200, [
      [950, 1010],
      [1950, 2010],
      [2950, 3010],
      [3950, 4010],
    ]);
    const plan = planImageSlicesFromVariances(1000, 4200, signal, config);
    expect(plan.regions).toEqual([
      { startY: 0, endY: 986 },
      { startY: 986, endY: 1986 },
      { startY: 1986, endY: 2986 },
      { startY: 2986, endY: 4200 },
    ]);
    expect(plan.regions.reduce((sum, r) => sum + r.endY - r.startY, 0)).toBe(
      4200
    );
  });

  it.each([
    {
      name: "disabled",
      width: 1000,
      height: 4200,
      enabled: false,
      blank: true,
    },
    {
      name: "at aspect threshold",
      width: 1000,
      height: 3000,
      enabled: true,
      blank: true,
    },
    {
      name: "no blank band",
      width: 1000,
      height: 4200,
      enabled: true,
      blank: false,
    },
  ])(
    "keeps the original region: $name",
    ({ width, height, enabled, blank }) => {
      const plan = planImageSlicesFromVariances(
        width,
        height,
        rows(height, blank ? [[950, 1000]] : []),
        { ...config, enabled }
      );
      expect(plan.regions).toEqual([{ startY: 0, endY: height }]);
    }
  );
});
