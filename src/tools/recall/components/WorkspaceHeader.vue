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
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import { useRecallCollection } from "../composables/useRecallCollection";
import { getPureModelId } from "../utils/recallUtils";
import { useModelMetadata } from "@/composables/useModelMetadata";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import {
  RefreshCw,
  Sparkles,
  CheckSquare,
  Eye,
  EyeOff,
  Settings2,
  ShieldCheck,
  ShieldAlert,
  X,
  Download,
  Trash2,
  Search,
  Library,
} from "lucide-vue-next";

const props = defineProps<{
  isSelectionMode: boolean;
  selectedEntryIds: Set<string>;
  showSettings: boolean;
  layoutMode: "small" | "medium" | "large";
}>();

const emit = defineEmits<{
  (e: "toggle-selection"): void;
  (e: "toggle-settings"): void;
  (e: "toggle-recall-list"): void;
  (e: "select-all-entries"): void;
  (e: "deselect-all-entries"): void;
}>();

const recallStore = useRecallCollectionStore();
const {
  updateVectors,
  syncAllBases,
  deleteEntries,
  switchBase,
  batchGenerateTags,
  batchUpdateEntries,
} = useRecallCollection();
const { getIconPath, getDisplayIconPath, getMatchedProperties } =
  useModelMetadata();

/**
 * 向量化状态统计
 */
const vectorStatusInfo = computed(() => {
  if (!recallStore.activeBaseMeta?.entries) return null;
  const entries = recallStore.activeBaseMeta.entries;
  const total = entries.length;
  const currentModel = recallStore.config.defaultEmbeddingModel;

  const modelId = getPureModelId(currentModel);

  // 使用 store 中通过后端校验维护的 vectorizedIds 集合，这比 meta 中的静态字段更准确
  const ready = recallStore.vectorizedIds.size;
  const pending = total - ready;
  const isAligned = pending === 0;

  const modelProps = modelId ? getMatchedProperties(modelId) : null;
  const modelName = modelProps?.name || modelId || "未设置";
  const rawIcon = modelId ? getIconPath(modelId) : "";
  const modelIcon = rawIcon ? getDisplayIconPath(rawIcon) : "";

  return {
    total,
    ready,
    pending,
    isAligned,
    currentModel,
    modelName,
    modelIcon,
  };
});

const isAllSelected = computed(() => {
  return (
    recallStore.activeBaseMeta?.entries &&
    recallStore.activeBaseMeta.entries.length > 0 &&
    props.selectedEntryIds.size === recallStore.activeBaseMeta.entries.length
  );
});
</script>

<template>
  <div class="workspace-header" :class="{ 'selection-mode': isSelectionMode }">
    <template v-if="!isSelectionMode">
      <div class="header-left">
        <template v-if="layoutMode === 'large'">
          <h2 class="base-name">
            {{ recallStore.activeBaseMeta?.name || "未选择思绪集" }}
          </h2>
        </template>
        <template v-else>
          <div class="recall-selector-wrapper">
            <el-select
              :model-value="recallStore.activeBaseId"
              filterable
              placeholder="选择思绪集"
              class="recall-select"
              size="default"
              @update:model-value="(val: string) => switchBase(val)"
            >
              <template #prefix>
                <Search :size="14" />
              </template>
              <el-option
                v-for="base in recallStore.bases"
                :key="base.id"
                :label="base.name"
                :value="base.id"
              />
            </el-select>
            <el-button
              class="recall-list-btn"
              size="default"
              @click="emit('toggle-recall-list')"
              title="管理思绪集列表"
            >
              <template #icon><Library :size="16" /></template>
            </el-button>
          </div>
        </template>

        <!-- 向量化状态简报 -->
        <div
          v-if="vectorStatusInfo && recallStore.activeBaseId"
          class="vector-status-brief"
        >
          <el-tooltip effect="dark" placement="bottom" :show-after="200">
            <template #content>
              <div class="recall-status-tooltip">
                <div class="tooltip-row">
                  <span class="label">当前模型:</span>
                  <div class="value-with-icon">
                    <div v-if="vectorStatusInfo.modelIcon" class="model-icon">
                      <DynamicIcon :src="vectorStatusInfo.modelIcon" />
                    </div>
                    <span class="value">{{ vectorStatusInfo.modelName }}</span>
                  </div>
                </div>
                <div class="tooltip-row">
                  <span class="label">已向量化:</span>
                  <span class="value"
                    >{{ vectorStatusInfo.ready }} /
                    {{ vectorStatusInfo.total }}</span
                  >
                </div>
                <div
                  v-if="!vectorStatusInfo.isAligned"
                  class="tooltip-row warning"
                >
                  <ShieldAlert :size="12" />
                  <span>有 {{ vectorStatusInfo.pending }} 项待向量化</span>
                </div>
              </div>
            </template>
            <div
              class="status-tag"
              :class="{ 'is-aligned': vectorStatusInfo.isAligned }"
            >
              <ShieldCheck v-if="vectorStatusInfo.isAligned" :size="14" />
              <ShieldAlert v-else :size="14" />
              <span>{{
                vectorStatusInfo.isAligned
                  ? "向量已就绪"
                  : `${vectorStatusInfo.pending} 项待处理`
              }}</span>
            </div>
          </el-tooltip>

          <el-button
            v-if="!vectorStatusInfo.isAligned"
            type="warning"
            link
            size="small"
            class="sync-btn"
            :loading="recallStore.indexingProgress.isIndexing"
            @click="updateVectors()"
          >
            <template #icon><RefreshCw :size="12" /></template>
            同步当前库
          </el-button>
        </div>
      </div>

      <div class="header-right">
        <el-button-group>
          <el-button
            v-if="recallStore.activeBaseId"
            @click="emit('toggle-settings')"
            :type="showSettings ? 'primary' : ''"
            size="small"
          >
            <template #icon><Settings2 :size="14" /></template>
            库设置
          </el-button>

          <el-button @click="emit('toggle-selection')" size="small">
            <template #icon><CheckSquare :size="14" /></template>
            条目管理
          </el-button>

          <el-button
            :loading="recallStore.indexingProgress.isIndexing"
            @click="syncAllBases"
            size="small"
            title="检查并同步所有思绪集中待处理的向量化任务"
          >
            <template #icon><RefreshCw :size="14" /></template>
            一键向量化
          </el-button>
        </el-button-group>
      </div>
    </template>

    <!-- 批量模式 (条目) -->
    <template v-else>
      <div class="batch-bar">
        <div class="batch-info">
          <el-checkbox
            :model-value="isAllSelected"
            :indeterminate="selectedEntryIds.size > 0 && !isAllSelected"
            @change="
              (val: any) =>
                val ? emit('select-all-entries') : emit('deselect-all-entries')
            "
            style="margin-right: 12px"
          />
          <span class="count">已选 {{ selectedEntryIds.size }} 个条目</span>
        </div>
        <div class="batch-ops">
          <el-button
            type="primary"
            plain
            size="small"
            :disabled="selectedEntryIds.size === 0"
            :loading="recallStore.indexingProgress.isIndexing"
            @click="
              async () => {
                await updateVectors(undefined, Array.from(selectedEntryIds));
                emit('toggle-selection');
              }
            "
          >
            <template #icon><RefreshCw :size="14" /></template>
            更新向量
          </el-button>

          <el-button
            size="small"
            :disabled="selectedEntryIds.size === 0"
            @click="
              async () => {
                await batchUpdateEntries(Array.from(selectedEntryIds), {
                  enabled: true,
                });
                emit('toggle-selection');
              }
            "
          >
            <template #icon><Eye :size="14" /></template>
            启用
          </el-button>

          <el-button
            size="small"
            :disabled="selectedEntryIds.size === 0"
            @click="
              async () => {
                await batchUpdateEntries(Array.from(selectedEntryIds), {
                  enabled: false,
                });
                emit('toggle-selection');
              }
            "
          >
            <template #icon><EyeOff :size="14" /></template>
            禁用
          </el-button>

          <el-dropdown
            trigger="click"
            v-if="recallStore.config.tagGeneration?.enabled"
            @command="
              (cmd: string) =>
                batchGenerateTags(Array.from(selectedEntryIds), {
                  force: cmd === 'force',
                })
            "
          >
            <el-button
              type="primary"
              plain
              size="small"
              :disabled="selectedEntryIds.size === 0"
              :loading="recallStore.indexingProgress.isIndexing"
            >
              <template #icon><Sparkles :size="14" /></template>
              生成标签
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="suggest"
                  >为无标签条目补充</el-dropdown-item
                >
                <el-dropdown-item command="force"
                  >强制为所有条目生成</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button size="small" :disabled="selectedEntryIds.size === 0">
            <template #icon><Download :size="14" /></template>
            导出
          </el-button>
          <el-button
            type="danger"
            plain
            size="small"
            :disabled="selectedEntryIds.size === 0"
            @click="
              async () => {
                await deleteEntries(Array.from(selectedEntryIds));
                emit('toggle-selection');
              }
            "
          >
            <template #icon><Trash2 :size="14" /></template>
            删除
          </el-button>
          <el-button size="small" @click="emit('toggle-selection')">
            <template #icon><X :size="14" /></template>
            退出
          </el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background-color: var(--card-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
  gap: 16px;
  z-index: 10;
}

.workspace-header.selection-mode {
  background-color: color-mix(
    in srgb,
    var(--el-color-primary),
    transparent 92%
  );
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}

.recall-selector-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  max-width: 320px;
}

.recall-list-btn {
  flex-shrink: 0;
}

.recall-select {
  width: 100%;
}

.base-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vector-status-brief {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sync-btn {
  padding: 0 4px;
  height: 22px;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 8px;
  height: 22px;
  line-height: 1;
  border-radius: 12px;
  font-size: 12px;
  background-color: rgba(var(--el-color-warning-rgb), 0.1);
  color: var(--el-color-warning);
  border: 1px solid rgba(var(--el-color-warning-rgb), 0.2);
  cursor: help;
}

.status-tag.is-aligned {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  color: var(--el-color-success);
  border: 1px solid rgba(var(--el-color-success-rgb), 0.2);
}

.header-right {
  display: flex;
  align-items: center;
}

/* Tooltip 样式 */
.recall-status-tooltip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0;
}

.tooltip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  white-space: nowrap;
}

.tooltip-row .label {
  color: var(--el-text-color-secondary);
}

.tooltip-row .value {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.value-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.model-icon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tooltip-row.warning {
  margin-top: 4px;
  color: var(--el-color-warning);
}

.batch-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 16px;
}

.batch-info .count {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.batch-ops {
  display: flex;
  gap: 8px;
}

.dropdown-item-content {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
