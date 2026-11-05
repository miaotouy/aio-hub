// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { describe, expect, it } from "vitest";
import { getPhysicalCaptureRect } from "../captureGeometry";

describe("physical monitor capture", () => {
  it("uses the source window scale and physical virtual-desktop origin on mixed-DPI displays", () => {
    expect(
      getPhysicalCaptureRect(
        {
          x: -1280,
          y: 0,
          width: 400,
          height: 200,
          scaleFactor: 1.5,
          physicalBounds: { x: -1920, y: 120, width: 600, height: 300 },
        },
        2
      )
    ).toEqual({ x: -1917, y: 159, width: 594, height: 258 });
  });
  it("retains legacy geometry conversion and excludes the border/titlebar at fractional scales", () => {
    expect(
      getPhysicalCaptureRect({ x: 10, y: 20, width: 400, height: 200 }, 1.25)
    ).toEqual({ x: 15, y: 58, width: 495, height: 215 });
    expect(
      getPhysicalCaptureRect({ x: 0, y: 0, width: 4, height: 28 })
    ).toBeNull();
    expect(
      getPhysicalCaptureRect({ x: NaN, y: 0, width: 400, height: 200 })
    ).toBeNull();
  });
});
