import { describe, expect, it } from "vitest";
import {
  calculateVideoFrameCount,
  clampVideoRoi,
  normalizeVideoRange,
  videoRoiToPixels,
} from "../video";

describe("video subtitle OCR helpers", () => {
  it("converts normalized ROI to bounded pixel crop", () => {
    expect(
      videoRoiToPixels({ x: 0.05, y: 0.5, width: 0.9, height: 0.3 }, 1920, 1080)
    ).toEqual({
      x: 96,
      y: 540,
      width: 1728,
      height: 324,
    });
  });

  it("clamps invalid and tiny ROI values", () => {
    const roi = clampVideoRoi({ x: -1, y: 2, width: 0, height: 3 });
    expect(roi.x).toBe(0);
    expect(roi.y).toBeCloseTo(0.99);
    expect(roi.width).toBeCloseTo(0.01);
    expect(roi.height).toBeCloseTo(0.01);
    expect(videoRoiToPixels(roi, 101, 101)).toMatchObject({
      x: 0,
      y: 99,
      width: 1,
      height: 1,
    });
  });

  it("keeps odd source dimensions and tiny crops valid", () => {
    expect(
      videoRoiToPixels(
        { x: 0.1, y: 0.1, width: 0.333, height: 0.333 },
        101,
        101
      )
    ).toEqual({
      x: 10,
      y: 10,
      width: 32,
      height: 32,
    });
  });

  it("calculates inclusive frame count", () => {
    expect(calculateVideoFrameCount(10_000, 20_000, 1_000)).toBe(11);
    expect(calculateVideoFrameCount(0, 0, 1_000)).toBe(1);
  });

  it("normalizes time ranges to the video duration", () => {
    expect(normalizeVideoRange(-500, 99_999, 10_000)).toEqual({
      startMs: 0,
      endMs: 10_000,
    });
    expect(normalizeVideoRange(8_000, 2_000, 10_000)).toEqual({
      startMs: 8_000,
      endMs: 8_000,
    });
  });
});
