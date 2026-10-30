<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<script setup lang="ts">
import {
  computed,
  defineComponent,
  h,
  Suspense,
  watch,
  type PropType,
  type VNode,
} from "vue";

const props = defineProps<{
  component?: VNode;
  cacheKey: string;
  cachedKeys: string[];
}>();

// KeepAlive 按组件名筛选缓存。用独立边界把路由路径映射到缓存名，
// 避免工具组件名与路由名不同、多个工具共用组件时无法单独回收。
const entries = new Map<string, ReturnType<typeof createEntry>>();
let nextId = 0;
function createEntry() {
  return defineComponent({
    name: `WorkspaceRoute${nextId++}`,
    props: { page: Object as PropType<VNode> },
    setup(entryProps, { slots }) {
      // 每个缓存项持有自己的 VNode；切换路由时停用项仍保留原页面。
      return () =>
        h(Suspense, null, {
          default: () => entryProps.page,
          fallback: slots.fallback,
        });
    },
  });
}
function entryFor(key: string) {
  let entry = entries.get(key);
  if (!entry) {
    entry = createEntry();
    entries.set(key, entry);
  }
  return entry;
}

const activeEntry = computed(() => entryFor(props.cacheKey));
const cachedNames = computed(() =>
  props.cachedKeys.map((key) => entryFor(key).name!)
);

watch(
  () => [props.cacheKey, ...props.cachedKeys],
  (keys) => {
    const retained = new Set(keys);
    for (const key of entries.keys()) {
      if (!retained.has(key)) entries.delete(key);
    }
  },
  { flush: "post" }
);
</script>

<template>
  <KeepAlive :include="cachedNames">
    <component :is="activeEntry" :key="cacheKey" :page="component">
      <template #fallback>
        <slot name="fallback" />
      </template>
    </component>
  </KeepAlive>
</template>
