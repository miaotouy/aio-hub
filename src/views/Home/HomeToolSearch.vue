<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->

<template>
  <div class="search-bar">
    <input
      v-model="searchText"
      type="text"
      placeholder="搜索工具..."
      class="search-input"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const searchText = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});
</script>

<style scoped>
.search-bar {
  width: 100%;
  max-width: 1200px;
  margin-bottom: 10px;
  padding: 0 10px;
  box-sizing: border-box;
}

.search-input {
  width: 100%;
  max-width: 600px;
  padding: 0.6rem 1rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  font-size: 0.95rem;
  box-sizing: border-box;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
}
</style>
