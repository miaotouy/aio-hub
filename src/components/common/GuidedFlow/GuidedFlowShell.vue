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
import { computed, nextTick, provide, ref, watch } from "vue";
import { Close } from "@element-plus/icons-vue";
import { guidedFlowStepControlsKey } from "@/services/guided-flow/stepControls";
import type {
  GuidedFlowRuntime,
  GuidedFlowStepAction,
} from "@/services/guided-flow/types";
import GuidedFlowFooter from "./GuidedFlowFooter.vue";
import GuidedFlowProgress from "./GuidedFlowProgress.vue";
import GuidedFlowStepper from "./GuidedFlowStepper.vue";

const props = defineProps<{
  runtime: GuidedFlowRuntime;
  busy: boolean;
  runStepAction: GuidedFlowStepAction<Record<string, unknown>>;
}>();

const emit = defineEmits<{
  next: [];
  back: [];
  requestClose: [];
  skip: [];
  retry: [];
  updateContext: [updates: Record<string, unknown>];
}>();

const contentRef = ref<HTMLElement | null>(null);
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
const closeAriaLabel = computed(() =>
  props.runtime.mode === "replay"
    ? "关闭版本说明"
    : (props.runtime.definition.dismissLabel ?? "稍后处理")
);
const usesStepFooter = computed(() => currentStep.value?.footer === "step");
const flowKindLabel = computed(() =>
  props.runtime.mode === "replay" ? "只读回放" : "引导任务"
);

watch(
  () => props.runtime.state.currentStepId,
  async () => {
    await nextTick();
    contentRef.value?.scrollTo({ top: 0, behavior: "auto" });
  }
);

provide(guidedFlowStepControlsKey, {
  isBusy: computed(() => props.busy),
  canGoBack: computed(() => currentIndex.value > 0),
  canDefer: computed(
    () =>
      props.runtime.definition.dismissible && props.runtime.mode !== "replay"
  ),
  runAction: props.runStepAction,
  requestNext: () => emit("next"),
  requestBack: () => emit("back"),
  requestDefer: () => emit("requestClose"),
});
</script>

<template>
  <section
    class="guided-flow-shell"
    data-testid="guided-flow-shell"
    :data-flow-id="runtime.definition.id"
    :data-current-step-id="runtime.state.currentStepId"
    :data-footer-owner="usesStepFooter ? 'step' : 'shell'"
    :aria-busy="busy"
  >
    <header class="guided-flow-header">
      <div class="header-copy">
        <span class="flow-kind">{{ flowKindLabel }}</span>
        <h2>{{ runtime.definition.title }}</h2>
        <p v-if="runtime.definition.description">
          {{ runtime.definition.description }}
        </p>
      </div>
      <el-button
        v-if="canRequestClose"
        class="close-button"
        text
        circle
        :aria-label="closeAriaLabel"
        @click="emit('requestClose')"
      >
        <el-icon><Close /></el-icon>
      </el-button>
    </header>

    <div class="guided-flow-body">
      <aside class="guided-flow-rail" aria-label="流程大纲">
        <div class="rail-heading">
          <span>流程进度</span>
          <GuidedFlowProgress
            :current-index="currentIndex"
            :total="runtime.steps.length"
          />
        </div>
        <GuidedFlowStepper
          :steps="runtime.steps"
          :current-step-id="runtime.state.currentStepId"
        />
      </aside>

      <section class="guided-flow-main" aria-label="当前步骤">
        <div
          ref="contentRef"
          class="guided-flow-content"
          :class="{ 'step-managed-footer': usesStepFooter }"
          :data-scroll-owner="usesStepFooter ? 'step' : 'shell'"
        >
          <div v-if="!usesStepFooter" class="step-intro">
            <p v-if="currentStep?.description" class="step-description">
              {{ currentStep.description }}
            </p>
            <div v-if="runtime.state.lastError" class="flow-error" role="alert">
              {{ runtime.state.lastError }}
            </div>
          </div>
          <component
            v-if="currentStep"
            :is="currentStep.component"
            :context="runtime.state.context ?? {}"
            :flow-state="runtime.state"
            :update-context="
              (updates: Record<string, unknown>) =>
                emit('updateContext', updates)
            "
          />
        </div>

        <GuidedFlowFooter
          v-if="!usesStepFooter"
          :runtime="runtime"
          :busy="busy"
          @next="emit('next')"
          @back="emit('back')"
          @close="emit('requestClose')"
          @skip="emit('skip')"
          @retry="emit('retry')"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.guided-flow-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-color) 92%, transparent);
  color: var(--text-color);
}

.guided-flow-header {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--border-color);
  padding: 18px clamp(18px, 3vw, 32px);
  background: color-mix(in srgb, var(--container-bg) 88%, transparent);
}

.header-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.flow-kind {
  color: var(--primary-color);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: var(--text-color);
  font-size: clamp(18px, 2.2vw, 23px);
  line-height: 1.3;
}

.header-copy p {
  max-width: 720px;
  margin: 0;
  overflow: hidden;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-button {
  flex: none;
}

.guided-flow-body {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(188px, 24%) minmax(0, 1fr);
  overflow: hidden;
}

.guided-flow-rail {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 18px;
  overflow: auto;
  border-right: 1px solid var(--border-color);
  padding: 22px 18px;
  background: color-mix(in srgb, var(--card-bg) 64%, transparent);
  scrollbar-gutter: stable;
}

.rail-heading {
  display: grid;
  gap: 4px;
}

.rail-heading > span {
  color: var(--text-color);
  font-size: 12px;
  font-weight: 700;
}

.guided-flow-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.guided-flow-content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: clamp(18px, 3vw, 30px);
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.guided-flow-content.step-managed-footer {
  display: flex;
  padding: 0;
  overflow: hidden;
}

.guided-flow-content.step-managed-footer > :deep(*) {
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.step-intro {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}

.step-intro:empty {
  display: none;
}

.step-description {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.flow-error {
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
}

.guided-flow-content::-webkit-scrollbar,
.guided-flow-rail::-webkit-scrollbar {
  width: 6px;
}

.guided-flow-content::-webkit-scrollbar-track,
.guided-flow-rail::-webkit-scrollbar-track {
  background: transparent;
}

.guided-flow-content::-webkit-scrollbar-thumb,
.guided-flow-rail::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--el-border-color-light);
}

@media (max-width: 760px) {
  .guided-flow-header {
    padding: 14px 16px;
  }

  .header-copy p {
    display: none;
  }

  .guided-flow-body {
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
  }

  .guided-flow-rail {
    gap: 10px;
    overflow: hidden;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
    padding: 10px 16px 12px;
  }

  .rail-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
}

@media (max-width: 560px) {
  .guided-flow-content:not(.step-managed-footer) {
    padding: 18px 16px;
  }
}
</style>
