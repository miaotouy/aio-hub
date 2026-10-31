<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<script setup lang="ts">
import {
  onBeforeUnmount,
  shallowRef,
  ref,
  watch,
  type Component,
  type ShallowRef,
} from "vue";
import BaseDialog from "./BaseDialog.vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  open: boolean;
  title: string;
  loader: () => Promise<{ default: Component }>;
}>();
const emit = defineEmits<{ (event: "close"): void }>();
const panel: ShallowRef<Component | null> = shallowRef(null);
const failed = ref(false);
const errorHandler = createModuleErrorHandler("lazy-panel");
let request: Promise<void> | null = null;
let destroyed = false;

function load(): Promise<void> {
  if (panel.value || destroyed) return Promise.resolve();
  if (request) return request;
  failed.value = false;
  request = Promise.resolve()
    .then(() => props.loader())
    .then(({ default: component }) => {
      if (!destroyed) panel.value = component;
    })
    .catch((error: unknown) => {
      if (destroyed) return;
      failed.value = true;
      errorHandler.handle(error, {
        userMessage: "面板加载失败，请重试",
        showToUser: false,
        context: { panel: props.title },
      });
    })
    .finally(() => {
      request = null;
    });
  return request;
}
watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  destroyed = true;
});
</script>

<template>
  <!-- Keep a successfully loaded panel mounted to preserve its local state. -->
  <component v-if="panel" :is="panel" v-bind="$attrs" />
  <BaseDialog
    v-else-if="open"
    :model-value="open"
    :title="title"
    width="420px"
    :show-footer="false"
    @update:model-value="
      (value) => {
        if (!value) emit('close');
      }
    "
  >
    <template #content>
      <div
        class="panel-load-state"
        :role="failed ? 'alert' : 'status'"
        :aria-busy="!failed"
      >
        <span>{{ failed ? "面板加载失败" : "正在加载…" }}</span>
        <button
          v-if="failed"
          type="button"
          class="panel-load-retry"
          @click="load"
        >
          重新加载
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.panel-load-state {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-secondary);
}
.panel-load-retry {
  padding: 5px 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--primary-color);
  font: inherit;
  cursor: pointer;
}
.panel-load-retry:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
</style>
