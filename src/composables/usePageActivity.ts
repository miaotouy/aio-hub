// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import {
  computed,
  inject,
  provide,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  type InjectionKey,
  type Ref,
} from "vue";

const pageActivityKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol(
  "workspace-page-activity"
);

/** 缓存边界统一恢复页面活动状态，让嵌套浮层按父子顺序重新接管焦点。 */
export function providePageActivity() {
  provide(pageActivityKey, usePageActivity());
}

/** 当前组件所在缓存页面的激活状态；后台业务任务应使用独立生命周期。 */
export function usePageActivity() {
  const inheritedActivity = inject(pageActivityKey, null);
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
  // 共享状态优先求值，由缓存边界按订阅顺序恢复嵌套浮层。
  return computed(() => (inheritedActivity?.value ?? true) && active.value);
}
