// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssetTile from "../AssetTile.vue";
import type { AssetRecord } from "../../types";

const asset: AssetRecord = {
  id: "asset-1",
  contentHash: "hash-1",
  kind: "image",
  mimeType: "image/png",
  displayName: "sample.png",
  sizeBytes: 1024,
  storageMode: "managed",
  availability: "ready",
  libraryState: "visible",
  retentionPolicy: "reclaimable",
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

afterEach(() => {
  vi.useRealTimers();
});

function dispatchPointer(
  element: Element,
  type: string,
  values: Record<string, number> = {}
) {
  const event = new Event(type, { bubbles: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { value });
  }
  element.dispatchEvent(event);
}

describe("AssetTile", () => {
  it("opens details on a regular click", async () => {
    const wrapper = mount(AssetTile, {
      props: { asset, selected: false },
    });

    const main = wrapper.get(".asset-main");
    dispatchPointer(main.element, "pointerdown", {
      button: 0,
      clientX: 12,
      clientY: 12,
    });
    dispatchPointer(main.element, "pointerup");
    await main.trigger("click");

    expect(wrapper.emitted("open")).toEqual([["asset-1"]]);
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("selects on long press without also opening details", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AssetTile, {
      props: { asset, selected: false },
    });
    const main = wrapper.get(".asset-main");

    dispatchPointer(main.element, "pointerdown", {
      button: 0,
      clientX: 12,
      clientY: 12,
    });
    await vi.advanceTimersByTimeAsync(450);
    dispatchPointer(main.element, "pointerup");
    await main.trigger("click");

    expect(wrapper.emitted("select")).toEqual([["asset-1"]]);
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("cancels long press after the pointer moves beyond tolerance", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AssetTile, {
      props: { asset, selected: false },
    });
    const main = wrapper.get(".asset-main");

    dispatchPointer(main.element, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    dispatchPointer(main.element, "pointermove", {
      clientX: 30,
      clientY: 10,
    });
    await vi.advanceTimersByTimeAsync(450);
    dispatchPointer(main.element, "pointerup");
    await main.trigger("click");

    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("suppresses opening if a long press has already selected and then moves", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AssetTile, {
      props: { asset, selected: false },
    });
    const main = wrapper.get(".asset-main");

    dispatchPointer(main.element, "pointerdown", {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    await vi.advanceTimersByTimeAsync(450);
    dispatchPointer(main.element, "pointermove", {
      clientX: 30,
      clientY: 10,
    });
    dispatchPointer(main.element, "pointerup");
    await main.trigger("click");

    expect(wrapper.emitted("select")).toEqual([["asset-1"]]);
    expect(wrapper.emitted("open")).toBeUndefined();
  });
});
