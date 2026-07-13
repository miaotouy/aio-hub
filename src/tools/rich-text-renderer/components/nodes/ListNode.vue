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
  <component :is="tag" class="markdown-list">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  nodeId: string;
  ordered: boolean;
  start?: number;
}>();

const tag = computed(() => (props.ordered ? "ol" : "ul"));
</script>

<style scoped>
.markdown-list {
  margin: 8px 0;
  padding-left: 2em;
  color: var(--text-color);
}
</style>
