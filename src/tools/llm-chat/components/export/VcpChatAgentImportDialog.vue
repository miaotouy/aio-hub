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
import { computed, ref, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type {
  VcpChatAgentScanItem,
  VcpChatAgentScanResult,
} from "../../services/vcpChatAgentImportService";

const props = defineProps<{
  visible: boolean;
  scanResult: VcpChatAgentScanResult | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  import: [items: VcpChatAgentScanItem[]];
  reselect: [];
  cancel: [];
}>();

const searchQuery = ref("");
const selectedIds = ref<Set<string>>(new Set());

const selectableItems = computed(
  () => props.scanResult?.items.filter((item) => item.selectable) || []
);

const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const items = props.scanResult?.items || [];
  if (!query) return items;
  return items.filter((item) =>
    [item.name, item.vcpAgentId, item.model || ""]
      .join("\n")
      .toLowerCase()
      .includes(query)
  );
});

const filteredSelectableItems = computed(() =>
  filteredItems.value.filter((item) => item.selectable)
);

const selectedItems = computed(() =>
  selectableItems.value.filter((item) => selectedIds.value.has(item.vcpAgentId))
);

const summary = computed(() => {
  const items = props.scanResult?.items || [];
  return {
    total: items.length,
    selectable: items.filter((item) => item.selectable).length,
    failed: items.filter((item) => !item.selectable).length,
    selected: selectedItems.value.length,
  };
});

watch(
  () => props.scanResult,
  (result) => {
    selectedIds.value = new Set(
      result?.items
        .filter((item) => item.selectable)
        .map((item) => item.vcpAgentId) || []
    );
  },
  { immediate: true }
);

function toggleItem(item: VcpChatAgentScanItem, checked: boolean) {
  if (!item.selectable) return;
  const next = new Set(selectedIds.value);
  if (checked) {
    next.add(item.vcpAgentId);
  } else {
    next.delete(item.vcpAgentId);
  }
  selectedIds.value = next;
}

function selectAllFiltered() {
  const next = new Set(selectedIds.value);
  for (const item of filteredSelectableItems.value) {
    next.add(item.vcpAgentId);
  }
  selectedIds.value = next;
}

function invertFiltered() {
  const next = new Set(selectedIds.value);
  for (const item of filteredSelectableItems.value) {
    if (next.has(item.vcpAgentId)) {
      next.delete(item.vcpAgentId);
    } else {
      next.add(item.vcpAgentId);
    }
  }
  selectedIds.value = next;
}

function clearSelected() {
  selectedIds.value = new Set();
}

function handleImport() {
  emit("import", selectedItems.value);
}

function handleCancel() {
  emit("update:visible", false);
  emit("cancel");
}
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="从 VCPChat 导入"
    width="860px"
    :close-on-backdrop-click="!loading"
  >
    <template #content>
      <div v-if="scanResult" class="vcp-import-dialog">
        <div class="scan-summary">
          <div class="summary-main">
            <strong>{{ scanResult.inputPath }}</strong>
            <span v-if="!scanResult.isStandardRoot" class="summary-warning">
              未检测到标准 VCPChat 根目录
            </span>
          </div>
          <div class="summary-stats">
            <span>共 {{ summary.total }}</span>
            <span>可导入 {{ summary.selectable }}</span>
            <span>异常 {{ summary.failed }}</span>
            <span>已选 {{ summary.selected }}</span>
          </div>
          <p
            v-for="warning in scanResult.warnings"
            :key="warning"
            class="summary-warning-line"
          >
            {{ warning }}
          </p>
        </div>

        <div class="toolbar">
          <el-input
            v-model="searchQuery"
            size="small"
            clearable
            placeholder="搜索名称、目录 ID 或模型..."
          />
          <el-button size="small" @click="selectAllFiltered">
            全选当前
          </el-button>
          <el-button size="small" @click="invertFiltered">反选当前</el-button>
          <el-button size="small" @click="clearSelected">清空</el-button>
        </div>

        <div class="agent-table">
          <div class="agent-row agent-row--head">
            <span></span>
            <span>名称</span>
            <span>目录 ID</span>
            <span>模型</span>
            <span>提示词</span>
            <span>资源</span>
            <span>状态</span>
          </div>
          <div
            v-for="item in filteredItems"
            :key="item.vcpAgentId"
            class="agent-row"
            :class="{ 'is-disabled': !item.selectable }"
          >
            <el-checkbox
              :model-value="selectedIds.has(item.vcpAgentId)"
              :disabled="!item.selectable || loading"
              @update:model-value="(value: any) => toggleItem(item, !!value)"
            />
            <div class="name-cell">
              <span class="agent-name">{{ item.name }}</span>
              <span v-if="item.warnings.length > 0" class="warning-text">
                {{ item.warnings.join("；") }}
              </span>
            </div>
            <span class="mono">{{ item.vcpAgentId }}</span>
            <span class="truncate">{{ item.model || "未设置" }}</span>
            <el-tag size="small" effect="plain">
              {{ item.promptMode || "original" }}
            </el-tag>
            <div class="resource-tags">
              <el-tag
                size="small"
                :type="item.avatarPath ? 'success' : 'info'"
                effect="plain"
              >
                {{ item.avatarPath ? "头像" : "无头像" }}
              </el-tag>
              <el-tag
                size="small"
                :type="item.hasRegexRules ? 'success' : 'info'"
                effect="plain"
              >
                {{ item.hasRegexRules ? "正则" : "无正则" }}
              </el-tag>
            </div>
            <el-tag
              size="small"
              :type="item.selectable ? 'success' : 'danger'"
              effect="plain"
            >
              {{ item.selectable ? "可导入" : "异常" }}
            </el-tag>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">尚未扫描 VCPChat 目录</div>
    </template>

    <template #footer>
      <el-button @click="handleCancel" :disabled="loading">取消</el-button>
      <el-button @click="$emit('reselect')" :disabled="loading">
        重新选择目录
      </el-button>
      <el-button
        type="primary"
        :loading="loading"
        :disabled="selectedItems.length === 0"
        @click="handleImport"
      >
        导入选中项
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.vcp-import-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scan-summary {
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
}

.summary-main {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  font-size: 13px;
}

.summary-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-warning,
.summary-warning-line {
  color: var(--el-color-warning);
}

.summary-warning-line {
  margin: 6px 0 0;
  font-size: 12px;
}

.summary-stats {
  display: flex;
  gap: 14px;
  margin-top: 8px;
  color: var(--text-color-light);
  font-size: 12px;
}

.toolbar {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 8px;
}

.agent-table {
  max-height: 420px;
  overflow: auto;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
}

.agent-row {
  display: grid;
  grid-template-columns:
    36px minmax(150px, 1.2fr) minmax(110px, 0.8fr) minmax(120px, 1fr)
    86px 150px 72px;
  gap: 8px;
  align-items: center;
  min-height: 48px;
  padding: 8px 10px;
  border-bottom: var(--border-width) solid var(--border-color);
  font-size: 12px;
}

.agent-row:last-child {
  border-bottom: none;
}

.agent-row--head {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 34px;
  background: var(--sidebar-bg);
  color: var(--text-color-light);
  font-weight: 600;
}

.agent-row.is-disabled {
  opacity: 0.62;
}

.name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.agent-name,
.truncate,
.mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-family: var(--el-font-family-mono);
}

.warning-text {
  color: var(--el-color-warning);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.empty-state {
  padding: 36px 16px;
  color: var(--text-color-light);
  text-align: center;
}
</style>
