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
  <component :is="tag" :class="['markdown-table-cell', alignClass]">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  nodeId: string;
  align?: "left" | "center" | "right";
  isHeader?: boolean;
}>();

const tag = computed(() => (props.isHeader ? "th" : "td"));

const alignClass = computed(() => {
  if (!props.align) return "";
  return `align-${props.align}`;
});
</script>

<style scoped>
.markdown-table-cell {
  color: var(--text-color);
}

.align-left {
  text-align: left;
}

.align-center {
  text-align: center;
}

.align-right {
  text-align: right;
}
</style>
