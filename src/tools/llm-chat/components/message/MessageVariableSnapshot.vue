<script setup lang="ts">
import { computed, ref } from "vue";
import { Search, Info, ArrowRight, Variable, Maximize2, Filter } from "lucide-vue-next";
import type { SessionVariableSnapshot, VariableChange } from "../../types/sessionVariable";
import { customMessage } from "@/utils/customMessage";
import { useClipboard } from "@vueuse/core";
import BaseDialog from "@/components/common/BaseDialog.vue";

interface Props {
  snapshot: SessionVariableSnapshot;
}

const props = defineProps<Props>();

const searchQuery = ref("");
const showOnlyChanges = ref(false);
const isDialogOpen = ref(false);
const { copy } = useClipboard();

const copyPath = async (path: string) => {
  await copy(path);
  customMessage.success("路径已复制");
};

// 处理变量列表
const variableItems = computed(() => {
  const { values, changes = [] } = props.snapshot;
  if (!values) return [];

  const changeMap = new Map<string, VariableChange>();
  changes.forEach((c) => changeMap.set(c.path, c));

  const items = Object.entries(values).map(([path, value]) => {
    const change = changeMap.get(path);
    return {
      path,
      value,
      isChanged: !!change,
      changeInfo: change,
      type: typeof value,
    };
  });

  // 过滤和排序
  return items
    .filter((item) => {
      // 搜索过滤
      const matchesSearch = !searchQuery.value || item.path.toLowerCase().includes(searchQuery.value.toLowerCase());

      // 变更过滤
      const matchesChangeFilter = !showOnlyChanges.value || item.isChanged;

      return matchesSearch && matchesChangeFilter;
    })
    .sort((a, b) => {
      // 排序：发生变更的排在前面，然后按路径字母排序
      if (a.isChanged && !b.isChanged) return -1;
      if (!a.isChanged && b.isChanged) return 1;
      return a.path.localeCompare(b.path);
    });
});

const hasChanges = computed(() => (props.snapshot.changes?.length || 0) > 0);

// 格式化数值展示
const formatValue = (val: any) => {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
};
</script>

<template>
  <div class="message-variable-snapshot" :class="{ 'in-dialog': isDialogOpen }">
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
        <el-tooltip content="详情查看" placement="top" v-if="!isDialogOpen">
          <el-button link :icon="Maximize2" @click="isDialogOpen = true" />
        </el-tooltip>
      </div>
    </div>

    <div class="snapshot-toolbar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索变量路径..."
        size="small"
        :prefix-icon="Search"
        clearable
        class="search-input"
      />
      <el-tooltip :content="showOnlyChanges ? '显示全部' : '仅看变更'" placement="top">
        <el-button
          size="small"
          :type="showOnlyChanges ? 'success' : 'default'"
          :plain="!showOnlyChanges"
          @click="showOnlyChanges = !showOnlyChanges"
        >
          <Filter :size="14" />
        </el-button>
      </el-tooltip>
    </div>

    <div class="snapshot-content custom-scrollbar">
      <div v-if="variableItems.length === 0" class="empty-state">
        <el-empty
          :image-size="40"
          :description="searchQuery || showOnlyChanges ? '未发现匹配的变量' : '暂无变量数据'"
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
            <code title="点击复制路径" @click="copyPath(item.path)">{{ item.path }}</code>
          </div>
          <div class="item-value-container">
            <template v-if="item.isChanged && item.changeInfo">
              <span class="old-value">{{ formatValue(item.changeInfo.oldValue) }}</span>
              <ArrowRight :size="12" class="change-arrow" />
              <span class="new-value">{{ formatValue(item.value) }}</span>
            </template>
            <template v-else>
              <span class="current-value">{{ formatValue(item.value) }}</span>
            </template>
          </div>
        </div>
        <div v-if="item.isChanged" class="change-badge">{{ item.changeInfo?.op }}{{ item.changeInfo?.opValue }}</div>
      </div>
    </div>

    <div class="snapshot-footer">
      <Info :size="12" />
      <span>快照时间: {{ new Date(snapshot.timestamp || Date.now()).toLocaleString() }}</span>
    </div>

    <!-- 详情对话框 -->
    <BaseDialog v-model="isDialogOpen" title="会话变量状态详情" width="900px" height="70vh">
      <div class="dialog-variable-view">
        <div class="dialog-toolbar">
          <el-input
            v-model="searchQuery"
            placeholder="搜索变量路径..."
            :prefix-icon="Search"
            clearable
            style="width: 300px"
          />
          <el-checkbox v-model="showOnlyChanges">仅显示发生变更的变量</el-checkbox>
        </div>

        <el-table :data="variableItems" stripe border height="100%" class="variable-table">
          <el-table-column prop="path" label="路径" min-width="200">
            <template #default="{ row }">
              <code class="table-code" @click="copyPath(row.path)">{{ row.path }}</code>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.isChanged" type="success" size="small">已变更</el-tag>
              <el-tag v-else type="info" size="small">未变</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="数值变更 (旧值 → 新值)" min-width="300">
            <template #default="{ row }">
              <div class="table-value-cell">
                <template v-if="row.isChanged && row.changeInfo">
                  <span class="old-value">{{ formatValue(row.changeInfo.oldValue) }}</span>
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
  background: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.1));
  border-color: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.2));
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

/* 滚动条美化 */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--el-border-color-darker);
  border-radius: 10px;
}
</style>
