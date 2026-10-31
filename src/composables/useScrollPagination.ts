// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { usePageActivity } from "./usePageActivity";

/** 首屏由调用方加载，后续分页只响应可见列表的向下滚动。 */
export function useScrollPagination(options: {
  canLoadMore: () => boolean;
  loadMore: () => void | Promise<void>;
  distance?: number;
}) {
  const active = usePageActivity();
  let pending = false;
  let previousTop = 0;
  return async (event: Event) => {
    const element = event.currentTarget as HTMLElement;
    const top = element.scrollTop;
    const movedDown = top > previousTop;
    previousTop = top;
    if (
      !active.value ||
      pending ||
      !movedDown ||
      top <= 0 ||
      element.clientHeight <= 0 ||
      !options.canLoadMore() ||
      element.scrollHeight - top - element.clientHeight >
        (options.distance ?? 80)
    )
      return;
    pending = true;
    try {
      await options.loadMore();
    } finally {
      pending = false;
    }
  };
}
