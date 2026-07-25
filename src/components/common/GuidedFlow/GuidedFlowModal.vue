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
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { GuidedFlowRuntime } from "@/services/guided-flow";
import GuidedFlowShell from "./GuidedFlowShell.vue";

const props = defineProps<{
  runtime: GuidedFlowRuntime | null;
  busy: boolean;
}>();

const emit = defineEmits<{
  next: [];
  back: [];
  requestClose: [];
  retry: [];
  updateContext: [updates: Record<string, unknown>];
}>();
</script>

<template>
  <BaseDialog
    :model-value="Boolean(props.runtime)"
    width="min(720px, calc(100vw - 32px))"
    max-height="calc(100vh - var(--titlebar-height, 0px) - 32px)"
    :show-close-button="false"
    :close-on-backdrop-click="false"
    :show-footer="false"
    content-class="guided-flow-modal-content"
  >
    <GuidedFlowShell
      v-if="runtime"
      :runtime="runtime"
      :busy="busy"
      @next="emit('next')"
      @back="emit('back')"
      @request-close="emit('requestClose')"
      @retry="emit('retry')"
      @update-context="emit('updateContext', $event)"
    />
  </BaseDialog>
</template>

<style>
.guided-flow-modal-content {
  padding: 0 !important;
}
</style>
