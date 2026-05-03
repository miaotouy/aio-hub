<template>
  <div class="skill-list-panel">
    <div class="panel-header">
      <span class="panel-title">技能列表</span>
      <span class="panel-count">{{ manifests.length }} 个技能</span>
    </div>

    <!-- 搜索框 -->
    <el-input v-model="searchQuery" placeholder="搜索技能..." size="small" clearable class="search-input">
      <template #prefix>
        <Search :size="14" />
      </template>
    </el-input>

    <!-- 过滤标签 -->
    <div class="filter-tabs">
      <el-radio-group v-model="sourceFilter" size="small">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="user">用户安装</el-radio-button>
        <el-radio-button value="builtin">内置</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 技能列表 -->
    <div class="skill-list" v-if="filteredManifests.length > 0">
      <div
        v-for="manifest in filteredManifests"
        :key="manifest.name"
        class="skill-item"
        :class="{ selected: selectedName === manifest.name }"
        @click="$emit('select', manifest)"
      >
        <div class="skill-item-header">
          <span class="skill-name">{{ manifest.name }}</span>
          <span class="skill-source-tag" :class="manifest.source">
            {{ manifest.source === "user" ? "用户" : "内置" }}
          </span>
        </div>
        <div class="skill-desc">{{ manifest.description }}</div>
        <div class="skill-meta">
          <span v-if="manifest.scripts.length > 0" class="meta-item"> {{ manifest.scripts.length }} 个脚本 </span>
          <span v-if="isActive(manifest.name)" class="meta-item active">已激活</span>
        </div>
      </div>
    </div>

    <el-empty v-else description="暂无匹配的技能" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Search } from "lucide-vue-next";
import type { SkillManifest } from "../types";

const props = defineProps<{
  manifests: SkillManifest[];
  activeSkillNames: Set<string>;
  disabledIds: string[];
  selectedName?: string;
}>();

defineEmits<{
  select: [manifest: SkillManifest];
  toggle: [name: string];
}>();

const searchQuery = ref("");
const sourceFilter = ref("");

const filteredManifests = computed(() => {
  let list = props.manifests;

  // 来源过滤
  if (sourceFilter.value) {
    list = list.filter((m) => m.source === sourceFilter.value);
  }

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));
  }

  return list;
});

function isActive(name: string): boolean {
  return props.activeSkillNames.has(name);
}
</script>

<style scoped>
.skill-list-panel {
  width: 320px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 14px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.search-input {
  flex-shrink: 0;
}

.search-input :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
  box-shadow: none;
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s;
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary);
}

.filter-tabs {
  flex-shrink: 0;
}

.skill-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 -4px;
  padding: 0 4px;
}

/* 自定义滚动条 */
.skill-list::-webkit-scrollbar {
  width: 5px;
}

.skill-list::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

.skill-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  background-color: var(--input-bg);
  transition: all 0.2s ease;
  border: var(--border-width) solid transparent;
}

.skill-item:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
  border-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
}

.skill-item.selected {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.08));
}

.skill-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.skill-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

.skill-source-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  background-color: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.12));
  color: var(--el-color-info);
}

.skill-source-tag.user {
  background-color: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.12));
  color: var(--el-color-success);
}

.skill-source-tag.builtin {
  background-color: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.12));
  color: var(--el-color-info);
}

.skill-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.skill-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.meta-item {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.meta-item.active {
  color: var(--el-color-success);
}
</style>
