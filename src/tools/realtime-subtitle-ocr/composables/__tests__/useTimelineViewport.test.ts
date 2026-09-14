import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useTimelineViewport } from "../useTimelineViewport";

function createViewport(durationMs = 60_000) {
  const viewport = useTimelineViewport(ref(durationMs));
  viewport.setViewportWidth(600);
  return viewport;
}

describe("useTimelineViewport", () => {
  it("fits the full duration into the viewport", () => {
    const viewport = createViewport();
    viewport.fit(60_000);
    expect(viewport.pxPerSecond.value).toBeCloseTo(10);
    expect(viewport.scrollX.value).toBeCloseTo(0);
    expect(viewport.timeToX(30_000)).toBeCloseTo(300);
  });

  it("round-trips time and screen positions", () => {
    const viewport = createViewport();
    viewport.fit(60_000);
    expect(viewport.xToTime(viewport.timeToX(42_000))).toBeCloseTo(42_000);
  });

  it("zooms around an anchor while keeping the anchor time fixed", () => {
    const viewport = createViewport();
    viewport.fit(60_000);
    viewport.zoomBy(2, 300);
    expect(viewport.pxPerSecond.value).toBeCloseTo(20);
    expect(viewport.timeToX(30_000)).toBeCloseTo(300);
  });

  it("keeps a timestamp visible and clamps scrolling", () => {
    const viewport = createViewport();
    viewport.fit(60_000);
    viewport.setPxPerSecond(20);
    viewport.ensureVisible(55_000, 80);
    const x = viewport.timeToX(55_000);
    expect(x).toBeGreaterThanOrEqual(80);
    expect(x).toBeLessThanOrEqual(520);

    viewport.scrollBy(-10_000);
    expect(viewport.scrollX.value).toBe(0);
    viewport.scrollBy(1_000_000);
    expect(viewport.scrollX.value).toBeCloseTo(
      viewport.scrollWidth.value - viewport.viewportWidth.value
    );
  });

  it("clamps setScrollX to the scrollable range", () => {
    const viewport = createViewport();
    viewport.setPxPerSecond(20);
    viewport.setScrollX(-100);
    expect(viewport.scrollX.value).toBe(0);
    viewport.setScrollX(1_000_000);
    expect(viewport.scrollX.value).toBeCloseTo(
      viewport.scrollWidth.value - viewport.viewportWidth.value
    );
  });
});
