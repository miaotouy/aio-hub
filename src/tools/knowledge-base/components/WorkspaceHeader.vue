<script setup lang="ts">
import { computed } from "vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeBase } from "../composables/useKnowledgeBase";
import { getPureModelId } from "../utils/kbUtils";
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
  (e: "toggle-kb-list"): void;
  (e: "select-all-entries"): void;
  (e: "deselect-all-entries"): void;
}>();

const kbStore = useKnowledgeBaseStore();
const { updateVectors, syncAllBases, deleteEntries, switchBase, batchGenerateTags, batchUpdateEntries } =
  useKnowledgeBase();
const { getIconPath, getDisplayIconPath, getMatchedProperties } = useModelMetadata();

/**
 * 向量化状态统计
 */
const vectorStatusInfo = computed(() => {
  if (!kbStore.activeBaseMeta?.entries) return null;
  const entries = kbStore.activeBaseMeta.entries;
  const total = entries.length;
  const currentModel = kbStore.config.defaultEmbeddingModel;

  const modelId = getPureModelId(currentModel);

  // 使用 store 中通过后端校验维护的 vectorizedIds 集合，这比 meta 中的静态字段更准确
  const ready = kbStore.vectorizedIds.size;
  const pending = total - ready;
  const isAligned = pending === 0;

  const modelProps = modelId ? getMatchedProperties(modelId) : null;
  const modelName = modelProps?.name || modelId || "未设置";
  const rawIcon = modelId ? getIconPath(modelId) : "";
  const modelIcon = rawIcon ? getDisplayIconPath(rawIcon) : "";

  return { total, ready, pending, isAligned, currentModel, modelName, modelIcon };
});

const isAllSelected = computed(() => {
  return (
    kbStore.activeBaseMeta?.entries &&
    kbStore.activeBaseMeta.entries.length > 0 &&
    props.selectedEntryIds.size === kbStore.activeBaseMeta.entries.length
  );
});
</script>

<template>
  <div class="workspace-header" :class="{ 'selection-mode': isSelectionMode }">
    <template v-if="!isSelectionMode">
      <div class="header-left">
        <template v-if="layoutMode === 'large'">
          <h2 class="base-name">{{ kbStore.activeBaseMeta?.name || "未选择知识库" }}</h2>
        </template>
        <template v-else>
          <div class="kb-selector-wrapper">
            <el-select
              :model-value="kbStore.activeBaseId"
              filterable
              placeholder="选择知识库"
              class="kb-select"
              size="default"
              @update:model-value="(val: string) => switchBase(val)"
            >
              <template #prefix>
                <Search :size="14" />
              </template>
              <el-option v-for="base in kbStore.bases" :key="base.id" :label="base.name" :value="base.id" />
            </el-select>
            <el-button class="kb-list-btn" size="default" @click="emit('toggle-kb-list')" title="管理知识库列表">
              <template #icon><Library :size="16" /></template>
            </el-button>
          </div>
        </template>

        <!-- 向量化状态简报 -->
        <div v-if="vectorStatusInfo && kbStore.activeBaseId" class="vector-status-brief">
          <el-tooltip effect="dark" placement="bottom" :show-after="200">
            <template #content>
              <div class="kb-status-tooltip">
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
                  <span class="value">{{ vectorStatusInfo.ready }} / {{ vectorStatusInfo.total }}</span>
                </div>
                <div v-if="!vectorStatusInfo.isAligned" class="tooltip-row warning">
                  <ShieldAlert :size="12" />
                  <span>有 {{ vectorStatusInfo.pending }} 项待向量化</span>
                </div>
              </div>
            </template>
            <div class="status-tag" :class="{ 'is-aligned': vectorStatusInfo.isAligned }">
              <ShieldCheck v-if="vectorStatusInfo.isAligned" :size="14" />
              <ShieldAlert v-else :size="14" />
              <span>{{ vectorStatusInfo.isAligned ? "向量已就绪" : `${vectorStatusInfo.pending} 项待处理` }}</span>
            </div>
          </el-tooltip>

          <el-button
            v-if="!vectorStatusInfo.isAligned"
            type="warning"
            link
            size="small"
            class="sync-btn"
            :loading="kbStore.indexingProgress.isIndexing"
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
            v-if="kbStore.activeBaseId"
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
            :loading="kbStore.indexingProgress.isIndexing"
            @click="syncAllBases"
            size="small"
            title="检查并同步所有知识库中待处理的向量化任务"
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
            @change="(val: any) => (val ? emit('select-all-entries') : emit('deselect-all-entries'))"
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
            :loading="kbStore.indexingProgress.isIndexing"
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
                await batchUpdateEntries(Array.from(selectedEntryIds), { enabled: true });
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
                await batchUpdateEntries(Array.from(selectedEntryIds), { enabled: false });
                emit('toggle-selection');
              }
            "
          >
            <template #icon><EyeOff :size="14" /></template>
            禁用
          </el-button>

          <el-dropdown
            trigger="click"
            v-if="kbStore.config.tagGeneration?.enabled"
            @command="(cmd: string) => batchGenerateTags(Array.from(selectedEntryIds), { force: cmd === 'force' })"
          >
            <el-button
              type="primary"
              plain
              size="small"
              :disabled="selectedEntryIds.size === 0"
              :loading="kbStore.indexingProgress.isIndexing"
            >
              <template #icon><Sparkles :size="14" /></template>
              生成标签
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="suggest">为无标签条目补充</el-dropdown-item>
                <el-dropdown-item command="force">强制为所有条目生成</el-dropdown-item>
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
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 16px;
  z-index: 10;
}

.workspace-header.selection-mode {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 92%);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}

.kb-selector-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  max-width: 320px;
}

.kb-list-btn {
  flex-shrink: 0;
}

.kb-select {
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
.kb-status-tooltip {
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
