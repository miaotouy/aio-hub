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
import { nextTick, ref, watch } from "vue";
import type {
  GuidedFlowRuntime,
  GuidedFlowStepAction,
} from "@/services/guided-flow";
import GuidedFlowShell from "./GuidedFlowShell.vue";

const props = defineProps<{
  runtime: GuidedFlowRuntime | null;
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

const surfaceRef = ref<HTMLElement | null>(null);

watch(
  () => props.runtime,
  async (runtime) => {
    if (!runtime) return;
    await nextTick();
    surfaceRef.value?.focus({ preventScroll: true });
  },
  { immediate: true }
);
</script>

<template>
  <Teleport to="body">
    <section
      v-if="runtime"
      ref="surfaceRef"
      class="guided-flow-surface"
      data-testid="guided-flow-surface"
      role="dialog"
      aria-modal="true"
      :aria-label="runtime.definition.title"
      tabindex="-1"
    >
      <div class="guided-flow-surface__frame">
        <GuidedFlowShell
          data-testid="guided-flow-modal"
          :runtime="runtime"
          :busy="busy"
          :run-step-action="runStepAction"
          @next="emit('next')"
          @back="emit('back')"
          @request-close="emit('requestClose')"
          @skip="emit('skip')"
          @retry="emit('retry')"
          @update-context="emit('updateContext', $event)"
        />
      </div>
    </section>
  </Teleport>
</template>

<style scoped>
.guided-flow-surface {
  position: fixed;
  z-index: calc(var(--z-index-title-bar) - 1);
  inset: var(--titlebar-height, 0px) 0 0;
  box-sizing: border-box;
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: stretch center;
  overflow: hidden;
  padding: clamp(10px, 2vw, 24px);
  background: color-mix(in srgb, var(--container-bg) 82%, transparent);
  backdrop-filter: blur(var(--ui-blur));
  -webkit-backdrop-filter: blur(var(--ui-blur));
  outline: none;
  isolation: isolate;
}

.guided-flow-surface__frame {
  width: min(1120px, 100%);
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 14px;
  background: color-mix(in srgb, var(--container-bg) 94%, transparent);
  box-shadow: 0 18px 56px rgb(0 0 0 / 18%);
}

@media (max-width: 720px), (max-height: 560px) {
  .guided-flow-surface {
    padding: 0;
  }

  .guided-flow-surface__frame {
    width: 100%;
    border-width: 0;
    border-radius: 0;
    box-shadow: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .guided-flow-surface,
  .guided-flow-surface__frame {
    background: var(--container-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
