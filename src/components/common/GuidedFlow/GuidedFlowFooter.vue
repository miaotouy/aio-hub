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
import type { GuidedFlowRuntime } from "@/services/guided-flow";

const props = defineProps<{
  runtime: GuidedFlowRuntime;
  busy: boolean;
}>();

const emit = defineEmits<{
  next: [];
  back: [];
  close: [];
  skip: [];
  retry: [];
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
const isFirstStep = computed(() => currentIndex.value === 0);
const isLastStep = computed(
  () => currentIndex.value === props.runtime.steps.length - 1
);
const nextLabel = computed(() => {
  if (currentStep.value?.nextLabel) return currentStep.value.nextLabel;
  return isLastStep.value ? "完成" : "下一步";
});
const backLabel = computed(() => currentStep.value?.backLabel ?? "上一步");
const dismissLabel = computed(() =>
  props.runtime.mode === "replay"
    ? "关闭"
    : (props.runtime.definition.dismissLabel ?? "稍后处理")
);
const canSkip = computed(
  () => props.runtime.mode !== "replay" && props.runtime.definition.skippable
);
const skipLabel = computed(
  () => props.runtime.definition.skipLabel ?? "跳过此流程"
);
</script>

<template>
  <footer class="guided-flow-footer">
    <div class="footer-start">
      <el-button
        v-if="!isFirstStep"
        data-testid="guided-flow-back"
        :disabled="busy"
        @click="emit('back')"
      >
        {{ backLabel }}
      </el-button>
    </div>

    <div class="footer-actions">
      <el-button
        v-if="runtime.definition.dismissible"
        data-testid="guided-flow-close"
        :disabled="busy"
        @click="emit('close')"
      >
        {{ dismissLabel }}
      </el-button>
      <el-button
        v-if="canSkip"
        data-testid="guided-flow-skip"
        :disabled="busy"
        @click="emit('skip')"
      >
        {{ skipLabel }}
      </el-button>
      <el-button
        v-if="runtime.state.lastError"
        data-testid="guided-flow-retry"
        :disabled="busy"
        @click="emit('retry')"
      >
        重试
      </el-button>
      <el-button
        data-testid="guided-flow-next"
        type="primary"
        :loading="busy"
        @click="emit('next')"
      >
        {{ nextLabel }}
      </el-button>
    </div>
  </footer>
</template>

<style scoped>
.guided-flow-footer {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--border-color);
  padding: 16px 24px 20px;
}

.footer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 560px) {
  .guided-flow-footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .footer-actions,
  .footer-actions :deep(.el-button),
  .footer-start :deep(.el-button) {
    width: 100%;
  }
}
</style>
