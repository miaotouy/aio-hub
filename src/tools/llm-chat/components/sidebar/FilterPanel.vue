<script setup lang="ts">
import { resolveAvatarPath } from "../../composables/ui/useResolvedAvatar";
import Avatar from "@/components/common/Avatar.vue";

export type SortBy = "updatedAt" | "createdAt" | "messageCount" | "name";
export type SortOrder = "desc" | "asc";
export type TimeFilter = "all" | "today" | "week" | "month" | "older";

interface Props {
  sortBy: SortBy;
  sortOrder: SortOrder;
  filterTime: TimeFilter;
  filterAgent: string;
  availableAgents: any[];
  hasActiveFilters: boolean;
}

defineProps<Props>();
const emit = defineEmits<{
  (e: "update:sortBy", value: SortBy): void;
  (e: "update:sortOrder", value: SortOrder): void;
  (e: "update:filterTime", value: TimeFilter): void;
  (e: "update:filterAgent", value: string): void;
  (e: "reset"): void;
}>();
</script>

<template>
  <div class="filter-panel">
    <div class="filter-section">
      <div class="section-header">
        <span class="section-title">排序方式</span>
      </div>
      <el-radio-group
        :model-value="sortBy"
        @update:model-value="emit('update:sortBy', $event)"
        size="small"
      >
        <el-radio-button value="updatedAt">最近更新</el-radio-button>
        <el-radio-button value="createdAt">创建时间</el-radio-button>
        <el-radio-button value="messageCount">消息数</el-radio-button>
        <el-radio-button value="name">名称</el-radio-button>
      </el-radio-group>
    </div>

    <div class="filter-section">
      <div class="section-header">
        <span class="section-title">时间范围</span>
      </div>
      <el-radio-group
        :model-value="filterTime"
        @update:model-value="emit('update:filterTime', $event)"
        size="small"
      >
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="today">今天</el-radio-button>
        <el-radio-button value="week">本周</el-radio-button>
        <el-radio-button value="month">本月</el-radio-button>
        <el-radio-button value="older">更早</el-radio-button>
      </el-radio-group>
    </div>

    <div class="filter-section" v-if="availableAgents.length > 0">
      <div class="section-header">
        <span class="section-title">智能体</span>
      </div>
      <div class="agent-list-scroll">
        <div
          class="agent-filter-item"
          :class="{ active: filterAgent === 'all' }"
          @click="emit('update:filterAgent', 'all')"
        >
          <span class="agent-name">全部智能体</span>
        </div>
        <div
          v-for="agent in availableAgents"
          :key="agent?.id"
          class="agent-filter-item"
          :class="{ active: filterAgent === agent?.id }"
          @click="agent && emit('update:filterAgent', agent.id)"
        >
          <Avatar
            :src="resolveAvatarPath(agent, 'agent') || ''"
            :alt="agent.displayName || agent.name"
            :size="16"
            shape="square"
            :radius="3"
          />
          <span class="agent-name">{{ agent.displayName || agent.name }}</span>
        </div>
      </div>
    </div>

    <div class="filter-footer" v-if="hasActiveFilters">
      <el-button size="small" link type="primary" @click="emit('reset')">重置所有筛选</el-button>
    </div>
  </div>
</template>

<style scoped>
.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-light);
}

.agent-list-scroll {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px;
}

.agent-list-scroll::-webkit-scrollbar {
  width: 4px;
}

.agent-list-scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 2px;
}

.agent-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
  transition: all 0.2s;
}

.agent-filter-item:hover {
  background-color: var(--hover-bg);
}

.agent-filter-item.active {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

.agent-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.el-radio-group {
  backdrop-filter: none;
}
</style>
