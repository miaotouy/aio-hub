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
import { onMounted } from "vue";
import { useGuidedFlowStore } from "@/stores/guidedFlowStore";
import GuidedFlowSurface from "./GuidedFlowSurface.vue";

const guidedFlowStore = useGuidedFlowStore();

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch {
    // Manager 已按模块错误处理规范记录，并将可理解的错误写入当前流程状态。
  }
}

onMounted(() => {
  void run(() => guidedFlowStore.initialize());
});
</script>

<template>
  <GuidedFlowSurface
    :runtime="guidedFlowStore.activeFlow"
    :busy="guidedFlowStore.isBusy"
    :run-step-action="guidedFlowStore.runStepAction"
    @next="run(() => guidedFlowStore.next())"
    @back="run(() => guidedFlowStore.back())"
    @request-close="run(() => guidedFlowStore.requestClose())"
    @skip="run(() => guidedFlowStore.skip())"
    @retry="run(() => guidedFlowStore.retry())"
    @update-context="run(() => guidedFlowStore.updateContext($event))"
  />
</template>
