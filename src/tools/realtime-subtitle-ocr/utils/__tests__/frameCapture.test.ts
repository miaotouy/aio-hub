import { describe, expect, it } from "vitest";
import { normalizePixelRect } from "../frameCapture";

describe("frameCapture pixel rect normalization", () => {
  it("keeps rects fully inside the source", () => {
    expect(
      normalizePixelRect({ x: 100, y: 200, width: 300, height: 150 }, 1920, 1080)
    ).toEqual({ x: 100, y: 200, width: 300, height: 150 });
  });

  it("clamps negative origins and overflowing sizes", () => {
    expect(
      normalizePixelRect({ x: -20, y: -5, width: 99999, height: 99999 }, 100, 80)
    ).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });

  it("enforces at least one pixel for degenerate rects", () => {
    expect(
      normalizePixelRect({ x: 50, y: 40, width: 0, height: 0 }, 100, 80)
    ).toEqual({ x: 50, y: 40, width: 1, height: 1 });
  });

  it("clamps origin at the last valid pixel", () => {
    expect(
      normalizePixelRect({ x: 200, y: 200, width: 10, height: 10 }, 100, 80)
    ).toEqual({ x: 99, y: 79, width: 1, height: 1 });
  });
});
