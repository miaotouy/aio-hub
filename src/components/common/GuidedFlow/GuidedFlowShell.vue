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
import { Close } from "@element-plus/icons-vue";
import type { GuidedFlowRuntime } from "@/services/guided-flow";
import GuidedFlowFooter from "./GuidedFlowFooter.vue";
import GuidedFlowProgress from "./GuidedFlowProgress.vue";
import GuidedFlowStepper from "./GuidedFlowStepper.vue";

const props = defineProps<{
  runtime: GuidedFlowRuntime;
  busy: boolean;
}>();

const emit = defineEmits<{
  next: [];
  back: [];
  requestClose: [];
  retry: [];
  updateContext: [updates: Record<string, unknown>];
}>();

const currentIndex = computed(() =>
  Math.max(
    0,
    props.runtime.steps.findIndex(
      (step) => step.id === props.runtime.state.currentStepId
    )
  )
);
const currentStep = computed(() => props.runtime.steps[currentIndex.value]);
const canRequestClose = computed(
  () => props.runtime.definition.dismissible && !props.busy
);
</script>

<template>
  <section class="guided-flow-shell" :aria-busy="busy">
    <header class="guided-flow-header">
      <div class="header-copy">
        <p class="eyebrow">{{ runtime.definition.trigger }}</p>
        <h2>{{ runtime.definition.title }}</h2>
        <p v-if="runtime.definition.description" class="flow-description">
          {{ runtime.definition.description }}
        </p>
      </div>
      <el-button
        v-if="canRequestClose"
        class="close-button"
        text
        circle
        aria-label="稍后处理"
        @click="emit('requestClose')"
      >
        <el-icon><Close /></el-icon>
      </el-button>
    </header>

    <div class="flow-meta">
      <GuidedFlowStepper
        :steps="runtime.steps"
        :current-step-id="runtime.state.currentStepId"
      />
      <GuidedFlowProgress
        :current-index="currentIndex"
        :total="runtime.steps.length"
      />
    </div>

    <main class="guided-flow-content">
      <p v-if="currentStep?.description" class="step-description">
        {{ currentStep.description }}
      </p>
      <div v-if="runtime.state.lastError" class="flow-error" role="alert">
        {{ runtime.state.lastError }}
      </div>
      <component
        v-if="currentStep"
        :is="currentStep.component"
        :context="runtime.state.context ?? {}"
        :flow-state="runtime.state"
        :update-context="
          (updates: Record<string, unknown>) => emit('updateContext', updates)
        "
      />
    </main>

    <GuidedFlowFooter
      :runtime="runtime"
      :busy="busy"
      @next="emit('next')"
      @back="emit('back')"
      @close="emit('requestClose')"
      @retry="emit('retry')"
    />
  </section>
</template>

<style scoped>
.guided-flow-shell {
  display: flex;
  max-height: min(760px, calc(100vh - var(--titlebar-height, 0px) - 32px));
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
}

.guided-flow-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border-color);
  padding: 24px 24px 18px;
}

.header-copy {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--text-color-secondary);
  font-size: 12px;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: var(--text-color);
  font-size: 20px;
  line-height: 1.35;
}

.flow-description,
.step-description {
  margin: 8px 0 0;
  color: var(--text-color-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.close-button {
  flex: none;
}

.flow-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border-color);
  padding: 14px 24px;
}

.guided-flow-content {
  min-height: 200px;
  flex: 1;
  overflow: auto;
  padding: 24px;
}

.flow-error {
  margin: 0 0 16px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 6px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 560px) {
  .guided-flow-header,
  .flow-meta,
  .guided-flow-content {
    padding-right: 16px;
    padding-left: 16px;
  }

  .flow-meta {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
