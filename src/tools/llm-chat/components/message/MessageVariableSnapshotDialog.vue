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
import { Search, ArrowRight } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { SessionVariableSnapshot } from "../../types/sessionVariable";
import {
  useVariableSnapshotView,
  formatVariableValue as formatValue,
  type VariableSnapshotViewState,
} from "./useVariableSnapshotView";
const visible = defineModel<boolean>({ required: true });
const props = defineProps<{
  snapshot: SessionVariableSnapshot;
  viewState: VariableSnapshotViewState;
}>();
const { variableItems, copyPath } = useVariableSnapshotView(
  () => props.snapshot,
  () => props.viewState
);
</script>
<template>
  <BaseDialog
    v-model="visible"
    title="会话变量状态详情"
    width="900px"
    height="70vh"
  >
    <div class="dialog-variable-view">
      <div class="dialog-toolbar">
        <el-input
          v-model="viewState.searchQuery"
          placeholder="搜索变量路径..."
          :prefix-icon="Search"
          clearable
          style="width: 300px"
        />
        <el-checkbox v-model="viewState.showOnlyChanges"
          >仅显示发生变更的变量</el-checkbox
        >
      </div>

      <el-table
        :data="variableItems"
        stripe
        border
        height="100%"
        class="variable-table"
      >
        <el-table-column prop="path" label="路径" min-width="200">
          <template #default="{ row }">
            <code class="table-code" @click="copyPath(row.path)">{{
              row.path
            }}</code>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.isChanged" type="success" size="small"
              >已变更</el-tag
            >
            <el-tag v-else type="info" size="small">未变</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数值变更 (旧值 → 新值)" min-width="300">
          <template #default="{ row }">
            <div class="table-value-cell">
              <template v-if="row.isChanged && row.changeInfo">
                <span class="old-value">{{
                  formatValue(row.changeInfo.oldValue)
                }}</span>
                <ArrowRight :size="12" class="change-arrow" />
                <span class="new-value">{{ formatValue(row.value) }}</span>
                <span class="op-badge" v-if="row.changeInfo.op"
                  >{{ row.changeInfo.op }}{{ row.changeInfo.opValue }}</span
                >
              </template>
              <template v-else>
                <span class="current-value">{{ formatValue(row.value) }}</span>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </BaseDialog>
</template>
<style scoped>
.old-value {
  text-decoration: line-through;
  opacity: 0.5;
  color: var(--el-text-color-regular);
}

.new-value {
  color: var(--el-color-success);
  font-weight: 600;
}

.current-value {
  color: var(--el-text-color-primary);
}

.change-arrow {
  opacity: 0.5;
}

.dialog-variable-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 8px;
}

.dialog-toolbar {
  display: flex;
  align-items: center;
  gap: 20px;
}

.variable-table {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
}

.table-code {
  font-family: var(--el-font-family-mono);
  background: var(--el-fill-color-darker);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 12px;
}

.table-value-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  flex-wrap: wrap;
}

.op-badge {
  font-size: 10px;
  background: var(--el-color-success);
  color: white;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: bold;
}
</style>
