// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { effectScope, nextTick, ref, type EffectScope } from "vue";
import { useMeasuredVirtualizer } from "../useMeasuredVirtualizer";

const scopes: EffectScope[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  document.body.replaceChildren();
});

function createList() {
  const items = ref([{ id: "a" }, { id: "b" }, { id: "c" }]);
  const parent = document.createElement("div");
  Object.defineProperties(parent, {
    offsetHeight: { value: 800 },
    offsetWidth: { value: 400 },
  });
  document.body.append(parent);
  const scope = effectScope();
  scopes.push(scope);
  const virtualizer = scope.run(() =>
    useMeasuredVirtualizer(items, {
      getItemKey: (item) => item.id,
      getScrollElement: () => parent,
      estimateSize: () => 50,
    })
  )!;

  function measure(
    index: number,
    height: number,
    element = document.createElement("div")
  ) {
    element.dataset.index = String(index);
    Object.defineProperty(element, "offsetHeight", {
      configurable: true,
      value: height,
    });
    parent.append(element);
    virtualizer.value.measureElement(element);
    return element;
  }
  function layout() {
    return virtualizer.value
      .getVirtualItems()
      .map(({ key, start, size }) => ({ key, start, size }));
  }
  measure(0, 60);
  measure(1, 120);
  measure(2, 80);
  return { items, virtualizer, measure, layout };
}

describe("useMeasuredVirtualizer layout", () => {
  it("tracks in-place sorting without a count change", async () => {
    const list = createList();
    list.items.value.reverse();
    await nextTick();
    expect(list.layout()).toEqual([
      { key: "c", start: 0, size: 80 },
      { key: "b", start: 80, size: 120 },
      { key: "a", start: 200, size: 60 },
    ]);
  });

  it("keeps measured heights with item identity after same-length reorder and replacement", async () => {
    const list = createList();
    list.items.value = [{ id: "b" }, { id: "a" }, { id: "d" }];
    await nextTick();
    expect(list.layout()).toEqual([
      { key: "b", start: 0, size: 120 },
      { key: "a", start: 120, size: 60 },
      { key: "d", start: 180, size: 50 },
    ]);
    expect(list.virtualizer.value.getTotalSize()).toBe(230);
  });

  it("updates subsequent positions when a reused row grows and shrinks", () => {
    const list = createList();
    const element = list.measure(1, 200);
    expect(list.layout()[2]).toEqual({ key: "c", start: 260, size: 80 });
    expect(list.virtualizer.value.getTotalSize()).toBe(340);
    list.measure(1, 40, element);
    expect(list.layout()[2]).toEqual({ key: "c", start: 100, size: 80 });
    expect(list.virtualizer.value.getTotalSize()).toBe(180);
  });

  it("restores cached item heights after filtering and accepts fresh mounted content", async () => {
    const list = createList();
    list.items.value = [{ id: "c" }];
    await nextTick();
    expect(list.layout()).toEqual([{ key: "c", start: 0, size: 80 }]);
    list.items.value = [{ id: "a" }, { id: "c" }];
    await nextTick();
    list.measure(0, 90);
    expect(list.layout()).toEqual([
      { key: "a", start: 0, size: 90 },
      { key: "c", start: 90, size: 80 },
    ]);
  });
});
