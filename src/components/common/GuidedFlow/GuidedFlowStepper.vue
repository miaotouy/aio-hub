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
        <span class="step-marker" aria-hidden="true">
          <span class="step-number">{{ index + 1 }}</span>
        </span>
        <span class="step-copy">
          <span class="step-kicker">
            {{ index < currentIndex ? "已完成" : `步骤 ${index + 1}` }}
          </span>
          <span class="step-title">{{ step.title }}</span>
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
}

ol {
  display: grid;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  position: relative;
  display: grid;
  min-width: 0;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 10px;
  padding-bottom: 20px;
  color: var(--text-color-secondary);
}

li:last-child {
  padding-bottom: 0;
}

.step-marker {
  z-index: 1;
  box-sizing: border-box;
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid var(--control-border-color);
  border-radius: 8px;
  background: var(--container-bg);
  color: var(--text-color-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.step-copy {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 1px;
}

.step-kicker {
  color: var(--text-color-secondary);
  font-size: 9px;
  letter-spacing: 0.04em;
}

.step-title {
  min-width: 0;
  overflow: hidden;
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-connector {
  position: absolute;
  top: 28px;
  bottom: 2px;
  left: 12px;
  width: 1px;
  background: var(--border-color);
}

li.completed .step-marker {
  border-color: color-mix(
    in srgb,
    var(--primary-color) 60%,
    var(--border-color)
  );
  background: color-mix(in srgb, var(--primary-color) 13%, var(--container-bg));
  color: var(--primary-color);
}

li.completed .step-connector {
  background: color-mix(in srgb, var(--primary-color) 55%, var(--border-color));
}

li.active .step-marker {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: var(--el-color-white);
}

li.active .step-kicker {
  color: var(--primary-color);
}

li.active .step-title {
  color: var(--text-color);
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

@media (max-width: 760px) {
  .guided-flow-stepper {
    overflow: hidden;
  }

  ol {
    display: flex;
    align-items: flex-start;
    overflow: hidden;
  }

  li {
    display: flex;
    min-width: 0;
    flex: 1 1 0;
    align-items: center;
    gap: 6px;
    padding: 0 18px 0 0;
  }

  li:last-child {
    padding-right: 0;
  }

  .step-marker {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    border-radius: 7px;
    font-size: 10px;
  }

  .step-copy {
    display: none;
  }

  li.active .step-copy {
    display: grid;
  }

  .step-kicker {
    display: none;
  }

  .step-title {
    max-width: 160px;
  }

  .step-connector {
    top: 10px;
    right: 3px;
    bottom: auto;
    left: 25px;
    width: auto;
    height: 1px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .step-marker {
    transition: none;
  }
}
</style>
