// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  onMounted,
  onBeforeUnmount,
  onScopeDispose,
  provide,
  ref,
  watch,
  type Ref,
} from "vue";
import { rendererReadingAreaKey } from "@/tools/rich-text-renderer/composables/useRendererDisplay";

const READING_MARGIN = 600;

/** Shared warm range; geometry reads use ordered row shells, never skipped rich-text descendants. */
export function provideMessageReadingArea(options: {
  viewport: Ref<HTMLElement | null>;
  rows: Ref<HTMLElement | null>;
  active: Readonly<Ref<boolean>>;
}) {
  const entries = new Map<
    HTMLElement,
    { row: Element; nearby: Ref<boolean> }
  >();
  let frame: number | undefined;
  function refresh() {
    if (options.active.value && frame === undefined)
      frame = requestAnimationFrame(flush);
  }
  function flush() {
    frame = undefined;
    const viewport = options.viewport.value;
    const rows = options.rows.value?.children;
    if (!options.active.value || !viewport || !rows?.length) return;
    const area = viewport.getBoundingClientRect();
    if (area.height <= 0 || area.width <= 0) return;
    const startY = area.top - READING_MARGIN,
      endY = area.bottom + READING_MARGIN;
    let low = 0,
      high = rows.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (rows[mid].getBoundingClientRect().bottom < startY) low = mid + 1;
      else high = mid;
    }
    const visible = new Set<Element>();
    for (let index = low; index < rows.length; index++) {
      const row = rows[index];
      if (row.getBoundingClientRect().top > endY) break;
      visible.add(row);
    }
    for (const entry of entries.values())
      entry.nearby.value = visible.has(entry.row);
  }
  provide(rendererReadingAreaKey, {
    register(element) {
      const nearby = ref(true);
      const stop = watch(
        element,
        (value, old) => {
          if (old) entries.delete(old);
          if (value)
            entries.set(value, {
              row: value.closest(".message-slot") ?? value,
              nearby,
            });
          refresh();
        },
        { immediate: true, flush: "post" }
      );
      onScopeDispose(() => {
        stop();
        if (element.value) entries.delete(element.value);
      });
      return nearby;
    },
  });
  watch([options.viewport, options.rows, options.active], refresh, {
    flush: "post",
  });
  onMounted(() => window.addEventListener("resize", refresh));
  onBeforeUnmount(() => {
    window.removeEventListener("resize", refresh);
    if (frame !== undefined) cancelAnimationFrame(frame);
    entries.clear();
  });
  return { refresh };
}
