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

/**
 * useTimelineViewport - 横向可缩放时间轴视口。
 *
 * `pxPerSecond` 控制缩放，`scrollX` 控制横向滚动（像素）。
 * 时间与屏幕 x 的换算：x = ms / 1000 * pxPerSecond - scrollX。
 */

import { computed, ref, type Ref } from "vue";

const MIN_PX_PER_SECOND = 2;
const MAX_PX_PER_SECOND = 4000;

export interface TimelineViewport {
  pxPerSecond: Ref<number>;
  scrollX: Ref<number>;
  scrollWidth: Ref<number>;
  viewportWidth: Ref<number>;
  setViewportWidth: (width: number) => void;
  fit: (durationMs: number) => void;
  zoomBy: (factor: number, anchorPx?: number) => void;
  setPxPerSecond: (value: number, anchorPx?: number) => void;
  scrollBy: (dx: number) => void;
  setScrollX: (value: number) => void;
  timeToX: (ms: number) => number;
  xToTime: (x: number) => number;
  ensureVisible: (ms: number, padding?: number) => void;
}

export function useTimelineViewport(durationMs: Ref<number>): TimelineViewport {
  const pxPerSecond = ref(40);
  const scrollX = ref(0);
  const viewportWidth = ref(0);

  const scrollWidth = computed(
    () => (durationMs.value / 1000) * pxPerSecond.value
  );

  function setViewportWidth(width: number) {
    viewportWidth.value = width;
  }

  function clampScale(value: number): number {
    return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, value));
  }

  function clampScroll(value: number): number {
    const maxScroll = Math.max(0, scrollWidth.value - viewportWidth.value);
    return Math.min(maxScroll, Math.max(0, value));
  }

  function timeToX(ms: number): number {
    return (ms / 1000) * pxPerSecond.value - scrollX.value;
  }

  function xToTime(x: number): number {
    return ((x + scrollX.value) / pxPerSecond.value) * 1000;
  }

  function fit(duration: number) {
    const seconds = Math.max(0.001, duration / 1000);
    pxPerSecond.value = clampScale(
      viewportWidth.value > 0 ? viewportWidth.value / seconds : 40
    );
    scrollX.value = 0;
  }

  function setPxPerSecond(value: number, anchorPx?: number) {
    const anchor = anchorPx ?? viewportWidth.value / 2;
    const anchorTime = xToTime(anchor);
    pxPerSecond.value = clampScale(value);
    scrollX.value = clampScroll(
      (anchorTime / 1000) * pxPerSecond.value - anchor
    );
  }

  function zoomBy(factor: number, anchorPx?: number) {
    setPxPerSecond(pxPerSecond.value * factor, anchorPx);
  }

  function scrollBy(dx: number) {
    scrollX.value = clampScroll(scrollX.value + dx);
  }

  function setScrollX(value: number) {
    scrollX.value = clampScroll(value);
  }

  function ensureVisible(ms: number, padding = 80) {
    const x = timeToX(ms);
    if (x < padding) {
      scrollX.value = clampScroll(scrollX.value - (padding - x));
    } else if (x > viewportWidth.value - padding) {
      scrollX.value = clampScroll(
        scrollX.value + (x - (viewportWidth.value - padding))
      );
    }
  }

  return {
    pxPerSecond,
    scrollX,
    scrollWidth,
    viewportWidth,
    setViewportWidth,
    fit,
    zoomBy,
    setPxPerSecond,
    scrollBy,
    setScrollX,
    timeToX,
    xToTime,
    ensureVisible,
  };
}
