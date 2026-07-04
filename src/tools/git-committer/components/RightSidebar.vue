<template>
  <div class="git-committer-right-sidebar">
    <!-- 上半部分：简易 Commit 历史树 -->
    <div class="section-wrapper history-section">
      <div class="section-header">
        <History :size="16" class="history-icon" />
        <span class="section-title">最近提交历史</span>
      </div>
      <div class="section-content">
        <div v-if="isLoadingHistory" class="loading-wrapper">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon>
          <span class="loading-text text-secondary">正在加载历史...</span>
        </div>
        <div v-else-if="commits.length === 0" class="empty-tip">
          暂无提交记录
        </div>
        <div v-else class="commit-tree">
          <div
            v-for="(commit, index) in commits"
            :key="commit.hash"
            class="commit-node"
          >
            <!-- 连线 -->
            <div class="tree-line-wrapper">
              <div class="tree-dot" />
              <div v-if="index < commits.length - 1" class="tree-line" />
            </div>
            <!-- 提交内容 -->
            <div class="commit-info">
              <div class="commit-msg-row">
                <span class="commit-hash">{{
                  commit.hash.substring(0, 7)
                }}</span>
                <span class="commit-msg" :title="commit.message">{{
                  commit.message
                }}</span>
              </div>
              <div class="commit-meta-row">
                <span class="commit-author">{{ commit.author }}</span>
                <span class="commit-date">{{ formatTime(commit.date) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 下半部分：提交统计图表 -->
    <div class="section-wrapper chart-section">
      <div class="section-header">
        <BarChart3 :size="16" class="chart-icon" />
        <span class="section-title">近 14 天提交频次</span>
      </div>
      <div class="section-content">
        <CommitChart :commits="commits" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { History, BarChart3 } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { invoke } from "@tauri-apps/api/core";
import { formatDistanceToNow, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  currentRepoPath,
  currentStatus,
} from "../composables/useGitCommitterState";
import CommitChart from "./CommitChart.vue";

interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

const commits = ref<GitCommit[]>([]);
const isLoadingHistory = ref(false);

// ===== 加载 Commit 历史 =====
const loadHistory = async () => {
  if (!currentRepoPath.value || !currentStatus.value?.branch) {
    commits.value = [];
    return;
  }
  isLoadingHistory.value = true;
  try {
    const list = await invoke<GitCommit[]>("git_get_branch_commits", {
      path: currentRepoPath.value,
      branch: currentStatus.value.branch,
      limit: 20,
    });
    commits.value = list || [];
  } catch (e) {
    console.error("加载 Commit 历史失败", e);
    commits.value = [];
  } finally {
    isLoadingHistory.value = false;
  }
};

// 监听当前仓库或分支变化，重新加载历史
watch(
  [currentRepoPath, () => currentStatus.value?.branch],
  () => {
    loadHistory();
  },
  { immediate: true }
);

// ===== 格式化时间 =====
const formatTime = (dateStr: string) => {
  try {
    return formatDistanceToNow(parseISO(dateStr), {
      addSuffix: true,
      locale: zhCN,
    });
  } catch {
    return dateStr;
  }
};
</script>

<style scoped>
.git-committer-right-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex-shrink: 0;
  border-left: var(--border-width) solid var(--border-color);
}

.section-wrapper {
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow: hidden;
  box-sizing: border-box;
}

.history-section {
  flex: 1;
  border-bottom: var(--border-width) solid var(--border-color);
}

.chart-section {
  height: 220px;
  flex-shrink: 0;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.history-icon {
  margin-right: 6px;
}

.chart-icon {
  margin-right: 6px;
}

.loading-text {
  margin-left: 8px;
  font-size: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-content {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.loading-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-tip {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

/* Commit 历史树 */
.commit-tree {
  display: flex;
  flex-direction: column;
}

.commit-node {
  display: flex;
  gap: 12px;
  position: relative;
  padding-bottom: 12px;
}

.tree-line-wrapper {
  width: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.tree-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  border: 2px solid var(--card-bg);
  z-index: 2;
  margin-top: 4px;
}

.tree-line {
  width: 2px;
  flex: 1;
  background-color: var(--border-color);
  margin-top: -2px;
  margin-bottom: -12px;
}

.commit-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.commit-msg-row {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.commit-hash {
  font-family: monospace;
  font-size: 11px;
  color: var(--el-color-primary);
  font-weight: bold;
  flex-shrink: 0;
}

.commit-msg {
  font-size: 12px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.commit-author {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.commit-date {
  flex-shrink: 0;
}
</style>
