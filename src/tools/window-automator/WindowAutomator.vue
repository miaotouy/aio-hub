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
/**
 * 窗口自动化助手 - 主页面容器
 *
 * - 视图切换：方案大厅 (list) / 方案详情 (detail)
 * - 全局快捷键：F10 启停当前方案（使用 document keydown 监听，避免新增 plugin 依赖）
 * - 接收 FlowList 的 quick-start 事件，自动切到详情并启动
 */
import { computed, onMounted, onBeforeUnmount } from "vue";
import { useWindowAutomatorStore } from "./stores/windowAutomator.store";
import { useFlowPersistence } from "./composables/useFlowPersistence";
import { useFlowExecutor } from "./composables/useFlowExecutor";
import { createModuleLogger } from "@/utils/logger";
import FlowList from "./components/FlowList.vue";
import FlowDetail from "./components/FlowDetail.vue";
import type { ActionFlow } from "./types";

const logger = createModuleLogger("window-automator/WindowAutomator");
const store = useWindowAutomatorStore();
const persistence = useFlowPersistence();
const executor = useFlowExecutor();

const view = computed({
  get: () => store.currentView,
  set: (v) => {
    if (v === "list") store.backToList();
  },
});

async function quickStart(flow: ActionFlow) {
  if (!store.boundWindow) {
    logger.warn("未绑定窗口，无法启动");
    return;
  }
  store.enterFlow(flow.id);
  // 切到详情后立即启动
  setTimeout(async () => {
    const fresh = store.savedFlows.find((f) => f.id === flow.id);
    if (fresh) await executor.start(fresh, store.boundWindow);
  }, 50);
}

function onKeyDown(e: KeyboardEvent) {
  // F10 启停
  if (e.key === "F10") {
    e.preventDefault();
    toggleByHotkey();
  }
}

function toggleByHotkey() {
  const s = store.runtime.status;
  if (s === "running" || s === "paused") {
    executor.stop();
    return;
  }
  // idle 时，若有当前方案则启动
  const flow = store.currentFlow ?? store.savedFlows[0];
  if (!flow) return;
  if (!store.boundWindow) return;
  if (flow.id !== store.currentFlowId) {
    store.enterFlow(flow.id);
  }
  void executor.start(flow, store.boundWindow);
}

onMounted(async () => {
  document.addEventListener("keydown", onKeyDown);
  // 启动时主动加载所有方案
  const all = await persistence.loadAll();
  store.setSavedFlows(all);
  logger.info("Window Automator 工具就绪", { flowCount: all.length });
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
  executor.dispose();
});
</script>

<template>
  <div class="window-automator">
    <FlowList v-if="view === 'list'" @quick-start="quickStart" />
    <FlowDetail v-else />
  </div>
</template>

<style scoped>
.window-automator {
  padding: 24px;
  box-sizing: border-box;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
  color: var(--text-color);
}
</style>
