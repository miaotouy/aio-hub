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

<script setup lang="ts">
import { computed } from "vue";
import type { GuidedFlowStep } from "@/services/guided-flow";

const props = defineProps<{
  steps: GuidedFlowStep<Record<string, unknown>>[];
  currentStepId?: string;
}>();

const currentIndex = computed(() =>
  Math.max(
    0,
    props.steps.findIndex((step) => step.id === props.currentStepId)
  )
);
</script>

<template>
  <nav class="guided-flow-stepper" aria-label="引导流程步骤">
    <ol>
      <li
        v-for="(step, index) in steps"
        :key="step.id"
        :class="{
          active: step.id === currentStepId,
          completed: index < currentIndex,
        }"
      >
        <span class="step-index">{{ index + 1 }}</span>
        <span class="step-title">{{ step.title }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.guided-flow-stepper {
  overflow-x: auto;
  padding-bottom: 2px;
}

ol {
  display: flex;
  min-width: max-content;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

li:not(:last-child)::after {
  width: 20px;
  height: 1px;
  margin-left: 2px;
  background: var(--border-color);
  content: "";
}

.step-index {
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  font-size: 11px;
}

li.active {
  color: var(--primary-color);
  font-weight: 600;
}

li.active .step-index,
li.completed .step-index {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: var(--primary-text-color, #fff);
}

li.completed {
  color: var(--text-color);
}
</style>
