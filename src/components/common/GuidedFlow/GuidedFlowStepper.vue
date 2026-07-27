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
        :aria-current="step.id === currentStepId ? 'step' : undefined"
      >
        <span class="step-dot" aria-hidden="true" />
        <span v-if="step.id === currentStepId" class="step-title">
          {{ step.title }}
        </span>
        <span class="visually-hidden">
          第 {{ index + 1 }} 步：{{ step.title }}
        </span>
        <span
          v-if="index < steps.length - 1"
          class="step-connector"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.guided-flow-stepper {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

ol {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  color: var(--text-color-secondary);
}

.step-dot {
  box-sizing: border-box;
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-color);
  transition:
    width 160ms ease,
    height 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.step-title {
  min-width: 0;
  max-width: clamp(72px, 24vw, 180px);
  margin-left: 8px;
  overflow: hidden;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-connector {
  width: 32px;
  height: 1px;
  flex: 0 0 32px;
  margin: 0 8px;
  background: var(--border-color);
}

li.completed .step-dot {
  border-color: var(--primary-color);
  background: var(--primary-color);
}

li.completed .step-connector {
  background: color-mix(in srgb, var(--primary-color) 55%, var(--border-color));
}

li.active .step-dot {
  width: 10px;
  height: 10px;
  flex-basis: 10px;
  border: 2px solid var(--bg-color);
  background: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-color);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .step-dot {
    transition: none;
  }
}
</style>
