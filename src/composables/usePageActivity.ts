// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import {
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  readonly,
  ref,
} from "vue";

/** 当前组件所在缓存页面的激活状态；后台业务任务应使用独立生命周期。 */
export function usePageActivity() {
  const active = ref(true);
  onActivated(() => {
    active.value = true;
  });
  onDeactivated(() => {
    active.value = false;
  });
  onBeforeUnmount(() => {
    active.value = false;
  });
  return readonly(active);
}
