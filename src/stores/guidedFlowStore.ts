// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { computed, onScopeDispose, shallowRef } from "vue";
import { defineStore } from "pinia";
import { guidedFlowManager } from "@/services/guided-flow";
import type {
  GuidedFlowOpenOptions,
  GuidedFlowRuntime,
  GuidedFlowStepAction,
} from "@/services/guided-flow";

export const useGuidedFlowStore = defineStore("guidedFlow", () => {
  const activeFlow = shallowRef<GuidedFlowRuntime | null>(null);
  const queuedFlowIds = shallowRef<string[]>([]);
  const isInitialized = shallowRef(false);
  const isBusy = shallowRef(false);

  const unsubscribe = guidedFlowManager.subscribe((snapshot) => {
    activeFlow.value = snapshot.activeFlow;
    queuedFlowIds.value = snapshot.queuedFlowIds;
    isInitialized.value = snapshot.isInitialized;
    isBusy.value = snapshot.isBusy;
  });

  onScopeDispose(unsubscribe);

  const hasActiveFlow = computed(() => activeFlow.value !== null);

  async function initialize() {
    await guidedFlowManager.initialize();
  }

  async function trigger(flowId: string) {
    await guidedFlowManager.trigger(flowId);
  }

  async function open(flowId: string, options?: GuidedFlowOpenOptions) {
    await guidedFlowManager.open(flowId, options);
  }

  async function next() {
    await guidedFlowManager.next();
  }

  async function back() {
    await guidedFlowManager.back();
  }

  async function requestClose() {
    return guidedFlowManager.requestClose();
  }

  async function skip() {
    return guidedFlowManager.skip();
  }

  async function retry() {
    await guidedFlowManager.retry();
  }

  async function updateContext(updates: Record<string, unknown>) {
    await guidedFlowManager.updateActiveContext(updates);
  }

  async function runStepAction(
    action: string,
    operation: Parameters<GuidedFlowStepAction<Record<string, unknown>>>[1]
  ) {
    await guidedFlowManager.runActiveStepAction(action, operation);
  }

  return {
    activeFlow,
    queuedFlowIds,
    isInitialized,
    isBusy,
    hasActiveFlow,
    initialize,
    trigger,
    open,
    next,
    back,
    requestClose,
    skip,
    retry,
    updateContext,
    runStepAction,
  };
});
