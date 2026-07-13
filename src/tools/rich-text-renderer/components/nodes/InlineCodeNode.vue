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
  <code class="markdown-inline-code">{{ content }}</code>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  content: string;
}>();
</script>

<style scoped>
.markdown-inline-code {
  padding: 2px 6px;
  background-color: var(--md-inline-code-bg-color, rgba(150, 150, 150, 0.1));
  border-radius: var(--md-inline-code-border-radius, 3px);
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 0.9em;
  color: var(--md-inline-code-color, var(--primary-color));
  border: 1px solid var(--md-inline-code-border-color, transparent);
  box-shadow: var(--md-inline-code-box-shadow, none);
  text-shadow: var(--md-inline-code-text-shadow, none);
  font-weight: var(--md-inline-code-font-weight, inherit);
  font-style: var(--md-inline-code-font-style, inherit);
  text-decoration: var(--md-inline-code-text-decoration, none);
}
</style>
