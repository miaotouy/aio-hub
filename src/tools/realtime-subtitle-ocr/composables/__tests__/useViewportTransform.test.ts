import { describe, expect, it } from "vitest";
import { computed, ref } from "vue";
import { useViewportTransform } from "../useViewportTransform";

function createTransform(containerWidth = 800, containerHeight = 600) {
  return useViewportTransform({
    containerWidth: ref(containerWidth),
    containerHeight: ref(containerHeight),
    contentWidth: computed(() => 1600),
    contentHeight: computed(() => 1200),
  });
}

describe("useViewportTransform", () => {
  it("fits the content and centers it", () => {
    const transform = createTransform();
    transform.fit();
    expect(transform.scale.value).toBeCloseTo(0.5);
    expect(transform.offsetX.value).toBeCloseTo(0);
    expect(transform.offsetY.value).toBeCloseTo(0);
    expect(transform.isFitted.value).toBe(true);
    expect(transform.contentStyle.value.transform).toContain("scale(0.5)");
  });

  it("keeps the anchor content point stable while zooming", () => {
    const transform = createTransform();
    transform.fit();
    const contentX = (200 - transform.offsetX.value) / transform.scale.value;
    const contentY = (150 - transform.offsetY.value) / transform.scale.value;

    transform.setScale(1, 200, 150);

    expect((200 - transform.offsetX.value) / transform.scale.value).toBeCloseTo(
      contentX
    );
    expect((150 - transform.offsetY.value) / transform.scale.value).toBeCloseTo(
      contentY
    );
    expect(transform.isFitted.value).toBe(false);
  });

  it("clamps scale and supports actual size and panning", () => {
    const transform = createTransform();
    transform.setScale(1000);
    expect(transform.scale.value).toBe(16);
    transform.setScale(0.00001);
    expect(transform.scale.value).toBe(0.02);

    transform.actualSize();
    expect(transform.scale.value).toBe(1);

    const beforeX = transform.offsetX.value;
    transform.panBy(30, -20);
    expect(transform.offsetX.value).toBe(beforeX + 30);
    expect(transform.isFitted.value).toBe(false);
  });

  it("converts screen coordinates back to content coordinates", () => {
    const transform = createTransform();
    transform.setScale(2, 0, 0);
    const point = transform.toContentPoint(400, 300);
    expect(point.x).toBeCloseTo((400 - transform.offsetX.value) / 2);
    expect(point.y).toBeCloseTo((300 - transform.offsetY.value) / 2);
  });
});
