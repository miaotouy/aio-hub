<template>
  <div class="control-panel">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-row :gutter="12" align="middle">
        <el-col :span="10">
          <DropZone
            drop-id="git-analyzer-path"
            variant="input"
            :directory-only="true"
            :multiple="false"
            :auto-execute="true"
            hide-content
            @drop="handlePathDrop"
          >
            <div class="path-input-group">
              <el-input
                v-model="repoPath"
                placeholder="仓库路径（支持拖拽，留空使用当前目录）"
                clearable
                @keyup.enter="$emit('load-repository')"
              />
              <el-button @click="$emit('select-directory')" :icon="FolderOpened">选择</el-button>
            </div>
          </DropZone>
        </el-col>
        <el-col :span="6">
          <el-select
            v-model="selectedBranch"
            placeholder="选择分支"
            @change="$emit('branch-change', $event)"
            style="width: 100%"
          >
            <el-option
              v-for="branch in branches"
              :key="branch.name"
              :label="branch.current ? `${branch.name} (当前)` : branch.name"
              :value="branch.name"
            />
          </el-select>
        </el-col>
        <el-col :span="3">
          <el-tooltip content="设置要加载的提交记录数量" placement="top">
            <el-input-number
              v-model="limitCount"
              :min="10"
              :max="5000"
              :step="10"
              placeholder="显示条数"
              style="width: 100%"
            />
          </el-tooltip>
        </el-col>
        <el-col :span="2">
          <el-button type="primary" @click="$emit('load-repository')" :loading="loading">
            加载仓库
          </el-button>
        </el-col>
      </el-row>
    </div>

    <!-- 筛选器 -->
    <div class="filters">
      <el-row :gutter="12">
        <el-col :span="6">
          <el-input
            v-model="searchQuery"
            placeholder="搜索提交信息..."
            clearable
            @input="$emit('filter-commits')"
          >
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>
        </el-col>
        <el-col :span="8">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="$emit('filter-commits')"
            style="width: 100%"
            size="default"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-col>
        <div style="width: 20px"></div>
        <el-col :span="5">
          <el-input
            v-model="authorFilter"
            placeholder="作者筛选"
            clearable
            @input="$emit('filter-commits')"
          />
        </el-col>
        <el-col :span="2">
          <el-checkbox v-model="reverseOrder" @change="$emit('filter-commits')">
            倒序排列
          </el-checkbox>
        </el-col>
        <el-col :span="2">
          <el-button @click="$emit('clear-filters')" :icon="Refresh"> 清除 </el-button>
        </el-col>
      </el-row>
    </div>

    <!-- 范围选择器 -->
    <div class="range-selector" v-if="commits.length > 0">
      <el-row :gutter="16" align="middle">
        <el-col :span="3">
          <span class="range-label">提交范围:</span>
        </el-col>
        <el-col :span="16">
          <el-slider
            v-model="commitRange"
            :max="commits.length"
            range
            :disabled="commits.length === 0"
            @change="$emit('filter-commits')"
            :marks="{ [0]: '最新', [commits.length]: '最旧' }"
          />
        </el-col>
        <el-col :span="5">
          <span class="range-label"
            >范围: {{ commitRange[0] }} - {{ commitRange[1] }} (共
            {{ commitRange[1] - commitRange[0] }} 条)</span
          >
        </el-col>
      </el-row>
    </div>

    <!-- 统计信息 -->
    <div class="statistics" v-if="commits.length > 0">
      <el-row :gutter="16">
        <el-col :span="6">
          <div class="stat-item-compact">
            <span class="stat-value">{{ statistics.totalCommits }}</span>
            <span class="stat-label">总提交数</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item-compact">
            <span class="stat-value">{{ statistics.contributors }}</span>
            <span class="stat-label">贡献者数</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item-compact">
            <span class="stat-value">{{ statistics.timeSpan }}</span>
            <span class="stat-label">时间跨度(天)</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item-compact">
            <span class="stat-value">{{ statistics.averagePerDay.toFixed(1) }}</span>
            <span class="stat-label">平均提交/天</span>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Search, Refresh, FolderOpened } from "@element-plus/icons-vue";
import DropZone from "@/components/common/DropZone.vue";
import type { GitCommit, GitBranch } from "../types";

interface Props {
  loading: boolean;
  repoPath: string;
  selectedBranch: string;
  branches: GitBranch[];
  commits: GitCommit[];
  limitCount: number;
  commitRange: [number, number];
  searchQuery: string;
  dateRange: Date[] | null;
  authorFilter: string;
  reverseOrder: boolean;
  statistics: {
    totalCommits: number;
    contributors: number;
    timeSpan: number;
    averagePerDay: number;
  };
}

defineProps<Props>();

const emit = defineEmits<{
  "update:repoPath": [value: string];
  "update:selectedBranch": [value: string];
  "update:limitCount": [value: number];
  "update:commitRange": [value: [number, number]];
  "update:searchQuery": [value: string];
  "update:dateRange": [value: Date[] | null];
  "update:authorFilter": [value: string];
  "update:reverseOrder": [value: boolean];
  "select-directory": [];
  "load-repository": [];
  "branch-change": [branch: string];
  "filter-commits": [];
  "clear-filters": [];
}>();

// 由于使用了 v-model，需要定义对应的计算属性
const repoPath = defineModel<string>("repoPath", { required: true });
const selectedBranch = defineModel<string>("selectedBranch", { required: true });
const limitCount = defineModel<number>("limitCount", { required: true });
const commitRange = defineModel<[number, number]>("commitRange", { required: true });
const searchQuery = defineModel<string>("searchQuery", { required: true });
const dateRange = defineModel<Date[] | null>("dateRange", { required: true });
const authorFilter = defineModel<string>("authorFilter", { required: true });
const reverseOrder = defineModel<boolean>("reverseOrder", { required: true });

function handlePathDrop(paths: string[]) {
  emit("update:repoPath", paths[0]);
  emit("load-repository");
}
</script>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.toolbar {
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
}

.path-input-group {
  display: flex;
  gap: 10px;
}

.filters {
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
}

.range-selector {
  padding: 12px 16px 20px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
}

.range-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
}

.statistics {
  padding: 8px 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
}

.stat-item-compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 4px 0;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-color-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 2px;
  line-height: 1;
}

:deep(.el-date-editor .el-range-separator) {
  padding: 0 4px;
  line-height: 32px;
}

:deep(.el-date-editor .el-range-input) {
  font-size: 13px;
}
</style>