<script setup lang="ts">
import type { Component } from "vue";
import { Inbox } from "lucide-vue-next";

withDefaults(
  defineProps<{
    icon?: Component;
    title?: string;
    description?: string;
  }>(),
  { icon: undefined, title: undefined, description: undefined }
);
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon">
      <component :is="icon ?? Inbox" :size="44" />
    </div>
    <p v-if="title" class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

.empty-state__icon {
  color: var(--text-color-light);
  opacity: 0.7;
  margin-bottom: var(--space-1);
}

.empty-state__title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-color);
}

.empty-state__desc {
  margin: 0;
  max-width: 280px;
  font-size: var(--font-size-sm);
  color: var(--text-color-light);
  line-height: 1.5;
}

.empty-state__action {
  margin-top: var(--space-3);
}
</style>
