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
import {
  Search,
  Info,
  ArrowRight,
  Variable,
  Maximize2,
  Filter,
} from "lucide-vue-next";
import type { SessionVariableSnapshot } from "../../types/sessionVariable";
import {
  createVariableSnapshotViewState,
  useVariableSnapshotView,
  formatVariableValue as formatValue,
  type VariableSnapshotViewState,
} from "./useVariableSnapshotView";
import { reactive } from "vue";
const props = withDefaults(
  defineProps<{
    snapshot: SessionVariableSnapshot;
    viewState?: VariableSnapshotViewState;
  }>(),
  { viewState: () => reactive(createVariableSnapshotViewState()) }
);
const emit = defineEmits<{ "open-details": [] }>();
const { variableItems, hasChanges, copyPath } = useVariableSnapshotView(
  () => props.snapshot,
  () => props.viewState
);
</script>

<template>
  <div class="message-variable-snapshot">
    <div class="snapshot-header">
      <div class="header-left">
        <div class="title">
          <Variable :size="16" />
          <span>会话变量状态</span>
        </div>
        <el-tag v-if="hasChanges" size="small" type="success" effect="plain">
          {{ snapshot.changes?.length }} 项变更
        </el-tag>
      </div>
      <div class="header-actions">
        <el-tooltip content="详情查看" placement="top">
          <el-button
            link
            :icon="Maximize2"
            aria-label="查看变量详情"
            @click="emit('open-details')"
          />
        </el-tooltip>
      </div>
    </div>

    <div class="snapshot-toolbar">
      <el-input
        v-model="viewState.searchQuery"
        placeholder="搜索变量路径..."
        size="small"
        :prefix-icon="Search"
        clearable
        class="search-input"
      />
      <el-tooltip
        :content="viewState.showOnlyChanges ? '显示全部' : '仅看变更'"
        placement="top"
      >
        <el-button
          size="small"
          :type="viewState.showOnlyChanges ? 'success' : 'default'"
          :plain="!viewState.showOnlyChanges"
          @click="viewState.showOnlyChanges = !viewState.showOnlyChanges"
        >
          <Filter :size="14" />
        </el-button>
      </el-tooltip>
    </div>

    <div class="snapshot-content custom-scrollbar">
      <div v-if="variableItems.length === 0" class="empty-state">
        <el-empty
          :image-size="40"
          :description="
            viewState.searchQuery || viewState.showOnlyChanges
              ? '未发现匹配的变量'
              : '暂无变量数据'
          "
        />
      </div>

      <div
        v-for="item in variableItems"
        :key="item.path"
        class="variable-item"
        :class="{ 'is-changed': item.isChanged }"
      >
        <div class="item-main">
          <div class="item-path">
            <code title="点击复制路径" @click="copyPath(item.path)">{{
              item.path
            }}</code>
          </div>
          <div class="item-value-container">
            <template v-if="item.isChanged && item.changeInfo">
              <span class="old-value">{{
                formatValue(item.changeInfo.oldValue)
              }}</span>
              <ArrowRight :size="12" class="change-arrow" />
              <span class="new-value">{{ formatValue(item.value) }}</span>
            </template>
            <template v-else>
              <span class="current-value">{{ formatValue(item.value) }}</span>
            </template>
          </div>
        </div>
        <div v-if="item.isChanged" class="change-badge">
          {{ item.changeInfo?.op }}{{ item.changeInfo?.opValue }}
        </div>
      </div>
    </div>

    <div class="snapshot-footer">
      <Info :size="12" />
      <span
        >快照时间:
        {{ new Date(snapshot.timestamp || Date.now()).toLocaleString() }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.message-variable-snapshot {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  min-width: 300px;
}

.snapshot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snapshot-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.snapshot-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
}

.snapshot-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 4px;
}

.variable-item {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
}

.variable-item:hover {
  background: var(--el-fill-color);
}

.variable-item.is-changed {
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.2)
  );
}

.item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.item-path {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-path code {
  font-family: var(--el-font-family-mono);
  background: var(--el-fill-color-darker);
  padding: 1px 4px;
  border-radius: 4px;
  color: var(--el-color-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.item-path code:hover {
  background: var(--el-color-primary);
  color: white;
}

.item-value-container {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-family: var(--el-font-family-mono);
}

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

.change-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--el-color-success);
  color: white;
  border-radius: 10px;
  font-weight: bold;
  flex-shrink: 0;
}

.snapshot-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.empty-state {
  padding: 20px 0;
}

/* 滚动条美化 */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--el-border-color-darker);
  border-radius: 10px;
}
</style>
