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
  <blockquote class="markdown-blockquote">
    <slot />
  </blockquote>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-blockquote {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--md-blockquote-border-color, var(--primary-color));
  background-color: var(--md-blockquote-bg-color, var(--hover-bg));
  color: var(--md-blockquote-color, var(--text-color-light));
  font-style: var(--md-blockquote-font-style, inherit);
  box-shadow: var(--md-blockquote-box-shadow, none);
  border-radius: var(--md-blockquote-border-radius, 4px);
}
</style>
