<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <strong class="markdown-strong">
    <slot />
  </strong>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-strong {
  font-weight: var(--md-strong-font-weight, 600);
  color: var(--md-strong-color, inherit);
  background-color: var(--md-strong-bg-color, transparent);
  text-shadow: var(--md-strong-text-shadow, none);
  text-decoration: var(--md-strong-text-decoration, none);
  border: 1px solid var(--md-strong-border-color, transparent);
  border-radius: var(--md-strong-border-radius, 0);
  box-shadow: var(--md-strong-box-shadow, none);
  padding: 0 2px;
}
</style>
