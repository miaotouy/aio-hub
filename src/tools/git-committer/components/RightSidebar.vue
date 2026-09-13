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

<template>
  <div class="git-committer-right-sidebar">
    <!-- 上半部分：简易 Commit 历史树 -->
    <div class="section-wrapper history-section">
      <div class="section-header">
        <History :size="16" class="history-icon" />
        <span class="section-title">最近提交历史</span>
      </div>
      <div
        ref="historyContentRef"
        class="section-content history-content"
        @scroll="handleHistoryScroll"
      >
        <div v-if="isLoadingHistory" class="loading-wrapper">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon>
          <span class="loading-text text-secondary">正在加载历史...</span>
        </div>
        <div v-else-if="commits.length === 0" class="empty-tip">
          暂无提交记录
        </div>
        <div v-else class="commit-tree">
          <CommitDetailPopover
            v-for="(commit, index) in commits"
            :key="commit.hash"
            :commit="commit"
          >
            <div
              class="commit-node"
              :class="{
                expanded: isExpanded(commit.hash),
                selected: selectedHash === commit.hash,
              }"
            >
              <!-- 连线 -->
              <div class="tree-line-wrapper">
                <div class="tree-dot" />
                <div v-if="index < commits.length - 1" class="tree-line" />
              </div>
              <!-- 提交内容 -->
              <div class="commit-info">
                <div class="commit-msg-row">
                  <ChevronRight
                    :size="12"
                    class="commit-chevron"
                    :class="{ open: isExpanded(commit.hash) }"
                    @click="toggleExpand(commit)"
                  />
                  <span
                    class="commit-msg"
                    :title="commit.message"
                    @click="toggleExpand(commit)"
                  >
                    {{ commit.message }}
                  </span>
                  <el-tooltip content="打开更改" placement="top" :show-after="200">
                    <button
                      class="open-changes-btn"
                      type="button"
                      aria-label="打开更改"
                      @click.stop="openCommitChanges(commit)"
                    >
                      <FileDiff :size="13" />
                    </button>
                  </el-tooltip>
                </div>
                <div class="commit-meta-row" @click="toggleExpand(commit)">
                  <span class="commit-hash">{{
                    commit.hash.substring(0, 7)
                  }}</span>
                  <span class="commit-author">{{ commit.author }}</span>
                  <span class="commit-date">{{ formatTime(commit.date) }}</span>
                </div>

                <!-- 展开的更改文件列表 -->
                <div v-if="isExpanded(commit.hash)" class="commit-files">
                  <div
                    v-if="isLoadingFiles(commit.hash)"
                    class="commit-files-tip"
                  >
                    <el-icon class="is-loading" :size="12"><Loading /></el-icon>
                    <span>正在加载变更...</span>
                  </div>
                  <div
                    v-else-if="filesFor(commit.hash).length === 0"
                    class="commit-files-tip"
                  >
                    无文件变更
                  </div>
                  <div
                    v-else
                    v-for="file in filesFor(commit.hash)"
                    :key="file.path"
                    class="commit-file"
                    :title="file.path"
                    @click.stop="openCommitFile(commit.hash, file.path)"
                  >
                    <FileIcon
                      :file-name="file.path"
                      :size="14"
                      class="commit-file-icon"
                    />
                    <span class="commit-file-name">{{
                      getFileName(file.path)
                    }}</span>
                    <span class="commit-file-dir">{{ getFileDir(file.path) }}</span>
                    <span class="commit-file-stats">
                      <span v-if="file.additions" class="cf-add"
                        >+{{ file.additions }}</span
                      >
                      <span v-if="file.deletions" class="cf-del"
                        >-{{ file.deletions }}</span
                      >
                    </span>
                    <span
                      class="commit-file-status"
                      :class="file.status.toLowerCase()"
                      >{{ file.status }}</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </CommitDetailPopover>
          <div v-if="isLoadingMoreHistory" class="load-more-tip">
            正在加载更多...
          </div>
          <div v-else-if="hasMoreHistory" class="load-more-tip">
            向下滚动加载更多
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
      <div class="section-content chart-content">
        <CommitChart :commits="chartCommits" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { History, BarChart3, ChevronRight, FileDiff } from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { invoke } from "@tauri-apps/api/core";
import { formatDistanceToNow, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import FileIcon from "@/components/common/FileIcon.vue";
import {
  currentRepoPath,
  currentStatus,
} from "../composables/useGitCommitterState";
import CommitChart from "./CommitChart.vue";
import CommitDetailPopover from "./CommitDetailPopover.vue";
import { errorHandler } from "../composables/useGitCommitterErrorHandler";
import {
  clearCommitDetailsCache,
  loadCommitDetail,
} from "../composables/useCommitDetails";
import {
  openCommitChangesTab,
  openCommitFileDiffTab,
} from "../composables/useGitCommitterRunner";
import { getFileName, getFileDir } from "../utils";
import type { CommitFileChange, GitCommitSummary } from "../types";

const commits = ref<GitCommitSummary[]>([]);
const chartCommits = ref<GitCommitSummary[]>([]);
const isLoadingHistory = ref(false);
const isLoadingMoreHistory = ref(false);
const hasMoreHistory = ref(true);
const historySkip = ref(0);
const historyContentRef = ref<HTMLElement | null>(null);
const HISTORY_PAGE_SIZE = 30;
let historyRequestId = 0;

// ===== 展开 / 选中状态（支持同时展开多个提交） =====
const expandedHashes = ref<Set<string>>(new Set());
const selectedHash = ref("");
const loadingHashes = ref<Set<string>>(new Set());
const commitFiles = ref<Record<string, CommitFileChange[]>>({});

const chartCutoff = () => Date.now() - 14 * 24 * 60 * 60 * 1000;

// ===== 加载 Commit 历史 =====
const loadHistoryPage = async (reset = false, requestId = historyRequestId) => {
  if (requestId !== historyRequestId) return;
  if (!currentRepoPath.value || !currentStatus.value?.branch) {
    commits.value = [];
    chartCommits.value = [];
    return;
  }
  const branch = currentStatus.value.branch;
  if (reset) {
    historySkip.value = 0;
    hasMoreHistory.value = true;
    commits.value = [];
  }
  if (
    !hasMoreHistory.value ||
    isLoadingHistory.value ||
    isLoadingMoreHistory.value
  )
    return;
  const isInitial = historySkip.value === 0;
  if (isInitial) isLoadingHistory.value = true;
  else isLoadingMoreHistory.value = true;
  const list = await errorHandler.wrapAsync(
    () =>
      invoke<GitCommitSummary[]>("git_get_incremental_commits", {
        path: currentRepoPath.value,
        branch,
        skip: historySkip.value,
        limit: HISTORY_PAGE_SIZE,
      }),
    { userMessage: "加载提交历史失败", showToUser: false }
  );
  if (requestId !== historyRequestId) return;
  const page = list || [];
  if (page.length < HISTORY_PAGE_SIZE) hasMoreHistory.value = false;
  if (page.length > 0) {
    commits.value = reset ? page : [...commits.value, ...page];
    historySkip.value += page.length;
  }
  if (isInitial) isLoadingHistory.value = false;
  else isLoadingMoreHistory.value = false;
};

const loadChartHistory = async (requestId = historyRequestId) => {
  if (requestId !== historyRequestId) return;
  if (!currentRepoPath.value || !currentStatus.value?.branch) {
    chartCommits.value = [];
    return;
  }
  const branch = currentStatus.value.branch;
  const result: GitCommitSummary[] = [];
  let skip = 0;
  const limit = 200;
  const cutoff = chartCutoff();
  while (true) {
    const list = await errorHandler.wrapAsync(
      () =>
        invoke<GitCommitSummary[]>("git_get_incremental_commits", {
          path: currentRepoPath.value,
          branch,
          skip,
          limit,
        }),
      { userMessage: "加载提交统计失败", showToUser: false }
    );
    if (requestId !== historyRequestId) return;
    const page = list || [];
    result.push(...page);
    if (page.length < limit) break;
    const oldest = page[page.length - 1];
    if (oldest && new Date(oldest.date).getTime() < cutoff) break;
    skip += page.length;
  }
  chartCommits.value = result;
};

const resetInteractionState = () => {
  expandedHashes.value = new Set();
  loadingHashes.value = new Set();
  commitFiles.value = {};
  selectedHash.value = "";
  clearCommitDetailsCache();
};

const loadHistory = async () => {
  const requestId = ++historyRequestId;
  isLoadingHistory.value = false;
  isLoadingMoreHistory.value = false;
  resetInteractionState();
  if (!currentRepoPath.value || !currentStatus.value?.branch) {
    commits.value = [];
    chartCommits.value = [];
    return;
  }
  await Promise.all([
    loadHistoryPage(true, requestId),
    loadChartHistory(requestId),
  ]);
  await nextTick();
  await fillHistoryViewport(requestId);
};

const fillHistoryViewport = async (requestId: number) => {
  while (
    requestId === historyRequestId &&
    hasMoreHistory.value &&
    historyContentRef.value &&
    historyContentRef.value.scrollHeight <= historyContentRef.value.clientHeight
  ) {
    await loadHistoryPage(false, requestId);
    await nextTick();
  }
};

const handleHistoryScroll = (event: Event) => {
  const element = event.target as HTMLElement;
  if (element.scrollHeight - element.scrollTop - element.clientHeight < 80) {
    loadHistoryPage();
  }
};

// ===== 提交展开与文件导航 =====
const isExpanded = (hash: string): boolean => expandedHashes.value.has(hash);

const isLoadingFiles = (hash: string): boolean =>
  loadingHashes.value.has(hash);

const filesFor = (hash: string): CommitFileChange[] =>
  commitFiles.value[hash] || [];

const toggleExpand = async (commit: GitCommitSummary) => {
  selectedHash.value = commit.hash;
  if (expandedHashes.value.has(commit.hash)) {
    expandedHashes.value.delete(commit.hash);
    return;
  }
  expandedHashes.value.add(commit.hash);
  if (commitFiles.value[commit.hash]) return;

  loadingHashes.value.add(commit.hash);
  const detail = await loadCommitDetail(currentRepoPath.value, commit.hash);
  commitFiles.value[commit.hash] = detail?.files || [];
  loadingHashes.value.delete(commit.hash);
};

const openCommitFile = (hash: string, filePath: string) => {
  selectedHash.value = hash;
  openCommitFileDiffTab(hash, filePath);
};

const openCommitChanges = (commit: GitCommitSummary) => {
  selectedHash.value = commit.hash;
  openCommitChangesTab(commit.hash);
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
  min-height: 0;
  position: relative;
}

.history-content {
  overflow-y: auto;
  overflow-x: hidden;
}

.chart-content {
  overflow: hidden;
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

.load-more-tip {
  padding: 8px 0 2px;
  text-align: center;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
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
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.commit-chevron {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.commit-chevron.open {
  transform: rotate(90deg);
}

.commit-hash {
  font-family: monospace;
  font-size: 10px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.commit-msg {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.open-changes-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0;
  height: 20px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-color-primary);
  cursor: pointer;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition:
    width 0.15s ease,
    opacity 0.15s ease,
    background-color 0.15s ease;
}

.commit-node:hover .open-changes-btn,
.commit-node.selected .open-changes-btn,
.open-changes-btn:focus-visible {
  width: 20px;
  opacity: 1;
  pointer-events: auto;
}

.open-changes-btn:hover {
  background-color: var(--el-fill-color-dark);
}

.open-changes-btn:focus-visible {
  outline: 1px solid var(--el-color-primary);
  outline-offset: -1px;
}

.commit-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.commit-author {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-date {
  flex-shrink: 0;
  margin-left: auto;
}

/* 展开的更改文件列表 */
.commit-files {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
  border-left: 1px solid var(--border-color);
  padding-left: 4px;
}

.commit-files-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.commit-file {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  cursor: pointer;
  min-width: 0;
  transition: background-color 0.15s ease;
}

.commit-file:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.06)
  );
}

.commit-file-icon {
  flex-shrink: 0;
}

.commit-file-name {
  flex-shrink: 0;
  max-width: 40%;
  font-size: 11px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-file-dir {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-file-stats {
  flex-shrink: 0;
  display: flex;
  gap: 3px;
  font-size: 10px;
  font-family: monospace;
}

.cf-add {
  color: var(--el-color-success);
}

.cf-del {
  color: var(--el-color-danger);
}

.commit-file-status {
  flex-shrink: 0;
  width: 12px;
  text-align: center;
  font-family: monospace;
  font-weight: bold;
  font-size: 10px;
}

.commit-file-status.m {
  color: var(--el-color-warning);
}
.commit-file-status.a {
  color: var(--el-color-success);
}
.commit-file-status.d {
  color: var(--el-color-danger);
}
.commit-file-status.r,
.commit-file-status.c,
.commit-file-status.t {
  color: var(--el-color-info);
}
</style>
