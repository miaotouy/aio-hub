// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";

interface MeasuredVirtualizerOptions<T> {
  getItemKey: (item: T) => string | number;
  getScrollElement: () => HTMLElement | null;
  estimateSize: (index: number) => number;
  overscan?: number;
}

/** 纵向变高列表：数据身份、布局缓存与 DOM 测量使用同一份列表快照。 */
export function useMeasuredVirtualizer<T>(
  items: MaybeRefOrGetter<readonly T[]>,
  options: MeasuredVirtualizerOptions<T>
) {
  return useVirtualizer<HTMLElement, HTMLElement>(
    computed(() => {
      const snapshot = toValue(items);
      const keys = snapshot.map(options.getItemKey);
      return {
        ...options,
        overscan: options.overscan ?? 5,
        count: snapshot.length,
        // 同长度的筛选、排序也需更新键映射，不能只监听 count。
        getItemKey: (index: number) => keys[index],
        // 同一条目的摘要、展开态变化后，同步读取当前布局，避免返回旧缓存。
        // offsetHeight 使用布局坐标，保持与 translateY 一致。
        measureElement: (element: HTMLElement) => element.offsetHeight,
      };
    })
  );
}
