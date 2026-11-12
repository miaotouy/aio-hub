// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { computed, type Ref } from "vue";
import { usePageActivity } from "./usePageActivity";

/** 原生弹窗与抽屉使用此可见性绑定，页面缓存保留其原始打开状态。 */
export function usePageOverlay(requestedVisible: Ref<boolean>) {
  const active = usePageActivity();
  const visible = computed({
    get: () => active.value && requestedVisible.value,
    set: (value: boolean) => {
      // 隐藏触发的退场事件只结束展示，保留所属页面的编辑状态。
      if (active.value) requestedVisible.value = value;
    },
  });
  return { visible, active };
}
