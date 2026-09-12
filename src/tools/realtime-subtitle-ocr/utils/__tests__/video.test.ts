import { describe, expect, it } from "vitest";
import {
  calculateVideoFrameCount,
  clampVideoRoi,
  isCornerHandle,
  normalizeVideoRange,
  resizeVideoRoi,
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

function expectRoi(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number }
) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.width).toBeCloseTo(expected.width);
  expect(actual.height).toBeCloseTo(expected.height);
}

describe("resizeVideoRoi", () => {
  const origin = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

  it("resizes edges without an aspect ratio", () => {
    expectRoi(resizeVideoRoi(origin, "e", 0.1, 0), {
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.4,
    });
    expectRoi(resizeVideoRoi(origin, "s", 0, 0.1), {
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.5,
    });
    expectRoi(resizeVideoRoi(origin, "n", 0, 0.1), {
      x: 0.1,
      y: 0.3,
      width: 0.3,
      height: 0.3,
    });
  });

  it("keeps the aspect ratio on corner handles and anchors the opposite corner", () => {
    expectRoi(
      resizeVideoRoi(
        { x: 0, y: 0, width: 0.4, height: 0.2 },
        "se",
        0.2,
        0,
        0.01,
        2
      ),
      { x: 0, y: 0, width: 0.6, height: 0.3 }
    );
    expectRoi(
      resizeVideoRoi(
        { x: 0.5, y: 0.5, width: 0.4, height: 0.2 },
        "nw",
        -0.1,
        0,
        0.01,
        2
      ),
      { x: 0.4, y: 0.45, width: 0.5, height: 0.25 }
    );
  });

  it("uses vertical corner dragging when it is the dominant movement", () => {
    expectRoi(
      resizeVideoRoi(
        { x: 0.1, y: 0.2, width: 0.3, height: 0.15 },
        "se",
        0,
        0.1,
        0.01,
        2
      ),
      { x: 0.1, y: 0.2, width: 0.5, height: 0.25 }
    );
  });

  it("preserves the aspect ratio at the frame boundary", () => {
    const resized = resizeVideoRoi(
      { x: 0.5, y: 0.5, width: 0.4, height: 0.2 },
      "se",
      0.5,
      0.5,
      0.01,
      2
    );
    expectRoi(resized, { x: 0.5, y: 0.5, width: 0.5, height: 0.25 });
    expect(resized.width / resized.height).toBeCloseTo(2);
  });

  it("ignores the aspect ratio for non-corner handles", () => {
    expectRoi(resizeVideoRoi(origin, "e", 0.1, 0, 0.01, 2), {
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.4,
    });
  });

  it("enforces the minimum size while preserving the ratio", () => {
    const tiny = resizeVideoRoi(
      { x: 0, y: 0, width: 0.4, height: 0.2 },
      "se",
      -1,
      0,
      0.05,
      2
    );
    // 宽高都不得低于 minSize，比例优先级低于最小尺寸。
    expect(tiny.height).toBeCloseTo(0.05);
    expect(tiny.width).toBeCloseTo(0.1);
    expect(tiny.width / tiny.height).toBeCloseTo(2);
  });

  it("recognizes corner handles", () => {
    expect(isCornerHandle("nw")).toBe(true);
    expect(isCornerHandle("n")).toBe(false);
  });
});
