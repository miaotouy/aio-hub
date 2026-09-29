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
  cartesianToPolar,
  getQuadrant,
  polarToCartesian,
  quadrantLabel,
  resolveCoordinate,
  resolveOriginPixel,
} from "../coordinateTransforms";
import type { CoordinateOrigin } from "../../types";

const SIZE = { width: 200, height: 100 };
const ORIGIN: CoordinateOrigin = { xPercent: 50, yPercent: 50 };

describe("polarToCartesian / cartesianToPolar", () => {
  it("converts cardinal angles", () => {
    // 0° 正右方
    expect(polarToCartesian(0, 100).dx).toBeCloseTo(100);
    expect(polarToCartesian(0, 100).dy).toBeCloseTo(0);
    // 90° 逆时针为正 -> 正上方（dy 向上为正）
    expect(polarToCartesian(90, 100).dx).toBeCloseTo(0);
    expect(polarToCartesian(90, 100).dy).toBeCloseTo(100);
    // 180° 正左方
    expect(polarToCartesian(180, 100).dx).toBeCloseTo(-100);
    // 270° 正下方
    expect(polarToCartesian(270, 100).dy).toBeCloseTo(-100);
  });

  it("round-trips polar and cartesian", () => {
    const polar = cartesianToPolar(30, 40);
    expect(polar.radius).toBeCloseTo(50);
    expect(polar.angle).toBeCloseTo(53.13010235415598);
    const back = polarToCartesian(polar.angle, polar.radius);
    expect(back.dx).toBeCloseTo(30);
    expect(back.dy).toBeCloseTo(40);
  });
});

describe("getQuadrant", () => {
  it("follows mathematical convention", () => {
    expect(getQuadrant(1, 1)).toBe(1);
    expect(getQuadrant(-1, 1)).toBe(2);
    expect(getQuadrant(-1, -1)).toBe(3);
    expect(getQuadrant(1, -1)).toBe(4);
    expect(getQuadrant(0, 5)).toBeNull();
    expect(getQuadrant(5, 0)).toBeNull();
    expect(getQuadrant(0, 0)).toBeNull();
  });

  it("labels quadrants in Chinese", () => {
    expect(quadrantLabel(3)).toContain("左下");
    expect(quadrantLabel(null)).toContain("坐标轴");
  });
});

describe("resolveOriginPixel", () => {
  it("uses given percent origin", () => {
    expect(resolveOriginPixel(ORIGIN, SIZE)).toEqual({ x: 100, y: 50 });
    expect(resolveOriginPixel({ xPercent: 25, yPercent: 75 }, SIZE)).toEqual({
      x: 50,
      y: 75,
    });
  });

  it("falls back to geometric center when origin is null", () => {
    expect(resolveOriginPixel(null, SIZE)).toEqual({ x: 100, y: 50 });
  });
});

describe("resolveCoordinate", () => {
  it("keeps pixel passthrough behavior", () => {
    expect(
      resolveCoordinate({ mode: "pixel", x: 12, y: 34 }, SIZE, ORIGIN)
    ).toEqual({ x: 12, y: 34, clamped: false });
  });

  it("keeps percent behavior", () => {
    expect(
      resolveCoordinate({ mode: "percent", x: 25, y: 50 }, SIZE, ORIGIN)
    ).toEqual({ x: 50, y: 50, clamped: false });
  });

  it("flips y axis for center mode", () => {
    // 原点 (100, 50)：dx=+10, dy=+10（向上）-> 屏幕 (110, 40)
    expect(
      resolveCoordinate({ mode: "center", x: 10, y: 10 }, SIZE, ORIGIN)
    ).toEqual({ x: 110, y: 40, clamped: false });
    // dy=-10（向下）-> 屏幕 y 增加
    expect(
      resolveCoordinate({ mode: "center", x: 0, y: -10 }, SIZE, ORIGIN)
    ).toEqual({ x: 100, y: 60, clamped: false });
  });

  it("uses geometric center when origin is null", () => {
    expect(
      resolveCoordinate({ mode: "center", x: 10, y: 10 }, SIZE, null)
    ).toEqual({ x: 110, y: 40, clamped: false });
  });

  it("supports custom calibrated origin", () => {
    // 原点 (50, 25)：dx=+5, dy=+5 -> (55, 20)
    expect(
      resolveCoordinate(
        { mode: "center", x: 5, y: 5 },
        SIZE,
        { xPercent: 25, yPercent: 25 }
      )
    ).toEqual({ x: 55, y: 20, clamped: false });
  });

  it("normalizes polar form before resolving", () => {
    // 90° 半径 20 -> dx=0, dy=+20（向上）-> 屏幕 (100, 30)
    expect(
      resolveCoordinate(
        { mode: "center", x: 90, y: 20, form: "polar" },
        SIZE,
        ORIGIN
      )
    ).toEqual({ x: 100, y: 30, clamped: false });
    // 0° 半径 30 -> 正右方
    expect(
      resolveCoordinate(
        { mode: "center", x: 0, y: 30, form: "polar" },
        SIZE,
        ORIGIN
      )
    ).toEqual({ x: 130, y: 50, clamped: false });
  });

  it("clamps out-of-bounds points and reports clamped", () => {
    // 超出右边界
    const right = resolveCoordinate(
      { mode: "center", x: 500, y: 0 },
      SIZE,
      ORIGIN
    );
    expect(right.x).toBe(199);
    expect(right.y).toBe(50);
    expect(right.clamped).toBe(true);
    // 超出顶部
    const top = resolveCoordinate(
      { mode: "center", x: 0, y: 500 },
      SIZE,
      ORIGIN
    );
    expect(top.y).toBe(0);
    expect(top.clamped).toBe(true);
  });

  it("degrades to origin when client size is unavailable", () => {
    expect(
      resolveCoordinate({ mode: "center", x: 10, y: 10 }, null, ORIGIN)
    ).toEqual({ x: 0, y: 0, clamped: false });
    expect(
      resolveCoordinate({ mode: "percent", x: 25, y: 50 }, null, ORIGIN)
    ).toEqual({ x: 0, y: 0, clamped: false });
  });
});
