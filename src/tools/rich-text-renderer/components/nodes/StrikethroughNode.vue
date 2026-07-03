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
  <del class="markdown-strikethrough">
    <slot />
  </del>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-strikethrough {
  text-decoration: line-through;
  color: var(--md-strikethrough-color, inherit);
  background-color: var(--md-strikethrough-bg-color, transparent);
  text-shadow: var(--md-strikethrough-text-shadow, none);
  text-decoration-color: var(--md-strikethrough-text-decoration-color, inherit);
  text-decoration-style: var(--md-strikethrough-text-decoration-style, solid);
  border: 1px solid var(--md-strikethrough-border-color, transparent);
  border-radius: var(--md-strikethrough-border-radius, 0);
  box-shadow: var(--md-strikethrough-box-shadow, none);
  padding: 0 2px;
}
</style>
