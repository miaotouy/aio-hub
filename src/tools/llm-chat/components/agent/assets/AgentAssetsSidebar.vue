<script setup lang="ts">
import {
  Plus,
  Delete,
  Edit,
  CopyDocument,
  Folder,
  Menu as IconMenu,
  Collection,
  MoreFilled,
} from "@element-plus/icons-vue";
import type { AssetGroup } from "../../../types";

interface Props {
  selectedGroup: string;
  sortedGroups: AssetGroup[];
  groupCounts: Record<string, number>;
  hasUngroupedAssets: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: "update:selectedGroup", value: string): void;
  (e: "create-group"): void;
  (e: "edit-group", group: AssetGroup): void;
  (e: "delete-group", group: AssetGroup): void;
  (e: "copy-group-macro", groupId: string): void;
  (e: "drop-on-group", group: string): void;
}>();

const selectGroup = (group: string) => {
  emit("update:selectedGroup", group);
};
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <span class="title">资产分组</span>
      <el-tooltip content="创建分组" :show-after="500">
        <el-button
          :icon="Plus"
          circle
          size="small"
          @click="emit('create-group')"
        />
      </el-tooltip>
    </div>
    <div class="group-list">
      <div
        class="group-item"
        :class="{ active: selectedGroup === 'all' }"
        @click="selectGroup('all')"
        @dragover.prevent
        @drop="emit('drop-on-group', 'all')"
      >
        <el-icon><IconMenu /></el-icon>
        <span class="name">全部资产</span>
        <span class="count">{{ groupCounts.all }}</span>
      </div>

      <div
        v-if="hasUngroupedAssets || sortedGroups.length === 0"
        class="group-item"
        :class="{ active: selectedGroup === 'default' }"
        @click="selectGroup('default')"
        @dragover.prevent
        @drop="emit('drop-on-group', 'default')"
      >
        <el-icon><Collection /></el-icon>
        <span class="name">未分组</span>
        <span class="count">{{ groupCounts.default }}</span>
      </div>

      <div class="divider" v-if="sortedGroups.length > 0"></div>
      <div class="group-label" v-if="sortedGroups.length > 0">自定义分组</div>

      <div
        v-for="group in sortedGroups"
        :key="group.id"
        class="group-item"
        :class="{ active: selectedGroup === group.id }"
        @click="selectGroup(group.id)"
        @dragover.prevent
        @drop="emit('drop-on-group', group.id)"
      >
        <span v-if="group.icon" class="group-icon-emoji">{{ group.icon }}</span>
        <el-icon v-else><Folder /></el-icon>
        <span class="name" :title="group.description">{{
          group.displayName
        }}</span>
        <span class="count">{{ groupCounts[group.id] || 0 }}</span>
        <el-dropdown
          trigger="click"
          @command="
            (cmd: string) => {
              if (cmd === 'edit') emit('edit-group', group);
              else if (cmd === 'delete') emit('delete-group', group);
              else if (cmd === 'copyMacro') emit('copy-group-macro', group.id);
            }
          "
          @click.stop
        >
          <el-button
            :icon="MoreFilled"
            circle
            size="small"
            class="group-menu-btn"
            @click.stop
          />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="edit" :icon="Edit"
                >编辑分组</el-dropdown-item
              >
              <el-dropdown-item command="copyMacro" :icon="CopyDocument"
                >复制分组宏</el-dropdown-item
              >
              <el-dropdown-item command="delete" :icon="Delete" divided
                >删除分组</el-dropdown-item
              >
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color-page);
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.group-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  font-size: 13px;
  transition: all 0.2s;
  margin-bottom: 2px;
}

.group-item:hover {
  background-color: var(--el-fill-color);
}

.group-item.active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  color: var(--el-color-primary);
}

.group-item .el-icon {
  margin-right: 8px;
  font-size: 16px;
}

.group-item .name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-item .count {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  background-color: var(--el-fill-color-darker);
  padding: 2px 6px;
  border-radius: 10px;
}

.group-item.active .count {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-primary);
}

.divider {
  height: 1px;
  background-color: var(--el-border-color-lighter);
  margin: 8px 4px;
}

.group-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 12px;
  margin-top: 4px;
}

.group-menu-btn {
  opacity: 0;
  transition: opacity 0.2s;
}

.group-item:hover .group-menu-btn {
  opacity: 1;
}
</style>
