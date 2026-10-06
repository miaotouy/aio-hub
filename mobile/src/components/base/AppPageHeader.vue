<script setup lang="ts">
import { ChevronLeft } from "lucide-vue-next";

withDefaults(
  defineProps<{
    title?: string;
    showBack?: boolean;
    fixed?: boolean;
  }>(),
  { title: undefined, showBack: true, fixed: false }
);

const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <div v-if="fixed" class="app-page-header__spacer" aria-hidden="true"></div>
  <header class="app-page-header" :class="{ 'app-page-header--fixed': fixed }">
    <div class="app-page-header__left">
      <button
        v-if="showBack"
        type="button"
        class="app-page-header__btn"
        aria-label="返回"
        @click="emit('back')"
      >
        <ChevronLeft :size="24" />
      </button>
      <slot name="left" />
    </div>
    <h1 class="app-page-header__title">
      <slot name="title">{{ title }}</slot>
    </h1>
    <div class="app-page-header__right">
      <slot name="right" />
    </div>
  </header>
</template>

<style scoped>
.app-page-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--app-bar-height);
  padding: 0 var(--space-4);
  padding-top: var(--app-safe-area-top);
  box-sizing: border-box;
  background: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
}

.app-page-header--fixed {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-sticky);
}

.app-page-header__spacer {
  height: var(--app-top-offset);
}

.app-page-header__left,
.app-page-header__right {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.app-page-header__btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--app-radius-md);
  background: transparent;
  color: var(--text-color);
}

.app-page-header__btn:active {
  background: var(--input-bg);
}

.app-page-header__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
