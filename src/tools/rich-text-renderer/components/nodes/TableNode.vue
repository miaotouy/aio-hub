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
  <div class="markdown-table-wrapper">
    <table class="markdown-table">
      <slot />
    </table>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  align?: ("left" | "center" | "right")[];
}>();
</script>

<style scoped>
.markdown-table-wrapper {
  margin: 12px 0;
  overflow-x: auto;
}

.markdown-table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
}

.markdown-table :deep(th),
.markdown-table :deep(td) {
  padding: 8px 12px;
  border: var(--border-width) solid var(--border-color);
}

.markdown-table :deep(th) {
  background-color: var(--card-bg);
  font-weight: 600;
}
</style>
