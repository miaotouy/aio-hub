<template>
  <div class="commits-container" v-loading="loading">
    <div class="commit-list" v-if="filteredCommits.length > 0">
      <el-timeline>
        <el-timeline-item
          v-for="commit in paginatedCommits"
          :key="commit.hash"
          :timestamp="formatDate(commit.date)"
          placement="top"
        >
          <el-card @click="$emit('select-commit', commit)" class="commit-card">
            <div class="commit-header">
              <span class="commit-sequence"
                >#{{ getOriginalIndex(commit) }}</span
              >
              <el-tag size="small">
                {{ commit.hash.substring(0, 7) }}
              </el-tag>
              <span class="commit-author">{{ commit.author }}</span>
              <el-popover v-if="commit.tags && commit.tags.length > 0" placement="top">
                <template #reference>
                  <el-tag type="warning" size="small">
                    <el-icon>
                      <PriceTag />
                    </el-icon>
                    {{ commit.tags.length }}
                  </el-tag>
                </template>
                <div>
                  <el-tag v-for="tag in commit.tags" :key="tag" style="margin: 2px">
                    {{ tag }}
                  </el-tag>
                </div>
              </el-popover>
            </div>
            <div class="commit-message">{{ commit.message }}</div>
            <div class="commit-stats" v-if="commit.stats">
              <el-space size="small">
                <span class="stat-item additions">+{{ commit.stats.additions }}</span>
                <span class="stat-item deletions">-{{ commit.stats.deletions }}</span>
                <span class="stat-item files">{{ commit.stats.files }} 文件</span>
              </el-space>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>

      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="filteredCommits.length"
        layout="prev, pager, next"
        style="margin-top: 20px; justify-content: center"
      />
    </div>

    <el-empty v-else description="暂无提交记录" />
  </div>
</template>

<script setup lang="ts">
import { PriceTag } from "@element-plus/icons-vue";
import type { GitCommit } from "../types";

interface Props {
  loading: boolean;
  commits: GitCommit[];
  filteredCommits: GitCommit[];
  paginatedCommits: GitCommit[];
  currentPage: number;
  pageSize: number;
}

const props = defineProps<Props>();

const currentPage = defineModel<number>("currentPage", { required: true });

defineEmits<{
  "select-commit": [commit: GitCommit];
}>();

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 获取提交在原始列表中的索引（从1开始）
function getOriginalIndex(commit: GitCommit): number {
  const index = props.commits.findIndex(c => c.hash === commit.hash);
  return index !== -1 ? index + 1 : 0;
}
</script>

<style scoped>
.commits-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.commit-list {
  padding: 10px;
}

.commit-card {
  cursor: pointer;
  transition: all 0.3s;
  background: var(--container-bg) !important;
}

.commit-card:hover {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
}

:deep(.el-card) {
  background: var(--container-bg);
  border-color: var(--border-color-light);
}

:deep(.el-card__header) {
  background: var(--card-bg);
  border-bottom-color: var(--border-color-light);
}

.commit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.commit-sequence {
  font-weight: bold;
  font-size: 14px;
  color: var(--el-color-primary);
}

.commit-author {
  color: var(--text-color-light);
  font-size: 12px;
}

.commit-message {
  font-size: 14px;
  color: var(--text-color);
  margin-bottom: 4px;
}

.commit-stats {
  font-size: 12px;
}

.stat-item {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-color-light);
}

.additions {
  color: #67c23a;
}

.deletions {
  color: var(--error-color);
}

.files {
  color: var(--text-color-light);
}

:deep(.el-tag--warning) {
  background: rgba(230, 162, 60, 0.1);
  border-color: rgba(230, 162, 60, 0.3);
  color: #e6a23c;
}

:deep(.el-pagination) {
  display: flex;
}

:deep(.el-loading-mask) {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>