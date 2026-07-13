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
import { ListFilter, Zap, Eye } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import RulesTab from "./RulesTab.vue";
import ActionsTab from "./ActionsTab.vue";
import LivePreviewTab from "./LivePreviewTab.vue";
import IdentityPanel from "./IdentityPanel.vue";

const store = useWebDistilleryStore();
</script>

<template>
  <div class="tool-panel">
    <IdentityPanel />
    <el-tabs v-model="store.activeToolTab" class="tool-tabs">
      <el-tab-pane name="rules">
        <template #label>
          <div class="tab-label">
            <el-icon><ListFilter /></el-icon>
            <span>提取规则</span>
          </div>
        </template>
        <RulesTab />
      </el-tab-pane>

      <el-tab-pane name="actions">
        <template #label>
          <div class="tab-label">
            <el-icon><Zap /></el-icon>
            <span>动作序列</span>
          </div>
        </template>
        <ActionsTab />
      </el-tab-pane>

      <el-tab-pane name="preview">
        <template #label>
          <div class="tab-label">
            <el-icon><Eye /></el-icon>
            <span>实时预览</span>
          </div>
        </template>
        <LivePreviewTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.tool-panel {
  width: 380px;
  min-width: 300px;
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tool-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__header) {
  margin-bottom: 0;
  padding: 0 12px;
}

:deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

:deep(.el-tab-pane) {
  height: 100%;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.placeholder-tab {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
